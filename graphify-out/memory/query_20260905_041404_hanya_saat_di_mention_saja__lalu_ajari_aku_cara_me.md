---
type: "query"
date: "2026-09-05T04:14:04.673828+00:00"
question: "hanya saat di-mention saja. lalu ajari aku cara mendapatkan id group nya"
contributor: "graphify"
outcome: "useful"
source_nodes: ["createWhatsAppClient()", "createMessageRouter()", "isDirectChatId()", "client"]
---

# Q: hanya saat di-mention saja. lalu ajari aku cara mendapatkan id group nya

## Answer

Mention-only dipilih. Cara paling sederhana mendapatkan ID grup adalah listener sementara client.on(message_create) di src/index.ts yang mencetak message.id.remote bila berakhiran @g.us; message_create diperlukan karena event message tidak menerima pesan dari akun sendiri. Setelah mengirim satu pesan sendiri ke grup, salin GROUP_ID ke TARGET_GROUP_IDS. Dukungan routing grup belum diaktifkan sampai ID dikonfirmasi dan pengguna memberi execute.

## Outcome

- Signal: useful

## Source Nodes

- createWhatsAppClient()
- createMessageRouter()
- isDirectChatId()
- client