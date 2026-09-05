import type { Message } from "whatsapp-web.js";

import { normalizePhoneNumber } from "./config.js";
import type { GeminiService } from "./gemini.js";
import type { ConversationMemory } from "./memory.js";

type RouteCandidate = Readonly<{
  fromMe: boolean;
  isStatus: boolean;
  isBroadcast: boolean;
  isDirectChat: boolean;
  type: string;
  phoneNumber: string | null;
}>;

export type CommandHandler = (
  message: Message,
  phoneNumber: string,
) => Promise<void>;

type RouterDependencies = Readonly<{
  targetPhoneNumbers: ReadonlySet<string>;
  memory: ConversationMemory;
  gemini: GeminiService;
  commands?: ReadonlyMap<string, CommandHandler>;
}>;

export function shouldRouteMessage(
  candidate: RouteCandidate,
  targetPhoneNumbers: ReadonlySet<string>,
): boolean {
  return (
    !candidate.fromMe &&
    !candidate.isStatus &&
    !candidate.isBroadcast &&
    candidate.isDirectChat &&
    candidate.type === "chat" &&
    candidate.phoneNumber !== null &&
    targetPhoneNumbers.has(candidate.phoneNumber)
  );
}

export function isDirectChatId(
  chatId: string | undefined,
  author: string | undefined,
): boolean {
  return (
    !author &&
    typeof chatId === "string" &&
    (chatId.endsWith("@c.us") || chatId.endsWith("@lid"))
  );
}

function safePhoneNumber(value: string): string | null {
  try {
    return normalizePhoneNumber(value);
  } catch {
    return null;
  }
}

export function phoneNumberFromContactId(
  user: string | undefined,
  server: string | undefined,
): string | null {
  return server === "c.us" && user ? safePhoneNumber(user) : null;
}

function errorSummary(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : "Unknown error";
}

export function createMessageRouter({
  targetPhoneNumbers,
  memory,
  gemini,
  commands = new Map(),
}: RouterDependencies) {
  const queues = new Map<string, Promise<void>>();

  function enqueue(phoneNumber: string, task: () => Promise<void>): Promise<void> {
    const previous = queues.get(phoneNumber) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    queues.set(phoneNumber, current);

    return current.finally(() => {
      if (queues.get(phoneNumber) === current) queues.delete(phoneNumber);
    });
  }

  return async function routeMessage(message: Message): Promise<void> {
    if (
      message.fromMe ||
      message.isStatus ||
      message.broadcast ||
      message.type !== "chat"
    ) {
      return;
    }

    try {
      const chatId = message.from || message.id.remote;
      const isDirectChat = isDirectChatId(chatId, message.author);
      if (!isDirectChat) return;

      const contact = await message.getContact();
      const phoneNumber = phoneNumberFromContactId(
        contact.id.user,
        contact.id.server,
      );

      if (
        !shouldRouteMessage(
          {
            fromMe: message.fromMe,
            isStatus: message.isStatus,
            isBroadcast: message.broadcast,
            isDirectChat,
            type: message.type,
            phoneNumber,
          },
          targetPhoneNumbers,
        ) ||
        !phoneNumber
      ) {
        return;
      }

      await enqueue(phoneNumber, async () => {
        const text = message.body.trim();
        if (!text) return;

        const command = commands.get(text.toLowerCase());
        if (command) {
          await command(message, phoneNumber);
          return;
        }

        memory.add(phoneNumber, { role: "user", text });

        try {
          const reply = await gemini.generateReply(memory.get(phoneNumber));
          await message.reply(reply);
          memory.add(phoneNumber, { role: "model", text: reply });
        } catch (error) {
          console.error(
            `Auto-reply failed for ...${phoneNumber.slice(-4)}: ${errorSummary(error)}`,
          );
        }
      });
    } catch (error) {
      console.error(`Message routing failed: ${errorSummary(error)}`);
    }
  };
}
