# Quiz engine architecture

Migrations 001-004 define the PostgreSQL contract. The runtime connects group
commands, FIFO answer evaluation, automatic round scheduling, seasonal scoring,
and Gemini batch generation to that contract.

## Module boundaries

The directories below are created only when their implementation lands; empty
scaffolding is intentionally omitted.

```text
src/modules/quiz/
  domain/                  answer matching, command input, season boundaries
  application/             evaluator contracts and background runtime
  infrastructure/          PostgreSQL game state and Gemini batch generation
  presentation/            WhatsApp commands, validation, and reply delivery

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

The evaluator uses this lock order in one short transaction:

1. Lock the active `quiz.quiz_sessions` row with `SELECT ... FOR UPDATE`.
2. Lock/read the open `quiz.quiz_rounds` row.
3. Insert and evaluate the FIFO-delivered attempt, assigning `received_seq`.
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

## Runtime lifecycle

When `DATABASE_URL` is absent, startup logs that the quiz engine is disabled and
the existing Gemini/sticker commands continue to work. When present, startup
verifies all required relations before connecting WhatsApp.

`/kuis` creates the monthly Asia/Jakarta season and an active session only when
the database already has enough questions. The runtime opens and expires rounds
in short transactions; Gemini never runs on the live-answer path. A separate
timer claims one queued `generation_batches` row with `FOR UPDATE SKIP LOCKED`,
calls Gemini outside the transaction, validates its JSON, and persists the
result. Failed batches are recorded once and are not automatically requeued.

Question count, Boss frequency, duration, batch size, and worker intervals are
explicit environment configuration. Historical leaderboards remain attached to
closed seasons and `quiz.season_group_history` exposes their group totals.
