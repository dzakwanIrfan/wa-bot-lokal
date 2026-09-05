---
type: "query"
date: "2026-09-05T06:23:44.229242+00:00"
question: "Add a production-ready /remove-bg command with a handler, media service, swappable background-removal service, secure API key, cleanup, error handling, and high-quality PNG document output; recommend tooling and directory structure first, then wait for confirmation."
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter()", "CommandHandler", "loadConfig()", "whatsapp-web.js"]
---

# Q: Add a production-ready /remove-bg command with a handler, media service, swappable background-removal service, secure API key, cleanup, error handling, and high-quality PNG document output; recommend tooling and directory structure first, then wait for confirmation.

## Answer

Expanded from original query via vocab: [command, handler, message, router, routing, service, whatsapp, config, environment]. Current graph and source show commands are registered in index.ts and dispatched by createMessageRouter through CommandHandler. Recommend PhotoRoom Remove Background API because it has a direct multipart endpoint and full transparent PNG output. Add flat modules src/remove-background.ts, src/media.ts, and src/background-removal.ts; reuse the existing WhatsApp message ID normalization from sticker.ts in the shared media module; update config.ts, index.ts, sticker.ts, app.test.ts, .env.example, and README.md. Use in-memory buffers only, send PNG as a WhatsApp document, validate supported media, apply a timeout, sanitize logs, and map provider errors. Await confirmation on provider, direct-chat scope, and 429 retry behavior before implementation.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter()
- CommandHandler
- loadConfig()
- whatsapp-web.js