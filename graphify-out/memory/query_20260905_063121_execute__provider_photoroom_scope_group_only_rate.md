---
type: "query"
date: "2026-09-05T06:31:21.756145+00:00"
question: "execute! provider=photoroom scope=group-only rate-limit=no-auto-retry"
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter()", "CommandHandler", "loadConfig()", "whatsapp-web.js"]
---

# Q: execute! provider=photoroom scope=group-only rate-limit=no-auto-retry

## Answer

Expanded from original query via graph vocab: [command, handler, message, router, routing, service, whatsapp, config, environment]. Implemented group-only /remove-bg by registering createRemoveBackgroundCommand in index.ts. Added bg-removal.ts with native fetch, PhotoRoom multipart upload, 60 second timeout, 50 MB and MIME validation, PNG signature validation, sanitized typed errors, and exactly one request for HTTP 429. Added remove-bg-handler.ts for attached or quoted media and PNG document replies. Moved the proven message ID normalization and media download path from sticker.ts into shared media.ts so sticker and remove background reuse the same fix. Added required PHOTOROOM_API_KEY configuration, documentation, and tests. pnpm run check, pnpm test, build, and git diff --check pass; 6 tests pass. Live provider call was not run because PHOTOROOM_API_KEY is not configured in .env.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter()
- CommandHandler
- loadConfig()
- whatsapp-web.js