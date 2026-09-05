import whatsapp from "whatsapp-web.js";
import type { Client, Message } from "whatsapp-web.js";

const { MessageMedia } = whatsapp;

export const TEXT_STICKER_COMMAND = "/sticker-text";
const MAX_TEXT_LENGTH = 160;
const MAX_EXPLICIT_LINES = 10;
const USAGE = `Format: ${TEXT_STICKER_COMMAND} "contoh tulisan"\nMaksimal ${MAX_TEXT_LENGTH} karakter dan ${MAX_EXPLICIT_LINES} baris.`;

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
