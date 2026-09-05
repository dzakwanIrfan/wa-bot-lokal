---
type: "query"
date: "2026-09-05T04:49:10.695044+00:00"
question: "jangan /sticker saja, soalnya nanti akan ada fitur ubah gambar biasa jadi sticker execute! implement sticker text"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "createMessageRouter()", "client", "whatsapp-web.js"]
---

# Q: jangan /sticker saja, soalnya nanti akan ada fitur ubah gambar biasa jadi sticker execute! implement sticker text

## Answer

Expanded from original query via graph vocab: [client, command, handler, message, router, routing, whatsapp]. Final implementation reserves /sticker and exposes only /sticker-text. src/sticker.ts parses straight or smart quoted text, enforces 160 characters and 10 explicit lines, auto-wraps and auto-fits Arial/Helvetica text on a white 512x512 canvas inside the existing WhatsApp Chromium page, returns image/webp MessageMedia, and replies with sendMediaAsSticker. createMessageRouter executes registered commands only in TARGET_GROUP_IDS before the mention gate, while normal Gemini group messages remain mention-only. index listens to message_create so commands typed by the linked account on Android also work; fromMe non-command messages and direct messages remain ignored. Tests cover own-message command routing without mention or Gemini, invalid input, the reserved /sticker name, limits, and non-whitelisted groups. Type check, build, three tests, diff check, and visual WebP QA passed. Actual WhatsApp delivery requires user restart and group test.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- createMessageRouter()
- client
- whatsapp-web.js