# Quiz engine architecture

Phase 1 defines the PostgreSQL contract. Phase 2 connects incoming group text
to an atomic First Blood evaluator. Session creation, automatic round rotation,
and Gemini question generation remain outside Phase 2.

## Module boundaries

The directories below are created only when their implementation lands; empty
scaffolding is intentionally omitted.

```text
src/modules/quiz/
  domain/                  answer normalization and Levenshtein matching
  application/             evaluator input and outcome contracts
  infrastructure/          PostgreSQL transaction and scoring
  presentation/            WhatsApp input validation and reply delivery

src/modules/question-generation/
  application/             batch-generation use cases
  infrastructure/gemini    Gemini JSON generation and validation
  infrastructure/postgres  question persistence

database/
  migrations/              ordered forward-only PostgreSQL migrations
  verify-quiz-schema.sql    transactional constraint check
```

## First Blood transaction boundary

One bot process owns each WhatsApp group. Its `message_create` callback records
the server arrival time and places quiz candidates into a dedicated per-group
FIFO before performing asynchronous contact or mention lookups. The FIFO
consumer inserts attempts serially, so
`quiz.quiz_attempts.received_seq` records ingress order rather than WhatsApp's
sender timestamp.

The Phase 2 evaluator must use this lock order in one short transaction:

1. Lock the active `quiz.quiz_sessions` row with `SELECT ... FOR UPDATE`.
2. Lock/read the open `quiz.quiz_rounds` row.
3. Evaluate the next pending attempt by ascending `received_seq`.
4. Insert the idempotent `score_events` row.
5. Upsert `leaderboard` and insert the corresponding `outbox` row.
6. Commit before sending any WhatsApp reply.

The reply is dispatched outside the FIFO after commit. A successful delivery
marks its outbox row as published; a failed delivery leaves the row pending.

`FOR UPDATE SKIP LOCKED` is reserved for independent batch/outbox workers. It
must not be used when claiming the active session because skipping that lock
would allow a later answer to overtake an earlier answer.

## Agreed game semantics

- One running or paused session is allowed per group.
- Strict mode accepts one attempt per participant per round.
- Chaos mode accepts unlimited attempts, but awards at most one correct-answer
  reward per participant per round: 10 points for First Blood or 5 points for a
  later first correct answer.
- A normal Chaos round remains open for 30 seconds after First Blood. A Boss
  stage closes on its First Blood so one question can advance the Boss once.
- Boss Raid requires three consecutive correct stages from any contributors.
- Any non-command text during an open Boss stage is an attempt; an incorrect
  attempt resets the streak.
- Each unique Boss contributor keeps normal round points and receives one
  additional 50-point bonus when the Boss is defeated.
- Difficulty is 1 through 5. Season boundaries use `Asia/Jakarta`, while stored
  timestamps remain `TIMESTAMPTZ`.
- Monthly resets create a new season and new leaderboard rows; historical rows
  are retained.

## Phase 2 boundary

When `DATABASE_URL` is absent, startup logs that the quiz engine is disabled and
the existing Gemini/sticker commands continue to work. When it is present, the
bot verifies the Phase 1 schema before connecting WhatsApp. Only a pre-existing
running session with an open round consumes group answers; otherwise routing
falls back to the existing mention-only Gemini behavior.

Phase 2 deliberately does not implement `/kuis`, automatic next-question
scheduling, or an outbox retry worker. Those require the remaining decisions on
game length, Boss frequency, and retry policy.
