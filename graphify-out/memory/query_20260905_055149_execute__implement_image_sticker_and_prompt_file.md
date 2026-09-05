---
type: "query"
date: "2026-09-05T05:51:49.698299+00:00"
question: "execute! implement image sticker and prompt file"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "createMessageRouter()", "Environment Configuration", "loadConfig()", "client", "whatsapp-web.js"]
---

# Q: execute! implement image sticker and prompt file

## Answer

Expanded from original query via graph vocab: [client, command, config, gemini, handler, message, router, routing, whatsapp]. Implemented /sticker only in whitelisted groups using the existing group command map. It accepts either an image message carrying caption /sticker or a /sticker text reply to an existing image, resolves Message.hasMedia/getQuotedMessage/downloadMedia, validates image MIME, and replies with sendMediaAsSticker without Gemini or new dependencies. Router now dispatches group commands before rejecting non-chat message types, while media without commands stays ignored and ordinary group AI still requires mention. Added prompts/reply-style.md with all supplied Markdown content, config loads it relative to the compiled module at startup, and REPLY_STYLE_PROMPT was removed from local .env and .env.example. README and tests were updated. Type check, build, four tests, diff check, runtime prompt load, target group config, and env-key checks passed. Actual WhatsApp media delivery still requires restart and device test.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- createMessageRouter()
- Environment Configuration
- loadConfig()
- client
- whatsapp-web.js