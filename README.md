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
QUIZ_DEFAULT_MODE=strict
QUIZ_QUESTION_COUNT=10
QUIZ_BOSS_EVERY=5
QUIZ_BATCH_SIZE=20
QUIZ_DURATION_SECONDS=30
QUIZ_TICK_MILLISECONDS=1000
QUIZ_GENERATION_INTERVAL_SECONDS=15
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

### Quiz commands

The quiz engine only runs in groups listed by `TARGET_GROUP_IDS`:

```text
/help
/start
/kuis
/kuis chaos sejarah Indonesia
/requestkuis film Indonesia
/klasemen
/pause
/resume
```

`/pause` and `/resume` are restricted to group admins (the linked account is
also allowed). Strict mode accepts one attempt per participant per question.
Chaos accepts unlimited attempts but awards each participant at most once per
question: 10 points for First Blood and 5 for later correct answers. Boss Raids
are collaborative, reset on an incorrect answer or timeout, require three
consecutive correct answers, and award every contributor a 50-point bonus.

## Quiz database

The approved quiz architecture and locking contract are documented in
[`docs/quiz-architecture.md`](docs/quiz-architecture.md). Apply the ordered
forward-only migrations to an empty `quiz` schema:

```bash
QUIZ_DATABASE_URL="$(node --env-file=.env -p 'process.env.DATABASE_URL')"

psql "$QUIZ_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f database/migrations/001_quiz_content.sql \
  -f database/migrations/002_quiz_runtime.sql \
  -f database/migrations/003_quiz_scoring_outbox.sql \
  -f database/migrations/004_quiz_lifecycle.sql

psql "$QUIZ_DATABASE_URL" -f database/verify-quiz-schema.sql
unset QUIZ_DATABASE_URL
```

The verification runs inside a transaction and rolls back its fixture data.
With `DATABASE_URL` configured, startup validates migrations 001-004. The bot
then runs per-group FIFO answer evaluation, atomic First Blood scoring,
automatic round rotation, monthly Asia/Jakarta seasons, adaptive difficulty,
collaborative Boss Raids, and a background Gemini JSON batch worker. If a topic
has too few questions, `/kuis` queues a batch and asks the user to retry after
the ready notification. Live rounds never wait for Gemini. Without
`DATABASE_URL`, quiz commands and answer evaluation are disabled while the
existing bot features continue to work.

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
