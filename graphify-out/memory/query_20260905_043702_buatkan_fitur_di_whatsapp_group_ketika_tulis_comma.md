---
type: "query"
date: "2026-09-05T04:37:02.275181+00:00"
question: "buatkan fitur di whatsapp group ketika tulis command /sticker-text dan ada tulisannya di tanda petik maka akan generate sticker seperti pada gambar terlampir"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "createMessageRouter()", "client", "whatsapp-web.js"]
---

# Q: buatkan fitur di whatsapp group ketika tulis command /sticker-text dan ada tulisannya di tanda petik maka akan generate sticker seperti pada gambar terlampir

## Answer

Expanded from original query via graph vocab: [client, command, handler, message, router, routing, whatsapp]. Existing createMessageRouter has an unused exact-match CommandHandler map, which cannot parse arguments. Recommended command is /stiker, with /stiker-teks and /sticker-text as aliases. In whitelisted TARGET_GROUP_IDS, command messages should bypass the AI mention requirement because the slash command itself is explicit; ordinary AI group replies remain mention-only. Parse one quoted text argument, cap input, preserve explicit line breaks, auto-wrap and auto-fit black Arial/Helvetica text on a 512x512 white canvas. Render PNG in the WhatsApp client existing Puppeteer page, wrap it in MessageMedia, and reply using sendMediaAsSticker=true. This requires no Gemini call, no temp files, and no new dependency. Add parser/routing tests and document syntax. Await explicit execute approval before implementation.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- createMessageRouter()
- client
- whatsapp-web.js