export type QuizMode = "strict" | "chaos";

export type QuizAttemptInput = Readonly<{
  groupId: string;
  participantWhatsAppId: string;
  whatsappMessageId: string;
  answerText: string;
  receivedAt: Date;
}>;

export type QuizAttemptKind =
  | "inactive"
  | "paused"
  | "no-round"
  | "duplicate"
  | "already-attempted"
  | "already-scored"
  | "incorrect"
  | "expired"
  | "correct";

export type QuizAttemptOutcome = Readonly<{
  handled: boolean;
  kind: QuizAttemptKind;
  points?: number;
  firstBlood?: boolean;
  bossProgress?: number;
  bossRequired?: number;
  bossReset?: boolean;
  bossEnded?: boolean;
  bossDefeated?: boolean;
  bossBonusPoints?: number;
  outboxIds?: readonly string[];
}>;

export type EvaluateQuizAttempt = (
  input: QuizAttemptInput,
) => Promise<QuizAttemptOutcome>;
