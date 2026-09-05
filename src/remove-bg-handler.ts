import whatsapp from "whatsapp-web.js";
import type { Message } from "whatsapp-web.js";

import {
  BackgroundRemovalError,
  removeBackground,
  type BackgroundRemovalInput,
} from "./bg-removal.js";
import { imageMediaFromCommand } from "./media.js";

const { MessageMedia } = whatsapp;

export const REMOVE_BACKGROUND_COMMAND = "/remove-bg";
const USAGE =
  "Kirim gambar dengan caption /remove-bg, atau reply gambar dengan /remove-bg.";

type BackgroundRemover = (
  input: BackgroundRemovalInput,
  apiKey: string,
) => Promise<Uint8Array>;

function userMessageForError(error: unknown): string {
  if (error instanceof BackgroundRemovalError) {
    switch (error.code) {
      case "unsupported-media":
        return "Format gambar belum didukung. Kirim JPG, PNG, WebP, atau HEIC ya.";
      case "input-too-large":
        return "Gambarnya terlalu besar. Maksimal ukuran file adalah 50 MB.";
      case "unauthorized":
        return "Fitur remove background sedang tidak tersedia karena API key atau kuotanya bermasalah.";
      case "rate-limit":
        return "Layanan remove background sedang sibuk. Coba lagi sebentar ya.";
      case "timeout":
        return "Proses remove background terlalu lama. Coba lagi dengan gambar yang lebih kecil ya.";
      case "provider":
        break;
    }
  }
  return "Gagal menghapus background. Coba kirim gambarnya lagi ya.";
}

function errorSummary(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : "Unknown error";
}

export function createRemoveBackgroundCommand(
  apiKey: string,
  remove: BackgroundRemover = removeBackground,
) {
  return async function removeBackgroundCommand(message: Message): Promise<void> {
    let stage = "download";
    try {
      const media = await imageMediaFromCommand(message);
      if (!media) {
        await message.reply(USAGE);
        return;
      }

      stage = "process";
      const result = await remove(media, apiKey);
      const png = new MessageMedia(
        "image/png",
        Buffer.from(result).toString("base64"),
        "background-removed.png",
      );

      stage = "send";
      await message.reply(png, undefined, { sendMediaAsDocument: true });
    } catch (error) {
      console.error(
        `Remove background ${stage} failed: ${errorSummary(error)}`,
      );
      await message.reply(userMessageForError(error));
    }
  };
}
