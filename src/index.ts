import { loadConfig } from "./config.js";
import { createGeminiService } from "./gemini.js";
import {
  createPostgresPool,
  verifyQuizDatabase,
} from "./infrastructure/postgres/pool.js";
import { createConversationMemory } from "./memory.js";
import { GroupTaskQueue } from "./modules/quiz/application/group-task-queue.js";
import { QuizRuntime } from "./modules/quiz/application/quiz-runtime.js";
import { createGeminiQuestionGenerator } from "./modules/quiz/infrastructure/gemini-question-generator.js";
import { PostgresQuizEngine } from "./modules/quiz/infrastructure/postgres-quiz-engine.js";
import { PostgresQuizGame } from "./modules/quiz/infrastructure/postgres-quiz-game.js";
import { createQuizCommands } from "./modules/quiz/presentation/commands.js";
import { createQuizGroupTextHandler } from "./modules/quiz/presentation/whatsapp.js";
import {
  createRemoveBackgroundCommand,
  REMOVE_BACKGROUND_COMMAND,
} from "./remove-bg-handler.js";
import { createMessageRouter, type CommandHandler } from "./router.js";
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
let quizRuntime: QuizRuntime | null = null;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Stopping WhatsApp bot...");
  quizRuntime?.stop();

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
  const quizTaskQueue = new GroupTaskQueue();
  const quizGame = database
    ? new PostgresQuizGame(database, {
        questionCount: config.quiz.questionCount,
        bossEvery: config.quiz.bossEvery,
        batchSize: config.quiz.batchSize,
        durationSeconds: config.quiz.durationSeconds,
        model: config.geminiModel,
      })
    : null;
  quizRuntime = quizGame
    ? new QuizRuntime(
        client,
        quizGame,
        createGeminiQuestionGenerator(config.geminiApiKey),
        quizTaskQueue,
        config.quiz.tickMilliseconds,
        config.quiz.generationIntervalMilliseconds,
      )
    : null;
  const groupCommands = new Map<string, CommandHandler>([
    [
      REMOVE_BACKGROUND_COMMAND,
      createRemoveBackgroundCommand(config.photoroomApiKey),
    ],
    [IMAGE_STICKER_COMMAND, createImageStickerCommand(client)],
    [TEXT_STICKER_COMMAND, createTextStickerCommand(client)],
  ]);
  if (quizRuntime) {
    for (const [name, handler] of createQuizCommands(
      client,
      quizRuntime,
      config.quiz.defaultMode,
    )) {
      groupCommands.set(name, handler);
    }
  }
  const routeMessage = createMessageRouter({
    targetPhoneNumbers: config.targetPhoneNumbers,
    targetGroupIds: config.targetGroupIds,
    memory,
    gemini,
    groupTextHandler: quizEngine
      ? createQuizGroupTextHandler(
          quizEngine,
          (groupId, outcome) =>
            quizRuntime?.afterAttempt(groupId, outcome) ?? Promise.resolve(),
          () => client.info?.wid._serialized,
        )
      : undefined,
    quizTaskQueue,
    groupCommands,
  });

  client.on("message_create", (message) => void routeMessage(message));
  await client.initialize();
  quizRuntime?.start();
} catch (error) {
  console.error(error instanceof Error ? error.message : "WhatsApp startup failed.");
  await client.destroy().catch(() => undefined);
  await database?.end().catch(() => undefined);
  process.exitCode = 1;
}
