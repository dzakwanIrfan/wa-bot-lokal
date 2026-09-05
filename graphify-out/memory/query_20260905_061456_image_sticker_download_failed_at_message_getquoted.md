---
type: "query"
date: "2026-09-05T06:14:56.347690+00:00"
question: "Image sticker download failed at Message.getQuotedMessage with r: r"
contributor: "graphify"
outcome: "corrected"
correction: "Normalize message.id._serialized from id.$1 or reconstruct it before getQuotedMessage and downloadMedia; the failure was in quoted-message lookup, not raw media decryption."
source_nodes: ["client", "CommandHandler", "createMessageRouter()", "whatsapp-web.js"]
---

# Q: Image sticker download failed at Message.getQuotedMessage with r: r

## Answer

Expanded from original query via vocab: [client, command, handler, message, router, routing, whatsapp]. The full runtime stack corrected the earlier diagnosis: failure happened before downloadMedia, inside getQuotedMessage because whatsapp-web.js 1.34.7 reads message.id._serialized while current WhatsApp Web can expose the serialized key as message.id.$1. Removed the speculative raw-media downloader. Added ensureSerializedMessageId in src/sticker.ts, using $1 first and reconstructing from fromMe, remote, and id as fallback; it runs before getQuotedMessage and again before downloadMedia on the quoted image. Kept the existing WebP renderer. Added a regression test for missing _serialized on both the command and quoted image. pnpm run check, pnpm test, and git diff --check pass.

## Outcome

- Signal: corrected
- Correction: Normalize message.id._serialized from id.$1 or reconstruct it before getQuotedMessage and downloadMedia; the failure was in quoted-message lookup, not raw media decryption.

## Source Nodes

- client
- CommandHandler
- createMessageRouter()
- whatsapp-web.js