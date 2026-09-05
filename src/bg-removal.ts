const PHOTOROOM_URL = "https://sdk.photoroom.com/v1/segment";
const TIMEOUT_MS = 60_000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

const SUPPORTED_MEDIA = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
]);

export type BackgroundRemovalInput = Readonly<{
  data: string;
  mimetype: string;
}>;

export type BackgroundRemovalErrorCode =
  | "unsupported-media"
  | "input-too-large"
  | "unauthorized"
  | "rate-limit"
  | "timeout"
  | "provider";

export class BackgroundRemovalError extends Error {
  constructor(
    readonly code: BackgroundRemovalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackgroundRemovalError";
  }
}

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function normalizeMimetype(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isPng(data: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => data[index] === byte);
}

async function responseDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    return "";
  }
}

export async function removeBackground(
  input: BackgroundRemovalInput,
  apiKey: string,
  request: Fetcher = fetch,
): Promise<Uint8Array> {
  const mimetype = normalizeMimetype(input.mimetype);
  const extension = SUPPORTED_MEDIA.get(mimetype);
  if (!extension) {
    throw new BackgroundRemovalError(
      "unsupported-media",
      `Unsupported image type: ${mimetype || "unknown"}.`,
    );
  }

  if (Buffer.byteLength(input.data, "base64") > MAX_INPUT_BYTES) {
    throw new BackgroundRemovalError(
      "input-too-large",
      `Image exceeds the ${MAX_INPUT_BYTES} byte limit.`,
    );
  }
  const source = Buffer.from(input.data, "base64");

  const form = new FormData();
  form.append(
    "image_file",
    new Blob([Uint8Array.from(source)], { type: mimetype }),
    `input.${extension}`,
  );
  form.append("format", "png");
  form.append("channels", "rgba");
  form.append("size", "full");

  let response: Response;
  try {
    response = await request(PHOTOROOM_URL, {
      method: "POST",
      headers: {
        Accept: "image/png",
        "x-api-key": apiKey,
      },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new BackgroundRemovalError(
        "timeout",
        `PhotoRoom request timed out after ${TIMEOUT_MS} ms.`,
      );
    }
    throw new BackgroundRemovalError(
      "provider",
      `PhotoRoom request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (!response.ok) {
    const detail = await responseDetail(response);
    const suffix = detail ? `: ${detail}` : "";
    const code =
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : response.status === 429
          ? "rate-limit"
          : "provider";
    throw new BackgroundRemovalError(
      code,
      `PhotoRoom returned HTTP ${response.status}${suffix}`,
    );
  }

  const result = new Uint8Array(await response.arrayBuffer());
  if (!isPng(result)) {
    throw new BackgroundRemovalError(
      "provider",
      "PhotoRoom returned an invalid PNG response.",
    );
  }
  return result;
}
