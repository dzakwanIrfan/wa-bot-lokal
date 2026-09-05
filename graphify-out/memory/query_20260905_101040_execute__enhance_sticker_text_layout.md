---
type: "query"
date: "2026-09-05T10:10:40.675352+00:00"
question: "execute! enhance sticker text layout"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "whatsapp.ts", "createMessageRouter()"]
---

# Q: execute! enhance sticker text layout

## Answer

Expanded query vocabulary: command, handler, text, whatsapp. Audited the shared sticker-text renderer and found that it split oversized words before trying smaller font sizes. Updated createTextStickerMedia to shrink the font first, preserve whole words and explicit newlines, center the complete left-aligned text block horizontally and vertically, and use grapheme-safe splitting only as a minimum-font fallback. Added a regression test covering all three supplied phrases. pnpm run check, pnpm test (10/10), git diff --check, and a live Chromium Canvas verification all passed.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- whatsapp.ts
- createMessageRouter()