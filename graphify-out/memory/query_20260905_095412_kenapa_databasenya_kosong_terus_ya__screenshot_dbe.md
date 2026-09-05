---
type: "query"
date: "2026-09-05T09:54:12.093325+00:00"
question: "kenapa databasenya kosong terus ya? Screenshot DBeaver membuka public@wa_bot"
contributor: "graphify"
outcome: "useful"
source_nodes: ["config", "Environment Configuration", "loadConfig"]
---

# Q: kenapa databasenya kosong terus ya? Screenshot DBeaver membuka public@wa_bot

## Answer

Expanded from original query via graph vocab: [config, environment]. The database is not empty. DBeaver is showing the public schema, while migrations create and use the quiz schema. Live read-only verification against DATABASE_URL confirmed database wa_bot, schemas public and quiz, 14 quiz tables, 80 questions, 4 sessions, 16 attempts, 3 participants, and 2 leaderboard rows. Refresh wa_bot and open Schemas > quiz > Tables, or query fully qualified quiz table names.

## Outcome

- Signal: useful

## Source Nodes

- config
- Environment Configuration
- loadConfig