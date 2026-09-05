---
type: "query"
date: "2026-09-05T09:40:41.220796+00:00"
question: "masih belum mau jawab pertanyaanku; pesan anggota lain diproses tetapi jawaban Dzakwan dari akun tertaut tidak diterima"
contributor: "graphify"
outcome: "corrected"
correction: "Use author presence to distinguish manual own-device group messages from bot-generated Web messages; normalize fromMe identity to client.info.wid."
source_nodes: ["createMessageRouter", "client", "whatsapp-web.js", "router.ts", "whatsapp.ts"]
---

# Q: masih belum mau jawab pertanyaanku; pesan anggota lain diproses tetapi jawaban Dzakwan dari akun tertaut tidak diterima

## Answer

Expanded from original query via graph vocab: [bot, client, handler, message, router, whatsapp]. Direct inspection of the active WhatsApp Web message store and PostgreSQL proved that Dzakwan own-device messages had fromMe=true, a 3B-prefixed 20-character message ID, and a populated device-suffixed author, while bot-generated messages had 3EB0-prefixed IDs and no author. whatsapp-web.js 1.34.7 classifies only IDs longer than 25 as Android and 3A as iOS, so the router deviceType guard incorrectly discarded these real Android messages before attempt insertion. Correct fix: distinguish own human messages by populated author and normalize fromMe participant identity to the client self ID; do not rely on deviceType.

## Outcome

- Signal: corrected
- Correction: Use author presence to distinguish manual own-device group messages from bot-generated Web messages; normalize fromMe identity to client.info.wid.

## Source Nodes

- createMessageRouter
- client
- whatsapp-web.js
- router.ts
- whatsapp.ts