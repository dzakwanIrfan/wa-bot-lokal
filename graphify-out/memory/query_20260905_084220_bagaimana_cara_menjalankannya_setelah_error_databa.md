---
type: "query"
date: "2026-09-05T08:42:20.717284+00:00"
question: "bagaimana cara menjalankannya setelah error database wa_bot does not exist"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Environment Configuration", "loadConfig()", "start"]
---

# Q: bagaimana cara menjalankannya setelah error database wa_bot does not exist

## Answer

Expanded via graph vocabulary: [config, configuration, environment, load, session, start]. PostgreSQL is reachable but wa_bot must be created first. Use psql against the postgres maintenance database, set DATABASE_URL in .env without escaping @, use a temporary QUIZ_DATABASE_URL only for psql migrations 001-004, verify the schema, unset the correctly named variable, then build and start. On an empty question bank, /kuis queues Gemini generation and must be retried after the ready notification.

## Outcome

- Signal: useful

## Source Nodes

- Environment Configuration
- loadConfig()
- start