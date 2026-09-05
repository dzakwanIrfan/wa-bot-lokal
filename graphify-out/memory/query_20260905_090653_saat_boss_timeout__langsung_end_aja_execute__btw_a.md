---
type: "query"
date: "2026-09-05T09:06:53.034730+00:00"
question: "saat boss timeout, langsung end aja execute! btw aku sudah melakukan migrations 001-004 dan verifikasi schema berhasil"
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter", "CommandHandler", "client", "whatsapp.ts"]
---

# Q: saat boss timeout, langsung end aja execute! btw aku sudah melakukan migrations 001-004 dan verifikasi schema berhasil

## Answer

Expanded from original query via vocab: [client, command, handler, message, router, session, whatsapp]. Implemented Boss timeout as terminal for the active raid; normal quiz continues or completes after the final Boss. Added boss_expired schema event, /stop, linked Android/iOS account answer routing, safe quiz-v2 aliases, and applied migration 005 after PostgreSQL verification.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter
- CommandHandler
- client
- whatsapp.ts