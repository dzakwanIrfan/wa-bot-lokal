# Local WhatsApp Gemini Bot

A local TypeScript auto-reply bot that only sends whitelisted direct text
messages to Gemini. Group, status, broadcast, media, and non-target messages are
ignored before the AI service is called.

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
```

Use international phone numbers with the country code and without spaces or
dashes. A leading `+` is accepted. `REPLY_STYLE_PROMPT` is optional and is
appended to the trusted Gemini system instruction, separate from chat content.

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

The last 12 user/model messages per target are kept in RAM and reset whenever
the process restarts. Gemini `429` and `5xx` responses are retried after one and
two seconds; after that the failure is logged without sending a fallback reply.

Stop the bot with `Ctrl+C`.
