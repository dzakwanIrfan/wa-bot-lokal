---
type: "query"
date: "2026-09-05T03:59:39.729930+00:00"
question: "Add AI prompt engineering so WhatsApp replies match the user's language and typing style"
contributor: "graphify"
outcome: "useful"
source_nodes: ["SYSTEM_INSTRUCTION", "createGeminiService()", "loadConfig()", "Environment Configuration"]
---

# Q: Add AI prompt engineering so WhatsApp replies match the user's language and typing style

## Answer

Expanded from original query via graph vocab: [gemini, system, instruction, config, environment, memory, message, service]. Current flow is loadConfig in src/config.ts to createGeminiService in src/index.ts to SYSTEM_INSTRUCTION in src/gemini.ts. Minimal design: add one configurable REPLY_STYLE_PROMPT environment value, append it to the trusted system instruction, preserve current truthfulness rules, and keep chat messages only in contents so senders cannot redefine the persona. Skip automatic style learning and per-target personas until requested.

## Outcome

- Signal: useful

## Source Nodes

- SYSTEM_INSTRUCTION
- createGeminiService()
- loadConfig()
- Environment Configuration