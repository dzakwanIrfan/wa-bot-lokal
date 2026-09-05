# Local WhatsApp Gemini Bot

A local TypeScript auto-reply bot that sends whitelisted direct text messages
and explicitly mentioned messages from whitelisted groups to Gemini. Status,
broadcast, non-target, unmentioned group messages, and media without a supported
command are ignored before the AI service is called.

> `whatsapp-web.js` is an unofficial WhatsApp client. Its maintainers cannot
> guarantee that an account will not be blocked. Start with a non-critical
> account. Gemini free-tier content may be used by Google to improve its
> products, so do not whitelist sensitive conversations.

## Requirements

- Node.js 20.6 or newer
- Google Chrome
- A WhatsApp account
- A Gemini API key from Google AI Studio
- A PhotoRoom API key for `/remove-bg`
- PostgreSQL 14 or newer for the quiz engine schema

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

```dotenv
GEMINI_API_KEY=your_real_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
PHOTOROOM_API_KEY=your_photoroom_api_key
DATABASE_URL=postgresql://quiz_bot:your_password@127.0.0.1:5432/wa_bot
TARGET_PHONE_NUMBERS=["628123456789","628987654321"]
TARGET_GROUP_IDS=["120363000000000000@g.us"]
```

Use international phone numbers with the country code and without spaces or
dashes. A leading `+` is accepted. Edit `prompts/reply-style.md` to customize
the trusted Gemini writing style; the file is loaded once when the bot starts.
`TARGET_GROUP_IDS` is optional; each ID must end in `@g.us`. The bot only replies
to ordinary AI messages inside those groups when its linked WhatsApp account is
explicitly mentioned. Sticker commands below do not require a mention.

### Sticker commands

Inside a whitelisted group, any participant (including the linked account) can
generate stickers without mentioning the bot.

Send an image with `/sticker` as its caption, or reply to an existing image:

```text
/sticker
```

Generate a text sticker with:

```text
/sticker-text "sori keburu ngambek"
```

Text must be quoted and is limited to 160 characters and 10 explicit lines.
Line breaks inside the quotes are preserved; other text wraps automatically.

### Remove background command

Inside a whitelisted group, send an image with `/remove-bg` as its caption, or
reply to an existing image with:

```text
/remove-bg
```

The bot accepts JPG, PNG, WebP, and HEIC images up to 50 MB. The transparent
PNG result is returned as a document to preserve its quality. Processing uses
in-memory buffers only; no temporary image is written to disk. HTTP `429`
responses are reported without an automatic retry.

## Quiz engine schema (Phase 1)

The approved quiz architecture and locking contract are documented in
[`docs/quiz-architecture.md`](docs/quiz-architecture.md). Apply the ordered
forward-only migrations to an empty `quiz` schema:

```bash
QUIZ_DATABASE_URL="$(node --env-file=.env -p 'process.env.DATABASE_URL')"

psql "$QUIZ_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f database/migrations/001_quiz_content.sql \
  -f database/migrations/002_quiz_runtime.sql \
  -f database/migrations/003_quiz_scoring_outbox.sql

psql "$QUIZ_DATABASE_URL" -f database/verify-quiz-schema.sql
unset QUIZ_DATABASE_URL
```

The verification runs inside a transaction and rolls back its fixture data.
Phase 1 does not connect WhatsApp commands to PostgreSQL; that ingress and First
Blood evaluator belong to Phase 2.

## Verify and run

```bash
pnpm run check
pnpm test
pnpm run build
pnpm start
```

On the first run, open WhatsApp on your phone, go to **Settings > Linked
Devices**, and scan the QR shown in Terminal. The linked session is stored in
`.wwebjs_auth/`, so later starts normally do not require another scan.

The last 12 processed user/model messages per direct chat or group are kept in
RAM and reset whenever the process restarts. Gemini `429` and `5xx` responses are
retried after one and two seconds; after that the failure is logged without
sending a fallback reply.

Stop the bot with `Ctrl+C`.
