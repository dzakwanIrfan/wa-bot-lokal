# Local WhatsApp Gemini Bot

A local TypeScript auto-reply bot that sends whitelisted direct text messages
and explicitly mentioned messages from whitelisted groups to Gemini. Status,
broadcast, media, non-target, and unmentioned group messages are ignored before
the AI service is called.

> `whatsapp-web.js` is an unofficial WhatsApp client. Its maintainers cannot
> guarantee that an account will not be blocked. Start with a non-critical
> account. Gemini free-tier content may be used by Google to improve its
> products, so do not whitelist sensitive conversations.

## Requirements

- Node.js 20.6 or newer
- Google Chrome
- A WhatsApp account
- A Gemini API key from Google AI Studio

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

```dotenv
GEMINI_API_KEY=your_real_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
REPLY_STYLE_PROMPT="Use concise, natural WhatsApp language."
TARGET_PHONE_NUMBERS=["628123456789","628987654321"]
TARGET_GROUP_IDS=["120363000000000000@g.us"]
```

Use international phone numbers with the country code and without spaces or
dashes. A leading `+` is accepted. `REPLY_STYLE_PROMPT` is optional and is
appended to the trusted Gemini system instruction, separate from chat content.
`TARGET_GROUP_IDS` is optional; each ID must end in `@g.us`. The bot only replies
inside those groups when its linked WhatsApp account is explicitly mentioned.

### Text sticker command

Inside a whitelisted group, any participant (including the linked account) can
generate a text sticker without mentioning the bot:

```text
/sticker-text "sori keburu ngambek"
```

Text must be quoted and is limited to 160 characters and 10 explicit lines.
Line breaks inside the quotes are preserved; other text wraps automatically.
The `/sticker` command remains unused for a future image-to-sticker feature.

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
