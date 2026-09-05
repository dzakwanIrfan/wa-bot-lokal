import whatsapp from "whatsapp-web.js";
import type {
  Client,
  Message,
  MessageMedia as MessageMediaType,
} from "whatsapp-web.js";

const { MessageMedia } = whatsapp;

export const TEXT_STICKER_COMMAND = "/sticker-text";
export const IMAGE_STICKER_COMMAND = "/sticker";
const MAX_TEXT_LENGTH = 160;
const MAX_EXPLICIT_LINES = 10;
const USAGE = `Format: ${TEXT_STICKER_COMMAND} "contoh tulisan"\nMaksimal ${MAX_TEXT_LENGTH} karakter dan ${MAX_EXPLICIT_LINES} baris.`;
const IMAGE_USAGE =
  "Kirim gambar dengan caption /sticker, atau reply gambar dengan /sticker.";

type CompatibleMessageId = Message["id"] & { $1?: string };

function ensureSerializedMessageId(message: Message): void {
  const id = message.id as CompatibleMessageId;
  if (id._serialized) return;

  const serialized =
    id.$1 ??
    (typeof id.fromMe === "boolean" && id.remote && id.id
      ? `${id.fromMe}_${id.remote}_${id.id}`
      : null);
  if (!serialized) throw new Error("Message ID cannot be serialized.");

  id._serialized = serialized;
}

export function parseTextStickerCommand(input: string): string | null {
  const match = input
    .trim()
    .match(/^\/sticker-text\s+(?:"([\s\S]*)"|“([\s\S]*)”)$/i);
  const text = (match?.[1] ?? match?.[2])?.replace(/\r\n?/g, "\n").trim();

  if (
    !text ||
    [...text].length > MAX_TEXT_LENGTH ||
    text.split("\n").length > MAX_EXPLICIT_LINES
  ) {
    return null;
  }

  return text;
}

export async function createTextStickerMedia(
  client: Client,
  text: string,
): Promise<InstanceType<typeof MessageMedia>> {
  const page = client.pupPage;
  if (!page) throw new Error("WhatsApp browser page is not ready.");

  const data = await page.evaluate((sourceText) => {
    const size = 512;
    const margin = 28;
    const maxWidth = size - margin * 2;
    const maxHeight = size - margin * 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) throw new Error("Canvas is not available.");
    const context = canvasContext;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#000000";
    context.textBaseline = "top";

    function wrapParagraph(paragraph: string): string[] {
      if (!paragraph) return [""];

      const words = paragraph.split(/\s+/);
      const lines: string[] = [];
      let line = "";

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }

        if (line) lines.push(line);
        line = "";

        for (const character of word) {
          const chunk = line + character;
          if (line && context.measureText(chunk).width > maxWidth) {
            lines.push(line);
            line = character;
          } else {
            line = chunk;
          }
        }
      }

      if (line) lines.push(line);
      return lines;
    }

    let fontSize = 164;
    let lines: string[] = [];
    let lineHeight = 0;

    for (; fontSize >= 32; fontSize -= 4) {
      context.font = `${fontSize}px Arial, Helvetica, sans-serif`;
      lines = sourceText
        .split("\n")
        .flatMap((paragraph) => wrapParagraph(paragraph));
      lineHeight = fontSize * 1.04;

      if (lines.length * lineHeight <= maxHeight) break;
    }

    const top = (size - lines.length * lineHeight) / 2;
    lines.forEach((line, index) => {
      context.fillText(line, margin, top + index * lineHeight);
    });

    return canvas.toDataURL("image/webp", 0.95).split(",", 2)[1];
  }, text);

  if (!data) throw new Error("Failed to render text sticker.");
  return new MessageMedia("image/webp", data, "sticker-text.webp");
}

export function createTextStickerCommand(client: Client) {
  return async function textStickerCommand(message: Message): Promise<void> {
    const text = parseTextStickerCommand(message.body);
    if (!text) {
      await message.reply(USAGE);
      return;
    }

    try {
      const media = await createTextStickerMedia(client, text);
      await message.reply(media, undefined, { sendMediaAsSticker: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error(`Text sticker generation failed: ${detail}`);
      await message.reply("Gagal membuat stiker. Coba lagi.");
    }
  };
}

export async function imageMediaFromCommand(
  message: Message,
): Promise<MessageMediaType | null> {
  ensureSerializedMessageId(message);

  const source = message.hasMedia
    ? message
    : message.hasQuotedMsg
      ? await message.getQuotedMessage()
      : null;

  if (!source?.hasMedia) return null;
  ensureSerializedMessageId(source);

  const media = await source.downloadMedia();
  return media?.mimetype.startsWith("image/") ? media : null;
}

export async function createImageStickerMedia(
  client: Client,
  media: MessageMediaType,
): Promise<InstanceType<typeof MessageMedia>> {
  const page = client.pupPage;
  if (!page) throw new Error("WhatsApp browser page is not ready.");

  const data = await page.evaluate(
    ({ sourceData, mimetype }) =>
      new Promise<string>((resolve, reject) => {
        const size = 512;
        const image = new Image();

        image.onload = () => {
          if (!image.naturalWidth || !image.naturalHeight) {
            reject(new Error("Image dimensions are invalid."));
            return;
          }

          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Canvas is not available."));
            return;
          }

          const scale = Math.min(
            size / image.naturalWidth,
            size / image.naturalHeight,
          );
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          context.drawImage(
            image,
            (size - width) / 2,
            (size - height) / 2,
            width,
            height,
          );

          const webp = canvas
            .toDataURL("image/webp", 0.92)
            .split(",", 2)[1];
          if (webp) resolve(webp);
          else reject(new Error("Failed to encode image as WebP."));
        };
        image.onerror = () => reject(new Error("Failed to decode image."));
        image.src = `data:${mimetype};base64,${sourceData}`;
      }),
    { sourceData: media.data, mimetype: media.mimetype },
  );

  return new MessageMedia("image/webp", data, "sticker.webp");
}

export function createImageStickerCommand(client: Client) {
  return async function imageStickerCommand(message: Message): Promise<void> {
    let stage = "download";

    try {
      const media = await imageMediaFromCommand(message);
      if (!media) {
        await message.reply(IMAGE_USAGE);
        return;
      }

      stage = "render";
      const sticker = await createImageStickerMedia(client, media);

      stage = "send";
      await message.reply(sticker, undefined, { sendMediaAsSticker: true });
    } catch (error) {
      console.error(`Image sticker ${stage} failed:`, error);
      await message.reply("Gagal membuat stiker. Coba kirim gambarnya lagi.");
    }
  };
}
