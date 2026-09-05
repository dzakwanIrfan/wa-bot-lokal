import type { Message, MessageMedia } from "whatsapp-web.js";

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

export async function imageMediaFromCommand(
  message: Message,
): Promise<MessageMedia | null> {
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
