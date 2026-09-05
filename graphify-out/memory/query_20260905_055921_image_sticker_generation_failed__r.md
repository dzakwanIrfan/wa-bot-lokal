---
type: "query"
date: "2026-09-05T05:59:21.538016+00:00"
question: "Image sticker generation failed: r"
contributor: "graphify"
outcome: "useful"
source_nodes: ["client", "CommandHandler", "createMessageRouter()", "whatsapp-web.js"]
---

# Q: Image sticker generation failed: r

## Answer

Expanded from original query via vocab: [client, command, handler, message, router, routing, whatsapp]. Routing is working: createMessageRouter dispatches /sticker to CommandHandler. The failure occurs after dispatch in imageMediaFromCommand at source.downloadMedia(). Installed whatsapp-web.js 1.34.7 has a documented upstream failure where Message.downloadMedia rejects with the same opaque r: r error. Recommended minimal fix: keep routing unchanged, add a local media-download fallback using the serialized media metadata already carried by the Message, pre-render the result to WebP with the existing Puppeteer page, and add stage-specific errors. No new dependency.

## Outcome

- Signal: useful

## Source Nodes

- client
- CommandHandler
- createMessageRouter()
- whatsapp-web.js