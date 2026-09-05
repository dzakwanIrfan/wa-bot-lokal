import type { Message } from "whatsapp-web.js";

import { serializedMessageId } from "../../../media.js";
import type { QuizAttemptOutcome } from "../application/evaluate-attempt.js";
import { PostgresQuizEngine } from "../infrastructure/postgres-quiz-engine.js";

const WHATSAPP_USER_ID = /^[^@]+@(c\.us|lid)$/;

function replyFor(outcome: QuizAttemptOutcome): string | null {
  if (outcome.kind === "already-attempted") {
    return "Mode Strict: kamu sudah memakai 1 kesempatan untuk soal ini.";
  }
  if (outcome.kind === "expired" && outcome.bossEnded) {
    return "⏰ Waktu Boss habis. Boss Raid berakhir.";
  }
  if (outcome.kind === "expired") {
    return "⏰ Waktu untuk soal ini sudah habis.";
  }
  if (outcome.kind === "incorrect" && outcome.bossReset) {
    return `❌ Salah. Progress Boss kembali ke 0/${outcome.bossRequired}.`;
  }
  if (outcome.kind !== "correct") return null;

  if (outcome.bossDefeated) {
    return `👑 Boss berhasil dikalahkan! +${outcome.points} poin untuk jawaban ini dan bonus +${outcome.bossBonusPoints} untuk setiap kontributor.`;
  }
  if (outcome.bossProgress !== undefined) {
    return `⚔️ Benar! Boss ${outcome.bossProgress}/${outcome.bossRequired}. +${outcome.points} poin.`;
  }
  if (outcome.firstBlood) {
    return `⚡ First Blood! Jawaban benar, +${outcome.points} poin.`;
  }
  return `✅ Jawaban benar, +${outcome.points} poin.`;
}

export function createQuizGroupTextHandler(
  engine: PostgresQuizEngine,
  afterAttempt?: (groupId: string, outcome: QuizAttemptOutcome) => Promise<void>,
  selfWhatsAppId?: () => string | undefined,
) {
  return async (message: Message, groupId: string, receivedAt: Date) => {
    const participantWhatsAppId = message.fromMe
      ? selfWhatsAppId?.()?.trim()
      : message.author?.trim();
    const whatsappMessageId = serializedMessageId(message).trim();

    if (
      !participantWhatsAppId ||
      !WHATSAPP_USER_ID.test(participantWhatsAppId) ||
      !whatsappMessageId
    ) {
      return { handled: false } as const;
    }

    const outcome = await engine.evaluateAttempt({
      groupId,
      participantWhatsAppId,
      whatsappMessageId,
      answerText: message.body,
      receivedAt,
    });
    const reply = replyFor(outcome);

    const shouldAdvance = outcome.kind === "correct" || outcome.kind === "expired";
    return {
      handled: outcome.handled,
      afterCommit:
        outcome.handled && (reply || shouldAdvance)
          ? async () => {
              try {
                if (reply) {
                  await message.reply(reply);
                  await engine.markOutboxPublished(outcome.outboxIds ?? []);
                }
              } finally {
                if (shouldAdvance) await afterAttempt?.(groupId, outcome);
              }
            }
          : undefined,
    } as const;
  };
}
