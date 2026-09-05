# Quiz engine architecture

Phase 1 defines the PostgreSQL contract only. The existing WhatsApp bot remains
unchanged until the Phase 2 message-ingress and First Blood worker are added.

## Module boundaries

The directories below are created only when their implementation lands; empty
scaffolding is intentionally omitted.

```text
src/modules/quiz/
  domain/                  game rules and answer matching
  application/             session, round, scoring, and command use cases
  infrastructure/postgres  repositories and transactions
  presentation/whatsapp    command parsing and reply formatting

src/modules/question-generation/
  application/             batch-generation use cases
  infrastructure/gemini    Gemini JSON generation and validation
  infrastructure/postgres  question persistence

database/
  migrations/              ordered forward-only PostgreSQL migrations
  verify-quiz-schema.sql    transactional constraint check
```

## First Blood transaction boundary

One bot process owns each WhatsApp group. Its `message_create` callback places
quiz candidates into a per-group FIFO before performing asynchronous contact or
mention lookups. The FIFO consumer inserts attempts serially, so
`quiz.quiz_attempts.received_seq` records ingress order rather than WhatsApp's
sender timestamp.

The Phase 2 evaluator must use this lock order in one short transaction:

1. Lock the active `quiz.quiz_sessions` row with `SELECT ... FOR UPDATE`.
2. Lock/read the open `quiz.quiz_rounds` row.
3. Evaluate the next pending attempt by ascending `received_seq`.
4. Insert the idempotent `score_events` row.
5. Upsert `leaderboard` and insert the corresponding `outbox` row.
6. Commit before sending any WhatsApp reply.

`FOR UPDATE SKIP LOCKED` is reserved for independent batch/outbox workers. It
must not be used when claiming the active session because skipping that lock
would allow a later answer to overtake an earlier answer.

## Agreed game semantics

- One running or paused session is allowed per group.
- Strict mode accepts one attempt per participant per round.
- Chaos mode accepts unlimited attempts, but awards at most one correct-answer
  reward per participant per round: 10 points for First Blood or 5 points for a
  later first correct answer.
- A Chaos round remains open for 30 seconds after First Blood.
- Boss Raid requires three consecutive correct stages from any contributors.
- Any non-command text during an open Boss stage is an attempt; an incorrect
  attempt resets the streak.
- Each unique Boss contributor keeps normal round points and receives one
  additional 50-point bonus when the Boss is defeated.
- Difficulty is 1 through 5. Season boundaries use `Asia/Jakarta`, while stored
  timestamps remain `TIMESTAMPTZ`.
- Monthly resets create a new season and new leaderboard rows; historical rows
  are retained.
