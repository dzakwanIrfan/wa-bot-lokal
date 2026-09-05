import whatsapp from "whatsapp-web.js";
import type {
  Client,
  Message,
  MessageMedia as MessageMediaType,
} from "whatsapp-web.js";

import { imageMediaFromCommand } from "./media.js";

const { MessageMedia } = whatsapp;

export const TEXT_STICKER_COMMAND = "/sticker-text";
export const IMAGE_STICKER_COMMAND = "/sticker";
const MAX_TEXT_LENGTH = 160;
const MAX_EXPLICIT_LINES = 10;
const USAGE = `Format: ${TEXT_STICKER_COMMAND} "contoh tulisan"\nMaksimal ${MAX_TEXT_LENGTH} karakter dan ${MAX_EXPLICIT_LINES} baris.`;
const IMAGE_USAGE =
  "Kirim gambar dengan caption /sticker, atau reply gambar dengan /sticker.";

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

    function wrapParagraph(
      paragraph: string,
      breakLongWords: boolean,
    ): string[] | null {
      if (!paragraph) return [""];

      const words = paragraph.split(/\s+/);
      const lines: string[] = [];
      let line = "";

      for (const word of words) {
        if (context.measureText(word).width > maxWidth) {
          if (!breakLongWords) return null;
          if (line) lines.push(line);
          line = "";

          const graphemes = new Intl.Segmenter(undefined, {
            granularity: "grapheme",
          }).segment(word);
          for (const { segment } of graphemes) {
            const chunk = line + segment;
            if (line && context.measureText(chunk).width > maxWidth) {
              lines.push(line);
              line = segment;
            } else {
              line = chunk;
            }
          }
          continue;
        }

        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }

        if (line) lines.push(line);
        line = word;
      }

      if (line) lines.push(line);
      return lines;
    }

    function findLayout(
      maximumFontSize: number,
      minimumFontSize: number,
      breakLongWords: boolean,
    ): { fontSize: number; lineHeight: number; lines: string[] } | null {
      for (
        let fontSize = maximumFontSize;
        fontSize >= minimumFontSize;
        fontSize -= 2
      ) {
        context.font = `${fontSize}px Arial, Helvetica, sans-serif`;
        const lines: string[] = [];
        let valid = true;

        for (const paragraph of sourceText.split("\n")) {
          const wrapped = wrapParagraph(paragraph, breakLongWords);
          if (!wrapped) {
            valid = false;
            break;
          }
          lines.push(...wrapped);
        }

        const lineHeight = fontSize * 1.04;
        if (valid && lines.length * lineHeight <= maxHeight) {
          return { fontSize, lineHeight, lines };
        }
      }
      return null;
    }

    const layout =
      findLayout(180, 24, false) ??
      findLayout(24, 16, true);
    if (!layout) throw new Error("Text does not fit inside the sticker.");

    context.font = `${layout.fontSize}px Arial, Helvetica, sans-serif`;
    const blockWidth = Math.max(
      ...layout.lines.map((line) => context.measureText(line).width),
    );
    const left = (size - blockWidth) / 2;
    const top = (size - layout.lines.length * layout.lineHeight) / 2;
    layout.lines.forEach((line, index) => {
      context.fillText(line, left, top + index * layout.lineHeight);
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
