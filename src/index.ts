import { loadConfig } from "./config.js";
import { createGeminiService } from "./gemini.js";
import { createConversationMemory } from "./memory.js";
import { createMessageRouter } from "./router.js";
import { createWhatsAppClient } from "./whatsapp.js";

const config = loadConfig();
const memory = createConversationMemory(12);
const gemini = createGeminiService(
  config.geminiApiKey,
  config.geminiModel,
  config.replyStylePrompt,
);
const client = createWhatsAppClient();
const routeMessage = createMessageRouter({
  targetPhoneNumbers: config.targetPhoneNumbers,
  targetGroupIds: config.targetGroupIds,
  memory,
  gemini,
});

client.on("message", (message) => void routeMessage(message));

async function shutdown(): Promise<void> {
  console.log("Stopping WhatsApp bot...");
  await client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await client.initialize();
} catch (error) {
  console.error(error instanceof Error ? error.message : "WhatsApp startup failed.");
  process.exitCode = 1;
}
