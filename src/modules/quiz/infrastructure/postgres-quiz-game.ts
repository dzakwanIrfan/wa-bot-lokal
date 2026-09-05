import type { Pool, PoolClient } from "pg";

import type {
  GeneratedQuestion,
  QuestionBatch,
} from "../application/generate-questions.js";
import type { QuizMode } from "../application/evaluate-attempt.js";
import {
  adaptiveDifficulty,
  jakartaMonthBounds,
  type QuizStartRequest,
} from "../domain/game.js";

export type QuizGameDefaults = Readonly<{
  questionCount: number;
  bossEvery: number;
  batchSize: number;
  durationSeconds: number;
  model: string;
}>;

export type QuizStartResult =
  | Readonly<{ kind: "started"; messages: readonly string[]; outboxIds: readonly string[] }>
  | Readonly<{ kind: "already-active" }>
  | Readonly<{ kind: "questions-queued"; missing: number; batchId: string }>;

export type QuizControlResult = "updated" | "already-set" | "no-active";
export type QuizStopResult =
  | Readonly<{ kind: "stopped"; outboxIds: readonly string[] }>
  | Readonly<{ kind: "no-active" }>;

type SessionRow = Readonly<{
  id: string;
  season_id: string;
  group_id: string;
  topic: string;
  mode: QuizMode;
  status: "running" | "paused";
  difficulty: number;
  question_duration_seconds: number;
  question_count: number;
  boss_every: number;
  boss_required_correct_answers: number;
}>;

type RoundAnnouncement = Readonly<{
  message: string;
  outboxId: string;
}>;

type AdvanceResult = Readonly<{
  messages: readonly string[];
  outboxIds: readonly string[];
}>;

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    client.release(destroy);
  }
}

async function participantId(
  client: PoolClient,
  whatsappUserId: string,
  displayName?: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz.participants (whatsapp_user_id, display_name)
      VALUES ($1, NULLIF($2, ''))
      ON CONFLICT (whatsapp_user_id) DO UPDATE
      SET
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), quiz.participants.display_name),
        updated_at = clock_timestamp()
      RETURNING id::text
    `,
    [whatsappUserId, displayName?.slice(0, 120) ?? ""],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Failed to resolve quiz participant.");
  return id;
}

async function currentSeasonId(client: PoolClient, now = new Date()): Promise<string> {
  const month = jakartaMonthBounds(now);
  await client.query(
    `
      UPDATE quiz.seasons
      SET status = 'closed'
      WHERE status = 'active' AND NOT (starts_at = $1 AND ends_at = $2)
    `,
    [month.startsAt, month.endsAt],
  );
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz.seasons (name, starts_at, ends_at, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (starts_at, ends_at) DO UPDATE SET status = 'active'
      RETURNING id::text
    `,
    [month.name, month.startsAt, month.endsAt],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Failed to resolve the current quiz season.");
  return id;
}

async function groupDifficulty(
  client: PoolClient,
  groupId: string,
): Promise<{ difficulty: number; winRate: number | null }> {
  const result = await client.query<{ win_rate: string | null }>(
    `
      SELECT
        CASE WHEN sum(rounds_played) = 0 THEN NULL
          ELSE sum(rounds_won)::numeric / sum(rounds_played)::numeric
        END::text AS win_rate
      FROM quiz.group_topic_performance
      WHERE group_id = $1
    `,
    [groupId],
  );
  const raw = result.rows[0]?.win_rate;
  const winRate = raw === null || raw === undefined ? null : Number(raw);
  return { difficulty: adaptiveDifficulty(winRate), winRate };
}

async function queueBatch(
  client: PoolClient,
  input: Readonly<{
    groupId: string;
    topic: string;
    difficulty: number;
    winRate: number | null;
    count: number;
    model: string;
  }>,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM quiz.generation_batches
      WHERE group_id = $1 AND topic = $2 AND requested_difficulty = $3
        AND status IN ('queued', 'running')
      ORDER BY id
      LIMIT 1
    `,
    [input.groupId, input.topic, input.difficulty],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz.generation_batches (
        group_id, topic, requested_difficulty, group_win_rate,
        requested_count, model_name, prompt_version
      ) VALUES ($1, $2, $3, $4, $5, $6, 'quiz-v2')
      RETURNING id::text
    `,
    [
      input.groupId,
      input.topic,
      input.difficulty,
      input.winRate,
      input.count,
      input.model,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Failed to queue a quiz generation batch.");
  return id;
}

async function insertOutbox(
  client: PoolClient,
  eventKey: string,
  sessionId: string,
  eventType: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz.outbox (
        event_key, aggregate_type, aggregate_id, event_type, payload
      ) VALUES ($1, 'quiz_session', $2, $3, $4::jsonb)
      ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
      RETURNING id::text
    `,
    [eventKey, sessionId, eventType, JSON.stringify(payload)],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Failed to persist a quiz outbox event.");
  return id;
}

function questionMessage(
  ordinal: number,
  questionText: string,
  persona: string | null,
  durationSeconds: number,
  bossProgress?: Readonly<{ current: number; required: number }>,
): string {
  const header = bossProgress
    ? `👑 *BOSS RAID ${bossProgress.current}/${bossProgress.required}*`
    : `🧠 *Soal ${ordinal}*`;
  return [header, persona, questionText, `⏱️ Waktu: ${durationSeconds} detik`]
    .filter(Boolean)
    .join("\n\n");
}

export class PostgresQuizGame {
  constructor(
    private readonly pool: Pool,
    private readonly defaults: QuizGameDefaults,
  ) {}

  async start(
    groupId: string,
    actorWhatsAppId: string,
    actorName: string | undefined,
    request: QuizStartRequest,
  ): Promise<QuizStartResult> {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [groupId]);
      const active = await client.query(
        `SELECT 1 FROM quiz.quiz_sessions WHERE group_id = $1 AND status IN ('running', 'paused')`,
        [groupId],
      );
      if (active.rowCount) return { kind: "already-active" } as const;

      const creatorId = await participantId(client, actorWhatsAppId, actorName);
      const seasonId = await currentSeasonId(client);
      const adaptive = await groupDifficulty(client, groupId);
      const bossCount = this.defaults.bossEvery > 0
        ? Math.floor(this.defaults.questionCount / this.defaults.bossEvery)
        : 0;
      const needed = this.defaults.questionCount +
        bossCount * 3;
      const ready = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM quiz.questions
          WHERE status = 'ready' AND difficulty = $1
            AND (source = 'manual' OR quality_version >= 2)
            AND ($2 = 'campuran' OR lower(topic) = $2)
        `,
        [adaptive.difficulty, request.topic],
      );
      const available = Number(ready.rows[0]?.count ?? 0);
      if (available < needed) {
        const missing = needed - available;
        const batchId = await queueBatch(client, {
          groupId,
          topic: request.topic,
          difficulty: adaptive.difficulty,
          winRate: adaptive.winRate,
          count: Math.min(100, Math.max(this.defaults.batchSize, missing)),
          model: this.defaults.model,
        });
        return { kind: "questions-queued", missing, batchId } as const;
      }

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO quiz.quiz_sessions (
            season_id, group_id, topic, mode, difficulty,
            question_duration_seconds, created_by, question_count, boss_every
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id::text
        `,
        [
          seasonId,
          groupId,
          request.topic,
          request.mode,
          adaptive.difficulty,
          this.defaults.durationSeconds,
          creatorId,
          this.defaults.questionCount,
          this.defaults.bossEvery,
        ],
      );
      const sessionId = sessionResult.rows[0]?.id;
      if (!sessionId) throw new Error("Failed to create quiz session.");
      await client.query(
        `
          INSERT INTO quiz.session_events (event_key, session_id, actor_participant_id, event_type)
          VALUES ($1, $2, $3, 'session_started')
        `,
        [`session-started:${sessionId}`, sessionId, creatorId],
      );
      const session = await this.lockSession(client, sessionId);
      const opened = await this.openNextRound(client, session);
      if (!opened) throw new Error("Failed to open the first quiz round.");

      return {
        kind: "started",
        messages: [`🎮 Kuis dimulai! Mode *${request.mode.toUpperCase()}*, topik *${request.topic}*, tingkat ${adaptive.difficulty}/5.\n\n${opened.message}`],
        outboxIds: [opened.outboxId],
      } as const;
    });
  }

  async requestQuestions(
    groupId: string,
    actorWhatsAppId: string,
    actorName: string | undefined,
    topic: string,
  ): Promise<{ batchId: string; difficulty: number }> {
    return transaction(this.pool, async (client) => {
      const requesterId = await participantId(client, actorWhatsAppId, actorName);
      const adaptive = await groupDifficulty(client, groupId);
      const batchId = await queueBatch(client, {
        groupId,
        topic,
        difficulty: adaptive.difficulty,
        winRate: adaptive.winRate,
        count: this.defaults.batchSize,
        model: this.defaults.model,
      });
      await client.query(
        `
          INSERT INTO quiz.question_requests (
            group_id, requested_by, generation_batch_id, topic
          ) VALUES ($1, $2, $3, $4)
        `,
        [groupId, requesterId, batchId, topic],
      );
      return { batchId, difficulty: adaptive.difficulty };
    });
  }

  async leaderboard(groupId: string): Promise<readonly string[]> {
    return transaction(this.pool, async (client) => {
      const seasonId = await currentSeasonId(client);
      const result = await client.query<{
        display_name: string | null;
        whatsapp_user_id: string;
        points: string;
        first_bloods: number;
      }>(
        `
          SELECT participant.display_name, participant.whatsapp_user_id,
            leaderboard.points::text, leaderboard.first_bloods
          FROM quiz.leaderboard AS leaderboard
          JOIN quiz.participants AS participant ON participant.id = leaderboard.participant_id
          WHERE leaderboard.season_id = $1 AND leaderboard.group_id = $2
          ORDER BY leaderboard.points DESC, leaderboard.first_bloods DESC,
            leaderboard.updated_at, leaderboard.participant_id
          LIMIT 10
        `,
        [seasonId, groupId],
      );
      return result.rows.map((row, index) => {
        const fallback = row.whatsapp_user_id.split("@", 1)[0] ?? "peserta";
        const name = row.display_name || `...${fallback.slice(-4)}`;
        return `${index + 1}. ${name} — ${row.points} poin (${row.first_bloods} FB)`;
      });
    });
  }

  async setPaused(groupId: string, paused: boolean): Promise<QuizControlResult> {
    return transaction(this.pool, async (client) => {
      const sessionResult = await client.query<SessionRow>(
        `
          SELECT id::text, season_id::text, group_id, topic, mode, status,
            difficulty, question_duration_seconds, question_count, boss_every,
            boss_required_correct_answers
          FROM quiz.quiz_sessions
          WHERE group_id = $1 AND status IN ('running', 'paused')
          ORDER BY id DESC LIMIT 1 FOR UPDATE
        `,
        [groupId],
      );
      const session = sessionResult.rows[0];
      if (!session) return "no-active";
      if ((paused && session.status === "paused") || (!paused && session.status === "running")) {
        return "already-set";
      }

      await client.query(
        `
          UPDATE quiz.quiz_sessions
          SET status = $2,
            paused_at = CASE WHEN $2 = 'paused' THEN clock_timestamp() ELSE NULL END
          WHERE id = $1
        `,
        [session.id, paused ? "paused" : "running"],
      );
      if (!paused) {
        await client.query(
          `
            UPDATE quiz.quiz_rounds
            SET closes_at = clock_timestamp() + ($2 * interval '1 second')
            WHERE session_id = $1 AND status = 'open'
          `,
          [session.id, session.question_duration_seconds],
        );
      }
      await client.query(
        `
          INSERT INTO quiz.session_events (event_key, session_id, event_type)
          VALUES (
            $1 || ':' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text,
            $2,
            $3
          )
        `,
        [paused ? "session-paused" : "session-resumed", session.id, paused ? "session_paused" : "session_resumed"],
      );
      return "updated";
    });
  }

  async stop(groupId: string): Promise<QuizStopResult> {
    return transaction(this.pool, async (client) => {
      const sessionResult = await client.query<{ id: string }>(
        `
          SELECT id::text FROM quiz.quiz_sessions
          WHERE group_id = $1 AND status IN ('running', 'paused')
          ORDER BY id DESC LIMIT 1 FOR UPDATE
        `,
        [groupId],
      );
      const sessionId = sessionResult.rows[0]?.id;
      if (!sessionId) return { kind: "no-active" };

      await client.query(
        `
          UPDATE quiz.quiz_rounds
          SET status = 'cancelled', closed_at = clock_timestamp()
          WHERE session_id = $1 AND status IN ('pending', 'open')
        `,
        [sessionId],
      );
      await client.query(
        `
          UPDATE quiz.boss_raids
          SET status = 'cancelled', ended_at = clock_timestamp()
          WHERE session_id = $1 AND status = 'active'
        `,
        [sessionId],
      );
      await client.query(
        `
          UPDATE quiz.quiz_sessions
          SET status = 'cancelled', ended_at = clock_timestamp()
          WHERE id = $1
        `,
        [sessionId],
      );
      await client.query(
        `
          INSERT INTO quiz.session_events (event_key, session_id, event_type)
          VALUES ($1, $2, 'session_cancelled')
        `,
        [`session-cancelled:${sessionId}`, sessionId],
      );
      const message = "⏹️ Kuis dihentikan oleh admin.";
      const outboxId = await insertOutbox(
        client,
        `session-cancelled:${sessionId}`,
        sessionId,
        "quiz.session_cancelled",
        { groupId, message },
      );
      return { kind: "stopped", outboxIds: [outboxId] };
    });
  }

  async groupsNeedingAdvance(): Promise<readonly string[]> {
    const result = await this.pool.query<{ group_id: string }>(
      `
        SELECT session.group_id
        FROM quiz.quiz_sessions AS session
        LEFT JOIN quiz.quiz_rounds AS round
          ON round.session_id = session.id AND round.status = 'open'
        WHERE session.status = 'running'
          AND (round.id IS NULL OR round.closes_at <= clock_timestamp())
        ORDER BY session.id
        LIMIT 100
      `,
    );
    return result.rows.map(({ group_id }) => group_id);
  }

  async advance(groupId: string): Promise<AdvanceResult> {
    return transaction(this.pool, async (client) => {
      const sessionResult = await client.query<SessionRow>(
        `
          SELECT id::text, season_id::text, group_id, topic, mode, status,
            difficulty, question_duration_seconds, question_count, boss_every,
            boss_required_correct_answers
          FROM quiz.quiz_sessions
          WHERE group_id = $1 AND status IN ('running', 'paused')
          ORDER BY id DESC LIMIT 1 FOR UPDATE
        `,
        [groupId],
      );
      const session = sessionResult.rows[0];
      if (!session || session.status === "paused") return { messages: [], outboxIds: [] };

      const messages: string[] = [];
      const outboxIds: string[] = [];
      const open = await client.query<{
        id: string;
        closes_at: Date;
        boss_raid_id: string | null;
        canonical_answer: string;
        explanation: string | null;
      }>(
        `
          SELECT round.id::text, round.closes_at, round.boss_raid_id::text,
            question.canonical_answer, question.explanation
          FROM quiz.quiz_rounds AS round
          JOIN quiz.questions AS question ON question.id = round.question_id
          WHERE round.session_id = $1 AND round.status = 'open'
          FOR UPDATE OF round
        `,
        [session.id],
      );
      const current = open.rows[0];
      if (current && current.closes_at.getTime() > Date.now()) {
        return { messages, outboxIds };
      }
      if (current) {
        await client.query(
          `UPDATE quiz.quiz_rounds SET status = 'expired', closed_at = clock_timestamp() WHERE id = $1`,
          [current.id],
        );
        await client.query(
          `
            INSERT INTO quiz.session_events (
              event_key, session_id, round_id, event_type, payload
            ) VALUES ($1, $2, $3, 'round_closed', '{"reason":"deadline"}'::jsonb)
            ON CONFLICT (event_key) DO NOTHING
          `,
          [`round-expired:${current.id}`, session.id, current.id],
        );
        let bossEnded = false;
        if (current.boss_raid_id) {
          const ended = await client.query(
            `
              UPDATE quiz.boss_raids
              SET status = 'expired', ended_at = clock_timestamp()
              WHERE id = $1 AND status = 'active'
              RETURNING id
            `,
            [current.boss_raid_id],
          );
          if (ended.rowCount) {
            await client.query(
              `
                INSERT INTO quiz.session_events (
                  event_key, session_id, round_id, event_type, payload
                ) VALUES ($1, $2, $3, 'boss_expired', '{"reason":"deadline"}'::jsonb)
                ON CONFLICT (event_key) DO NOTHING
              `,
              [`boss-expired:${current.id}`, session.id, current.id],
            );
            bossEnded = true;
          }
        }
        const timeoutMessage = [
          `⏰ Waktu habis. Jawabannya: *${current.canonical_answer}*`,
          current.explanation,
          bossEnded ? "💀 Boss Raid berakhir. Kuis lanjut ke soal normal." : null,
        ].filter(Boolean).join("\n");
        messages.push(timeoutMessage);
        outboxIds.push(await insertOutbox(
          client,
          `round-expired:${current.id}`,
          session.id,
          "quiz.round_expired",
          { groupId, message: timeoutMessage },
        ));
      }

      const next = await this.openNextRound(client, session);
      if (next) {
        messages.push(next.message);
        outboxIds.push(next.outboxId);
      } else {
        const completed = await client.query(
          `
            UPDATE quiz.quiz_sessions
            SET status = 'completed', ended_at = clock_timestamp()
            WHERE id = $1 AND status = 'running'
            RETURNING id
          `,
          [session.id],
        );
        if (completed.rowCount) {
          const message = "🏁 Kuis selesai! Ketik /klasemen untuk melihat hasil musim ini.";
          messages.push(message);
          await client.query(
            `
              INSERT INTO quiz.session_events (event_key, session_id, event_type)
              VALUES ($1, $2, 'session_completed')
              ON CONFLICT (event_key) DO NOTHING
            `,
            [`session-completed:${session.id}`, session.id],
          );
          outboxIds.push(await insertOutbox(
            client,
            `session-completed:${session.id}`,
            session.id,
            "quiz.session_completed",
            { groupId, message },
          ));
        }
      }
      return { messages, outboxIds };
    });
  }

  async claimGenerationBatch(): Promise<QuestionBatch | null> {
    return transaction(this.pool, async (client) => {
      const stale = await client.query<{ id: string }>(
        `
          UPDATE quiz.generation_batches
          SET status = 'failed', completed_at = clock_timestamp(),
            error_message = 'Worker stopped before completing this batch.'
          WHERE status = 'running'
            AND started_at < clock_timestamp() - interval '15 minutes'
          RETURNING id::text
        `,
      );
      if (stale.rows.length > 0) {
        await client.query(
          `
            UPDATE quiz.question_requests
            SET status = 'failed', completed_at = clock_timestamp()
            WHERE generation_batch_id = ANY($1::bigint[])
              AND status IN ('queued', 'generating')
          `,
          [stale.rows.map(({ id }) => id)],
        );
      }
      const result = await client.query<{
        id: string;
        group_id: string | null;
        topic: string;
        requested_difficulty: number;
        group_win_rate: string | null;
        requested_count: number;
        model_name: string;
      }>(
        `
          WITH claimed AS (
            SELECT id FROM quiz.generation_batches
            WHERE status = 'queued'
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE quiz.generation_batches AS batch
          SET status = 'running', started_at = clock_timestamp(), error_message = NULL
          FROM claimed
          WHERE batch.id = claimed.id
          RETURNING batch.id::text, batch.group_id, batch.topic,
            batch.requested_difficulty, batch.group_win_rate::text,
            batch.requested_count, batch.model_name
        `,
      );
      const row = result.rows[0];
      if (row) {
        await client.query(
          `
            UPDATE quiz.question_requests
            SET status = 'generating'
            WHERE generation_batch_id = $1 AND status = 'queued'
          `,
          [row.id],
        );
      }
      return row
        ? {
            id: row.id,
            groupId: row.group_id,
            topic: row.topic,
            difficulty: row.requested_difficulty,
            groupWinRate: row.group_win_rate === null ? null : Number(row.group_win_rate),
            count: row.requested_count,
            model: row.model_name,
          }
        : null;
    });
  }

  async completeGenerationBatch(
    batch: QuestionBatch,
    questions: readonly GeneratedQuestion[],
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const running = await client.query(
        `SELECT 1 FROM quiz.generation_batches WHERE id = $1 AND status = 'running' FOR UPDATE`,
        [batch.id],
      );
      if (!running.rowCount) return;

      for (const question of questions.slice(0, batch.count)) {
        await client.query(
          `
            INSERT INTO quiz.questions (
              generation_batch_id, topic, difficulty, question_text,
              canonical_answer, accepted_answers, max_levenshtein_distance,
              explanation, persona_prompt, quality_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2)
          `,
          [
            batch.id,
            batch.topic,
            batch.difficulty,
            question.questionText,
            question.canonicalAnswer,
            question.acceptedAnswers,
            question.maxLevenshteinDistance,
            question.explanation,
            question.personaPrompt,
          ],
        );
      }
      await client.query(
        `
          UPDATE quiz.generation_batches
          SET status = 'completed', generated_count = $2, completed_at = clock_timestamp()
          WHERE id = $1
        `,
        [batch.id, Math.min(batch.count, questions.length)],
      );
      await client.query(
        `
          UPDATE quiz.question_requests
          SET status = 'completed', completed_at = clock_timestamp()
          WHERE generation_batch_id = $1 AND status IN ('queued', 'generating')
        `,
        [batch.id],
      );
    });
  }

  async failGenerationBatch(batchId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    await this.pool.query(
      `
        WITH failed AS (
          UPDATE quiz.generation_batches
          SET status = 'failed', error_message = $2, completed_at = clock_timestamp()
          WHERE id = $1 AND status = 'running'
          RETURNING id
        )
        UPDATE quiz.question_requests
        SET status = 'failed', completed_at = clock_timestamp()
        FROM failed
        WHERE generation_batch_id = failed.id AND status IN ('queued', 'generating')
      `,
      [batchId, message.slice(0, 500)],
    );
  }

  async markOutboxPublished(outboxIds: readonly string[]): Promise<void> {
    if (outboxIds.length === 0) return;
    await this.pool.query(
      `
        UPDATE quiz.outbox
        SET status = 'published', published_at = clock_timestamp(), last_error = NULL
        WHERE id = ANY($1::bigint[]) AND status = 'pending'
      `,
      [outboxIds],
    );
  }

  private async lockSession(client: PoolClient, sessionId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        SELECT id::text, season_id::text, group_id, topic, mode, status,
          difficulty, question_duration_seconds, question_count, boss_every,
          boss_required_correct_answers
        FROM quiz.quiz_sessions WHERE id = $1 FOR UPDATE
      `,
      [sessionId],
    );
    const session = result.rows[0];
    if (!session) throw new Error("Quiz session disappeared during transaction.");
    return session;
  }

  private async openNextRound(
    client: PoolClient,
    session: SessionRow,
  ): Promise<RoundAnnouncement | null> {
    const counts = await client.query<{ total: number; normal: number }>(
      `
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE boss_raid_id IS NULL)::int AS normal
        FROM quiz.quiz_rounds WHERE session_id = $1
      `,
      [session.id],
    );
    const total = counts.rows[0]?.total ?? 0;
    const normal = counts.rows[0]?.normal ?? 0;
    const activeBossResult = await client.query<{
      id: string;
      current_streak: number;
      required_correct_answers: number;
    }>(
      `
        SELECT id::text, current_streak, required_correct_answers
        FROM quiz.boss_raids
        WHERE session_id = $1 AND status = 'active'
        FOR UPDATE
      `,
      [session.id],
    );
    let boss = activeBossResult.rows[0] ?? null;

    if (
      !boss &&
      session.boss_every > 0 &&
      normal > 0 &&
      normal % session.boss_every === 0
    ) {
      const bossOrdinal = normal / session.boss_every;
      const previous = await client.query(
        `SELECT 1 FROM quiz.boss_raids WHERE session_id = $1 AND ordinal = $2`,
        [session.id, bossOrdinal],
      );
      if (!previous.rowCount) {
        const created = await client.query<{
          id: string;
          current_streak: number;
          required_correct_answers: number;
        }>(
          `
            INSERT INTO quiz.boss_raids (session_id, ordinal, required_correct_answers)
            VALUES ($1, $2, $3)
            RETURNING id::text, current_streak, required_correct_answers
          `,
          [session.id, bossOrdinal, session.boss_required_correct_answers],
        );
        boss = created.rows[0] ?? null;
        if (boss) {
          await client.query(
            `
              INSERT INTO quiz.session_events (event_key, session_id, event_type, payload)
              VALUES ($1, $2, 'boss_started', $3::jsonb)
            `,
            [`boss-started:${boss.id}`, session.id, JSON.stringify({ ordinal: bossOrdinal })],
          );
        }
      }
    }

    if (!boss && normal >= session.question_count) return null;

    const question = await client.query<{
      id: string;
      question_text: string;
      persona_prompt: string | null;
    }>(
      `
        SELECT question.id::text, question.question_text, question.persona_prompt
        FROM quiz.questions AS question
        WHERE question.status = 'ready' AND question.difficulty = $2
          AND (question.source = 'manual' OR question.quality_version >= 2)
          AND ($3 = 'campuran' OR lower(question.topic) = $3)
          AND NOT EXISTS (
            SELECT 1 FROM quiz.quiz_rounds AS used
            WHERE used.session_id = $1 AND used.question_id = question.id
          )
        ORDER BY question.id
        LIMIT 1
      `,
      [session.id, session.difficulty, session.topic],
    );
    const selected = question.rows[0];
    if (!selected) throw new Error("Quiz question pool became empty during an active session.");

    const round = await client.query<{ id: string }>(
      `
        INSERT INTO quiz.quiz_rounds (
          session_id, question_id, boss_raid_id, ordinal, mode,
          status, opened_at, closes_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'open', clock_timestamp(),
          clock_timestamp() + ($6 * interval '1 second')
        )
        RETURNING id::text
      `,
      [
        session.id,
        selected.id,
        boss?.id ?? null,
        total + 1,
        session.mode,
        session.question_duration_seconds,
      ],
    );
    const roundId = round.rows[0]?.id;
    if (!roundId) throw new Error("Failed to open quiz round.");
    await client.query(
      `
        INSERT INTO quiz.session_events (
          event_key, session_id, round_id, event_type, payload
        ) VALUES ($1, $2, $3, 'round_opened', $4::jsonb)
      `,
      [`round-opened:${roundId}`, session.id, roundId, JSON.stringify({ ordinal: total + 1 })],
    );
    const message = questionMessage(
      boss ? boss.current_streak + 1 : normal + 1,
      selected.question_text,
      selected.persona_prompt,
      session.question_duration_seconds,
      boss
        ? { current: boss.current_streak + 1, required: boss.required_correct_answers }
        : undefined,
    );
    const outboxId = await insertOutbox(
      client,
      `round-opened:${roundId}`,
      session.id,
      "quiz.round_opened",
      { groupId: session.group_id, roundId, message },
    );
    return { message, outboxId };
  }
}
