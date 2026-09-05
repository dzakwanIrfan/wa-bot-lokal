export type ChatTurn = Readonly<{
  role: "user" | "model";
  text: string;
}>;

export function createConversationMemory(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Conversation history limit must be a positive integer.");
  }

  const conversations = new Map<string, ChatTurn[]>();

  return {
    add(phoneNumber: string, turn: ChatTurn): void {
      const history = [...(conversations.get(phoneNumber) ?? []), turn];
      conversations.set(phoneNumber, history.slice(-limit));
    },

    get(phoneNumber: string): readonly ChatTurn[] {
      return [...(conversations.get(phoneNumber) ?? [])];
    },

    clear(phoneNumber: string): void {
      conversations.delete(phoneNumber);
    },
  };
}

export type ConversationMemory = ReturnType<typeof createConversationMemory>;
