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
  conversationId: string,
) => Promise<void>;

export type GroupTextResult = Readonly<{
  handled: boolean;
  afterCommit?: () => Promise<void>;
}>;

export type GroupTextHandler = (
  message: Message,
  groupId: string,
  receivedAt: Date,
) => Promise<GroupTextResult>;

type RouterDependencies = Readonly<{
  targetPhoneNumbers: ReadonlySet<string>;
  targetGroupIds: ReadonlySet<string>;
  memory: ConversationMemory;
  gemini: GeminiService;
  groupCommands?: ReadonlyMap<string, CommandHandler>;
  groupTextHandler?: GroupTextHandler;
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

export function isGroupChatId(chatId: string | undefined): chatId is string {
  return typeof chatId === "string" && chatId.endsWith("@g.us");
}

export function shouldRouteGroupMessage(
  groupId: string | undefined,
  isBotMentioned: boolean,
  targetGroupIds: ReadonlySet<string>,
): boolean {
  return (
    isGroupChatId(groupId) &&
    isBotMentioned &&
    targetGroupIds.has(groupId)
  );
}

export function commandNameFromText(text: string): string | null {
  return (
    text.trim().match(/^(\/[a-z0-9-]+)(?:\s|$)/i)?.[1]?.toLowerCase() ?? null
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
  targetGroupIds,
  memory,
  gemini,
  groupCommands = new Map(),
  groupTextHandler,
}: RouterDependencies) {
  const queues = new Map<string, Promise<unknown>>();
  const quizQueues = new Map<string, Promise<unknown>>();

  function enqueue<T>(
    target: Map<string, Promise<unknown>>,
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = target.get(conversationId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    target.set(conversationId, current);

    return current.finally(() => {
      if (target.get(conversationId) === current) target.delete(conversationId);
    });
  }

  return async function routeMessage(message: Message): Promise<void> {
    const receivedAt = new Date();

    if (message.isStatus || message.broadcast) {
      return;
    }

    try {
      const chatId = message.id.remote || message.from;
      const text = message.body.trim();
      if (!text) return;

      let conversationId: string;
      let memoryText = text;

      if (isGroupChatId(chatId)) {
        if (!targetGroupIds.has(chatId)) return;

        const commandName = commandNameFromText(text);
        const command = commandName ? groupCommands.get(commandName) : undefined;
        if (command) {
          await enqueue(queues, chatId, () => command(message, chatId));
          return;
        }

        if (message.type !== "chat") return;
        if (message.fromMe) return;

        if (!commandName && groupTextHandler) {
          const result = await enqueue(quizQueues, chatId, () =>
            groupTextHandler(message, chatId, receivedAt),
          );
          if (result.handled) {
            if (result.afterCommit) {
              void result.afterCommit().catch((error: unknown) => {
                console.error(`Quiz reply delivery failed: ${errorSummary(error)}`);
              });
            }
            return;
          }
        }

        if (message.mentionedIds.length === 0) return;

        const isBotMentioned = (await message.getMentions()).some(
          (contact) => contact.isMe,
        );
        if (!shouldRouteGroupMessage(chatId, isBotMentioned, targetGroupIds)) {
          return;
        }

        const sender = await message.getContact();
        const senderName = sender.name || sender.pushname || "Group member";
        conversationId = chatId;
        memoryText = `${senderName}: ${text}`;
      } else {
        if (message.type !== "chat") return;
        if (message.fromMe) return;

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

        conversationId = phoneNumber;
      }

      await enqueue(queues, conversationId, async () => {
        memory.add(conversationId, { role: "user", text: memoryText });

        try {
          const reply = await gemini.generateReply(memory.get(conversationId));
          await message.reply(reply);
          memory.add(conversationId, { role: "model", text: reply });
        } catch (error) {
          console.error(
            `Auto-reply failed for ...${conversationId.split("@", 1)[0]?.slice(-4)}: ${errorSummary(error)}`,
          );
        }
      });
    } catch (error) {
      console.error(`Message routing failed: ${errorSummary(error)}`);
    }
  };
}
