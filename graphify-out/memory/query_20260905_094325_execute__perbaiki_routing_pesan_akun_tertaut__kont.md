---
type: "query"
date: "2026-09-05T09:43:25.950275+00:00"
question: "execute! perbaiki routing pesan akun tertaut; konteks: aku testing di whatsapp macbook"
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter", "client", "whatsapp-web.js", "router.ts", "whatsapp.ts"]
---

# Q: execute! perbaiki routing pesan akun tertaut; konteks: aku testing di whatsapp macbook

## Answer

Expanded from original query via graph vocab: [bot, client, handler, message, router, whatsapp]. Fixed createMessageRouter to ignore only fromMe group text without an author, because live WhatsApp MacBook messages had populated device-suffixed author while headless bot outputs had no author. Updated createQuizGroupTextHandler to resolve all fromMe attempts through client.info.wid so one user does not become a separate participant per linked device. Added a regression using the observed 3B message ID, deviceType web, and :49@lid author. TypeScript check and all 9 tests pass.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter
- client
- whatsapp-web.js
- router.ts
- whatsapp.ts