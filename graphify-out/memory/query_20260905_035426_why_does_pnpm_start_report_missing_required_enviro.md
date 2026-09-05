---
type: "query"
date: "2026-09-05T03:54:26.054882+00:00"
question: "Why does pnpm start report Missing required environment variable TARGET_PHONE_NUMBERS?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["loadConfig()", "parseTargetPhoneNumbers()", "Environment Configuration"]
---

# Q: Why does pnpm start report Missing required environment variable TARGET_PHONE_NUMBERS?

## Answer

Expanded from original query via graph vocab: [target, phone, numbers, environment, config, load, parse]. loadConfig requires the exact TARGET_PHONE_NUMBERS key; .env line 3 had accidentally been renamed to execute! perbaiki routing while retaining the expected JSON target array. Renaming that key restored config loading with 2 targets, and pnpm start reached WhatsApp bot is ready.

## Outcome

- Signal: useful

## Source Nodes

- loadConfig()
- parseTargetPhoneNumbers()
- Environment Configuration