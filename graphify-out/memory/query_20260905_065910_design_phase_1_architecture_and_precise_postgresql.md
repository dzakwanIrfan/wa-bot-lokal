---
type: "query"
date: "2026-09-05T06:59:10.810586+00:00"
question: "Design Phase 1 architecture and precise PostgreSQL schema for a high-concurrency multiplayer WhatsApp quiz with First Blood, strict and chaos modes, boss raids, generated question batches, seasons, and leaderboard locking."
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter()", "CommandHandler", "ConversationMemory", "whatsapp-web.js"]
---

# Q: Design Phase 1 architecture and precise PostgreSQL schema for a high-concurrency multiplayer WhatsApp quiz with First Blood, strict and chaos modes, boss raids, generated question batches, seasons, and leaderboard locking.

## Answer

Expanded from graph vocabulary: [command, handler, message, router, routing, service, whatsapp, conversation, memory, client]. Current router uses one Promise queue per group, so Phase 2 must introduce a quiz ingress path before the legacy queue. Recommend a modular monolith with quiz and question-generation bounded contexts, PostgreSQL-backed attempts and transactional outbox, no external broker initially. Schema proposal uses seasons, participants, generation_batches, questions, question_requests, quiz_sessions, boss_raids, quiz_rounds, quiz_attempts, score_events, leaderboard, session_events, and outbox. Enforce one running or paused session per group with a unique partial index, strict one attempt with a partial unique index, message idempotency with a unique WhatsApp message ID, ordered received_seq, and score idempotency with unique event_key. Correct candidates use READ COMMITTED transaction lock order quiz_sessions FOR UPDATE then round then score ledger then leaderboard then outbox. SKIP LOCKED is only for attempt and outbox workers, never the First Blood session lock. Await approval of canonical arrival ordering, participant identity under WhatsApp LID, boss streak semantics, season timezone, difficulty scale, and scoring before Phase 2.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter()
- CommandHandler
- ConversationMemory
- whatsapp-web.js