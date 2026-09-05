const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export type AppConfig = Readonly<{
  geminiApiKey: string;
  geminiModel: string;
  replyStylePrompt: string;
  targetPhoneNumbers: ReadonlySet<string>;
}>;

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

export function parseTargetPhoneNumbers(raw: string): ReadonlySet<string> {
  let values: unknown;

  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error("TARGET_PHONE_NUMBERS must be a JSON array of strings.");
  }

  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error("TARGET_PHONE_NUMBERS must be a non-empty JSON array of strings.");
  }

  return new Set(values.map(normalizePhoneNumber));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    geminiApiKey: requireEnv(env, "GEMINI_API_KEY"),
    geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    replyStylePrompt: env.REPLY_STYLE_PROMPT?.trim() || "",
    targetPhoneNumbers: parseTargetPhoneNumbers(
      requireEnv(env, "TARGET_PHONE_NUMBERS"),
    ),
  };
}
