import { readFileSync } from "node:fs";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const REPLY_STYLE_PROMPT_URL = new URL(
  "../prompts/reply-style.md",
  import.meta.url,
);

export type AppConfig = Readonly<{
  geminiApiKey: string;
  geminiModel: string;
  photoroomApiKey: string;
  databaseUrl: string | null;
  quiz: Readonly<{
    defaultMode: "strict" | "chaos";
    questionCount: number;
    bossEvery: number;
    batchSize: number;
    durationSeconds: number;
    tickMilliseconds: number;
    generationIntervalMilliseconds: number;
  }>;
  replyStylePrompt: string;
  targetPhoneNumbers: ReadonlySet<string>;
  targetGroupIds: ReadonlySet<string>;
}>;

function integerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadReplyStylePrompt(): string {
  const prompt = readFileSync(REPLY_STYLE_PROMPT_URL, "utf8").trim();
  if (!prompt) throw new Error("prompts/reply-style.md must not be empty.");
  return prompt;
}

export function normalizePhoneNumber(value: string): string {
  const normalized = value.trim().replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error(
      `Invalid phone number "${value}". Use an international number such as 628123456789.`,
    );
  }
  return normalized;
}

function parseStringArray(
  raw: string,
  name: string,
  allowEmpty = false,
): string[] {
  let values: unknown;

  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON array of strings.`);
  }

  if (
    !Array.isArray(values) ||
    (!allowEmpty && values.length === 0) ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error(
      `${name} must be a${allowEmpty ? "" : " non-empty"} JSON array of strings.`,
    );
  }

  return values;
}

export function parseTargetPhoneNumbers(raw: string): ReadonlySet<string> {
  return new Set(
    parseStringArray(raw, "TARGET_PHONE_NUMBERS").map(normalizePhoneNumber),
  );
}

export function normalizeGroupId(value: string): string {
  const normalized = value.trim();
  if (!/^\d+(?:-\d+)?@g\.us$/.test(normalized)) {
    throw new Error(
      `Invalid group ID "${value}". Use the WhatsApp format 120363000000000000@g.us.`,
    );
  }
  return normalized;
}

export function parseTargetGroupIds(raw: string): ReadonlySet<string> {
  return new Set(
    parseStringArray(raw, "TARGET_GROUP_IDS", true).map(normalizeGroupId),
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const questionCount = integerEnv(env, "QUIZ_QUESTION_COUNT", 10, 1, 50);
  const bossEvery = integerEnv(env, "QUIZ_BOSS_EVERY", 5, 0, 50);
  if (bossEvery > questionCount) {
    throw new Error("QUIZ_BOSS_EVERY must be 0 or no greater than QUIZ_QUESTION_COUNT.");
  }
  const defaultMode = env.QUIZ_DEFAULT_MODE?.trim().toLowerCase() || "strict";
  if (defaultMode !== "strict" && defaultMode !== "chaos") {
    throw new Error("QUIZ_DEFAULT_MODE must be strict or chaos.");
  }

  return {
    geminiApiKey: requireEnv(env, "GEMINI_API_KEY"),
    geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    photoroomApiKey: requireEnv(env, "PHOTOROOM_API_KEY"),
    databaseUrl: env.DATABASE_URL?.trim() || null,
    quiz: {
      defaultMode,
      questionCount,
      bossEvery,
      batchSize: integerEnv(env, "QUIZ_BATCH_SIZE", 20, 1, 100),
      durationSeconds: integerEnv(env, "QUIZ_DURATION_SECONDS", 30, 5, 300),
      tickMilliseconds: integerEnv(env, "QUIZ_TICK_MILLISECONDS", 1_000, 250, 60_000),
      generationIntervalMilliseconds:
        integerEnv(env, "QUIZ_GENERATION_INTERVAL_SECONDS", 15, 5, 3_600) * 1_000,
    },
    replyStylePrompt: loadReplyStylePrompt(),
    targetPhoneNumbers: parseTargetPhoneNumbers(
      requireEnv(env, "TARGET_PHONE_NUMBERS"),
    ),
    targetGroupIds: parseTargetGroupIds(env.TARGET_GROUP_IDS?.trim() || "[]"),
  };
}
