import { loadConfig } from "./config.js";
import { createGeminiService } from "./gemini.js";
import {
  createPostgresPool,
  verifyQuizDatabase,
} from "./infrastructure/postgres/pool.js";
import { createConversationMemory } from "./memory.js";
import { PostgresQuizEngine } from "./modules/quiz/infrastructure/postgres-quiz-engine.js";
import { createQuizGroupTextHandler } from "./modules/quiz/presentation/whatsapp.js";
import {
  createRemoveBackgroundCommand,
  REMOVE_BACKGROUND_COMMAND,
} from "./remove-bg-handler.js";
import { createMessageRouter } from "./router.js";
import {
  createImageStickerCommand,
  createTextStickerCommand,
  IMAGE_STICKER_COMMAND,
  TEXT_STICKER_COMMAND,
} from "./sticker.js";
import { createWhatsAppClient } from "./whatsapp.js";

const config = loadConfig();
const memory = createConversationMemory(12);
const gemini = createGeminiService(
  config.geminiApiKey,
  config.geminiModel,
  config.replyStylePrompt,
);
const client = createWhatsAppClient();
const database = config.databaseUrl
  ? createPostgresPool(config.databaseUrl)
  : null;
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Stopping WhatsApp bot...");

  try {
    await client.destroy();
  } finally {
    try {
      await database?.end();
    } finally {
      process.exit(0);
    }
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  if (database) {
    await verifyQuizDatabase(database);
    console.log("Quiz database is ready.");
  } else {
    console.warn("Quiz engine is disabled: DATABASE_URL is not configured.");
  }

  const quizEngine = database ? new PostgresQuizEngine(database) : null;
  const routeMessage = createMessageRouter({
    targetPhoneNumbers: config.targetPhoneNumbers,
    targetGroupIds: config.targetGroupIds,
    memory,
    gemini,
    groupTextHandler: quizEngine
      ? createQuizGroupTextHandler(quizEngine)
      : undefined,
    groupCommands: new Map([
      [
        REMOVE_BACKGROUND_COMMAND,
        createRemoveBackgroundCommand(config.photoroomApiKey),
      ],
      [IMAGE_STICKER_COMMAND, createImageStickerCommand(client)],
      [TEXT_STICKER_COMMAND, createTextStickerCommand(client)],
    ]),
  });

  client.on("message_create", (message) => void routeMessage(message));
  await client.initialize();
} catch (error) {
  console.error(error instanceof Error ? error.message : "WhatsApp startup failed.");
  await client.destroy().catch(() => undefined);
  await database?.end().catch(() => undefined);
  process.exitCode = 1;
}
