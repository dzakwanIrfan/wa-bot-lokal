---
type: "query"
date: "2026-09-05T10:03:53.357244+00:00"
question: "enhance fitur /sticker-text karena ukuran font dan layout belum dinamis; contoh memecah prabowo gapernah jumatan, Althof gajelas, dan literasi plz di tengah kata"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CommandHandler", "whatsapp.ts", "createMessageRouter"]
---

# Q: enhance fitur /sticker-text karena ukuran font dan layout belum dinamis; contoh memecah prabowo gapernah jumatan, Althof gajelas, dan literasi plz di tengah kata

## Answer

Expanded from original query via graph vocab: [command, handler, text, whatsapp]. Audit found routing and command parsing are correct; the root defect is in createTextStickerMedia canvas layout. It starts at 164px, greedily wraps, forcibly splits oversized words character-by-character, and accepts the first layout based only on total height. This makes 3B-style examples irrelevant and causes gapernah, gajelas, and literasi to be broken even though reducing font size would keep words intact. Recommended minimal fix: use Canvas measureText, shrink font until every normal word fits without character splitting and the full block fits, center the text block horizontally and vertically while preserving left-aligned lines and explicit newlines, and split characters only at the minimum font as a safety fallback. Add one regression check479 test using the three supplied phrases; no dependency or command change.

## Outcome

- Signal: useful

## Source Nodes

- CommandHandler
- whatsapp.ts
- createMessageRouter