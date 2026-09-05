import type { QuizMode } from "../application/evaluate-attempt.js";

export type QuizStartRequest = Readonly<{
  mode: QuizMode;
  topic: string;
}>;

const MAX_TOPIC_LENGTH = 60;
const JAKARTA_OFFSET_MILLISECONDS = 7 * 60 * 60 * 1_000;

export function normalizeQuizTopic(value: string): string | null {
  const topic = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("id-ID");
  return topic && [...topic].length <= MAX_TOPIC_LENGTH ? topic : null;
}

export function parseQuizStart(
  text: string,
  defaultMode: QuizMode,
): QuizStartRequest | null {
  const input = text.trim().replace(/^\/kuis(?:\s+|$)/i, "").trim();
  if (!input) return { mode: defaultMode, topic: "campuran" };

  const [first, ...rest] = input.split(/\s+/u);
  const mode = first === "strict" || first === "chaos" ? first : defaultMode;
  const topicInput = mode === first ? rest.join(" ") || "campuran" : input;
  const topic = normalizeQuizTopic(topicInput);
  return topic ? { mode, topic } : null;
}

export function jakartaMonthBounds(now: Date): Readonly<{
  name: string;
  startsAt: Date;
  endsAt: Date;
}> {
  const local = new Date(now.getTime() + JAKARTA_OFFSET_MILLISECONDS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const startsAt = new Date(Date.UTC(year, month, 1) - JAKARTA_OFFSET_MILLISECONDS);
  const endsAt = new Date(Date.UTC(year, month + 1, 1) - JAKARTA_OFFSET_MILLISECONDS);

  return {
    name: `${year}-${String(month + 1).padStart(2, "0")}`,
    startsAt,
    endsAt,
  };
}

export function adaptiveDifficulty(winRate: number | null): number {
  if (winRate === null) return 3;
  if (winRate >= 0.75) return 5;
  if (winRate >= 0.6) return 4;
  if (winRate >= 0.4) return 3;
  if (winRate >= 0.25) return 2;
  return 1;
}
