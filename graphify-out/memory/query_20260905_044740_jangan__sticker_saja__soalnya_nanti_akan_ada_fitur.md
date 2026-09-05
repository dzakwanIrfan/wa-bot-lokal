---
type: "query"
date: "2026-09-05T04:47:40.451984+00:00"
question: "jangan /sticker saja, soalnya nanti akan ada fitur ubah gambar biasa jadi sticker execute! implement sticker text"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "createMessageRouter()", "client", "whatsapp-web.js"]
---

# Q: jangan /sticker saja, soalnya nanti akan ada fitur ubah gambar biasa jadi sticker execute! implement sticker text

## Answer

Expanded from original query via graph vocab: [client, command, handler, message, router, routing, whatsapp]. Implemented only /sticker-text, leaving /sticker unused for a future image-to-sticker feature. Added src/sticker.ts with quoted-input parsing, 160-character and 10-line bounds, adaptive wrapping and font fitting on a 512x512 white canvas, direct WebP rendering through the existing WhatsApp Chromium page, and MessageMedia sticker reply. Integrated it as a group command that runs only in TARGET_GROUP_IDS and bypasses mention lookup, while ordinary Gemini group replies remain mention-only. Added parser, limit, reserved-command, no-mention routing, unlisted-group, and no-Gemini tests plus README usage. No dependency added. Type check, three tests, diff check, and visual WebP render all passed.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- createMessageRouter()
- client
- whatsapp-web.js