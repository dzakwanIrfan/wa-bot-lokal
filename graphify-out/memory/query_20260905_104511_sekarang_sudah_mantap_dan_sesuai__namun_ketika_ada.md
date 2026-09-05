---
type: "query"
date: "2026-09-05T10:45:11.975104+00:00"
question: "sekarang sudah mantap dan sesuai. namun ketika ada sticker text panjang, masih belum sesuai dengan ekspektasi. di screenshot terlampir (belum) ada text panjang namun text nya tidak memenuhi kotak secara simetris, ukuran fontnya blm menyesuaikan . ekspektasi dan harapan adalah seperti pada gambar \"harapan\""
contributor: "graphify"
outcome: "useful"
source_nodes: ["createMessageRouter()", "CommandHandler", "router.ts", "app.test.ts"]
---

# Q: sekarang sudah mantap dan sesuai. namun ketika ada sticker text panjang, masih belum sesuai dengan ekspektasi. di screenshot terlampir (belum) ada text panjang namun text nya tidak memenuhi kotak secara simetris, ukuran fontnya blm menyesuaikan . ekspektasi dan harapan adalah seperti pada gambar "harapan"

## Answer

Expanded from graph vocabulary: [command, create, handler, message, router, text, whatsapp]. Graph traversal confirmed the command route through createMessageRouter and CommandHandler; direct source verification located the rendering issue in createTextStickerMedia. Real Chromium Canvas measurement reproduced the long sample at 24px with only six lines centered from y=181 to y=306. Root cause: whitespace-only tokenization treats a word plus an adjacent emoji run as one unbreakable token, so findLayout shrinks the entire composition to its minimum before it may split that token. Proposed fix: retain normal words intact, add native Intl.Segmenter grapheme break opportunities at emoji boundaries, then let the existing descending font fitter choose the largest valid layout and retain whole-block centering. Add one long mixed text and emoji regression check while preserving the three short-phrase cases. No dependency needed. Awaiting execute approval.

## Outcome

- Signal: useful

## Source Nodes

- createMessageRouter()
- CommandHandler
- router.ts
- app.test.ts