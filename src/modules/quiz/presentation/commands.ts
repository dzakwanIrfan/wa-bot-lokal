import type { Client, GroupChat, Message } from "whatsapp-web.js";

import type { CommandHandler } from "../../../router.js";
import { QuizRuntime } from "../application/quiz-runtime.js";
import { normalizeQuizTopic, parseQuizStart } from "../domain/game.js";
import type { QuizMode } from "../application/evaluate-attempt.js";

const HELP = [
  "🎮 *WhatsApp Quiz*",
  "/kuis [strict|chaos] [topik] — mulai permainan",
  "/requestkuis [topik] — minta bank soal baru",
  "/klasemen — 10 pemain teratas musim ini",
  "/pause dan /resume — khusus admin grup",
  "/stop — hentikan kuis (khusus admin grup)",
  "",
  "Strict: satu percobaan per pemain. Chaos: percobaan bebas; setiap pemain hanya mendapat poin sekali per soal.",
].join("\n");

async function actor(
  message: Message,
  client: Client,
): Promise<{ id: string; name?: string } | null> {
  const id = message.author?.trim() || (message.fromMe ? client.info?.wid._serialized : "");
  if (!/^[^@]+@(c\.us|lid)$/.test(id)) return null;
  const contact = await message.getContact().catch(() => null);
  return { id, name: contact?.name || contact?.pushname || undefined };
}

async function isGroupAdmin(message: Message): Promise<boolean> {
  if (message.fromMe) return true;
  const author = message.author;
  if (!author) return false;
  const chat = await message.getChat();
  if (!chat.isGroup) return false;
  return (chat as GroupChat).participants.some(
    (participant) =>
      participant.id._serialized === author &&
      (participant.isAdmin || participant.isSuperAdmin),
  );
}

export function createQuizCommands(
  client: Client,
  runtime: QuizRuntime,
  defaultMode: QuizMode,
): ReadonlyMap<string, CommandHandler> {
  const safe = (name: string, handler: CommandHandler): CommandHandler =>
    async (message, groupId) => {
      try {
        await handler(message, groupId);
      } catch (error) {
        console.error(
          `${name} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error"}`,
        );
        await message.reply("Maaf, command kuis gagal diproses. Coba lagi sebentar.").catch(() => undefined);
      }
    };
  const help: CommandHandler = async (message) => {
    await message.reply(HELP);
  };

  const start: CommandHandler = async (message, groupId) => {
    const request = parseQuizStart(message.body, defaultMode);
    if (!request) {
      await message.reply("Format: /kuis [strict|chaos] [topik]. Contoh: /kuis chaos sejarah");
      return;
    }
    const sender = await actor(message, client);
    if (!sender) {
      await message.reply("Identitas WhatsApp pengirim tidak dapat dibaca. Coba kirim ulang.");
      return;
    }

    const result = await runtime.game.start(groupId, sender.id, sender.name, request);
    if (result.kind === "already-active") {
      await message.reply("Masih ada kuis aktif di grup ini. Selesaikan dulu atau minta admin memakai /pause.");
      return;
    }
    if (result.kind === "questions-queued") {
      await message.reply(
        `Bank soal belum cukup (${result.missing} kurang). Batch #${result.batchId} sedang dibuat di background.`,
      );
      return;
    }

    for (const output of result.messages) await client.sendMessage(groupId, output);
    await runtime.game.markOutboxPublished(result.outboxIds);
  };

  const requestQuestions: CommandHandler = async (message, groupId) => {
    const topic = normalizeQuizTopic(
      message.body.trim().replace(/^\/requestkuis(?:\s+|$)/i, ""),
    );
    if (!topic) {
      await message.reply("Format: /requestkuis [topik]. Contoh: /requestkuis film Indonesia");
      return;
    }
    const sender = await actor(message, client);
    if (!sender) {
      await message.reply("Identitas WhatsApp pengirim tidak dapat dibaca. Coba kirim ulang.");
      return;
    }
    const result = await runtime.game.requestQuestions(groupId, sender.id, sender.name, topic);
    await message.reply(
      `Permintaan batch #${result.batchId} diterima: *${topic}*, tingkat ${result.difficulty}/5.`,
    );
  };

  const leaderboard: CommandHandler = async (message, groupId) => {
    const rows = await runtime.game.leaderboard(groupId);
    await message.reply(
      rows.length ? `🏆 *Klasemen Musim Ini*\n${rows.join("\n")}` : "Belum ada poin pada musim ini.",
    );
  };

  const control = (paused: boolean): CommandHandler => async (message, groupId) => {
    if (!(await isGroupAdmin(message))) {
      await message.reply("Command ini hanya bisa dipakai admin grup.");
      return;
    }
    const result = await runtime.game.setPaused(groupId, paused);
    if (result === "no-active") {
      await message.reply("Tidak ada kuis aktif di grup ini.");
      return;
    }
    if (result === "already-set") {
      await message.reply(paused ? "Kuis memang sedang dijeda." : "Kuis sudah berjalan.");
      return;
    }
    await message.reply(paused ? "⏸️ Kuis dijeda oleh admin." : "▶️ Kuis dilanjutkan. Waktu soal dimulai ulang.");
    if (!paused) await runtime.advanceGroup(groupId);
  };

  const stop: CommandHandler = async (message, groupId) => {
    if (!(await isGroupAdmin(message))) {
      await message.reply("Command ini hanya bisa dipakai admin grup.");
      return;
    }
    const result = await runtime.game.stop(groupId);
    if (result.kind === "no-active") {
      await message.reply("Tidak ada kuis aktif di grup ini.");
      return;
    }
    await message.reply("⏹️ Kuis dihentikan oleh admin.");
    await runtime.game.markOutboxPublished(result.outboxIds);
  };

  return new Map([
    ["/help", safe("/help", help)],
    ["/start", safe("/start", help)],
    ["/kuis", safe("/kuis", start)],
    ["/requestkuis", safe("/requestkuis", requestQuestions)],
    ["/klasemen", safe("/klasemen", leaderboard)],
    ["/pause", safe("/pause", control(true))],
    ["/resume", safe("/resume", control(false))],
    ["/stop", safe("/stop", stop)],
  ]);
}
