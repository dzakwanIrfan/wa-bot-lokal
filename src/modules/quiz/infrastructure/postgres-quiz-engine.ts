import type { Pool, PoolClient } from "pg";

import type {
  QuizAttemptInput,
  QuizAttemptOutcome,
  QuizMode,
} from "../application/evaluate-attempt.js";
import { evaluateQuizAnswer } from "../domain/answer.js";

const MAX_STORED_ANSWER_LENGTH = 500;

type SessionRow = Readonly<{
  id: string;
  season_id: string;
  group_id: string;
  mode: QuizMode;
  status: "running" | "paused";
  first_blood_points: number;
  chaos_followup_points: number;
  boss_contributor_bonus_points: number;
}>;

type RoundRow = Readonly<{
  id: string;
  boss_raid_id: string | null;
  closes_at: Date;
  first_blood_received_seq: string | null;
  canonical_answer: string;
  accepted_answers: string[];
  max_levenshtein_distance: number;
}>;

type BossRow = Readonly<{
  id: string;
  current_streak: number;
  required_correct_answers: number;
}>;

async function insertOutbox(
  client: PoolClient,
  eventKey: string,
  sessionId: string,
  eventType: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz.outbox (
        event_key,
        aggregate_type,
        aggregate_id,
        event_type,
        payload
      ) VALUES ($1, 'quiz_session', $2, $3, $4::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING id::text
    `,
    [eventKey, sessionId, eventType, JSON.stringify(payload)],
  );

  return result.rows.map(({ id }) => id);
}

async function insertSessionEvent(
  client: PoolClient,
  eventKey: string,
  sessionId: string,
  roundId: string,
  participantId: string | null,
  eventType: string,
  payload: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  await client.query(
    `
      INSERT INTO quiz.session_events (
        event_key,
        session_id,
        round_id,
        actor_participant_id,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (event_key) DO NOTHING
    `,
    [eventKey, sessionId, roundId, participantId, eventType, JSON.stringify(payload)],
  );
}

async function commit(
  client: PoolClient,
  outcome: QuizAttemptOutcome,
): Promise<QuizAttemptOutcome> {
  await client.query("COMMIT");
  return outcome;
}

export class PostgresQuizEngine {
  constructor(private readonly pool: Pool) {}

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

  async evaluateAttempt(
    input: QuizAttemptInput,
  ): Promise<QuizAttemptOutcome> {
    const client = await this.pool.connect();
    let transactionStarted = false;
    let destroyClient = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const sessionResult = await client.query<SessionRow>(
        `
          SELECT
            id::text,
            season_id::text,
            group_id,
            mode,
            status,
            first_blood_points,
            chaos_followup_points,
            boss_contributor_bonus_points
          FROM quiz.quiz_sessions
          WHERE group_id = $1 AND status IN ('running', 'paused')
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
        [input.groupId],
      );
      const session = sessionResult.rows[0];

      if (!session) {
        return commit(client, { handled: false, kind: "inactive" });
      }
      if (session.status === "paused") {
        return commit(client, { handled: true, kind: "paused" });
      }

      const roundResult = await client.query<RoundRow>(
        `
          SELECT
            qr.id::text,
            qr.boss_raid_id::text,
            qr.closes_at,
            qr.first_blood_received_seq::text,
            q.canonical_answer,
            q.accepted_answers,
            q.max_levenshtein_distance
          FROM quiz.quiz_rounds AS qr
          JOIN quiz.questions AS q ON q.id = qr.question_id
          WHERE qr.session_id = $1 AND qr.status = 'open'
          ORDER BY qr.ordinal
          LIMIT 1
          FOR UPDATE OF qr
        `,
        [session.id],
      );
      const round = roundResult.rows[0];

      if (!round) {
        return commit(client, { handled: true, kind: "no-round" });
      }

      let boss: BossRow | null = null;
      if (round.boss_raid_id) {
        const bossResult = await client.query<BossRow>(
          `
            SELECT id::text, current_streak, required_correct_answers
            FROM quiz.boss_raids
            WHERE id = $1 AND session_id = $2 AND status = 'active'
            FOR UPDATE
          `,
          [round.boss_raid_id, session.id],
        );
        boss = bossResult.rows[0] ?? null;
      }

      if (input.receivedAt.getTime() > round.closes_at.getTime()) {
        await client.query(
          `
            UPDATE quiz.quiz_rounds
            SET status = 'expired', closed_at = clock_timestamp()
            WHERE id = $1
          `,
          [round.id],
        );
        await insertSessionEvent(
          client,
          `round-expired:${round.id}`,
          session.id,
          round.id,
          null,
          "round_closed",
          { reason: "deadline" },
        );
        let bossEnded = false;
        if (boss) {
          await client.query(
            `
              UPDATE quiz.boss_raids
              SET status = 'expired', ended_at = clock_timestamp()
              WHERE id = $1
            `,
            [boss.id],
          );
          await insertSessionEvent(
            client,
            `boss-expired:${round.id}`,
            session.id,
            round.id,
            null,
            "boss_expired",
            { progress: boss.current_streak, reason: "deadline" },
          );
          bossEnded = true;
        }
        const outboxIds = await insertOutbox(
          client,
          `round-expired:${round.id}`,
          session.id,
          "quiz.round_expired",
          { groupId: input.groupId, roundId: round.id },
        );

        return commit(client, {
          handled: true,
          kind: "expired",
          bossEnded,
          bossRequired: boss?.required_correct_answers,
          outboxIds,
        });
      }

      const participantResult = await client.query<{ id: string }>(
        `
          INSERT INTO quiz.participants (whatsapp_user_id)
          VALUES ($1)
          ON CONFLICT (whatsapp_user_id) DO UPDATE
          SET updated_at = clock_timestamp()
          RETURNING id::text
        `,
        [input.participantWhatsAppId],
      );
      const participantId = participantResult.rows[0]?.id;
      if (!participantId) throw new Error("Failed to resolve quiz participant.");

      const answer = evaluateQuizAnswer(input.answerText, {
        canonicalAnswer: round.canonical_answer,
        acceptedAnswers: round.accepted_answers,
        maxLevenshteinDistance: round.max_levenshtein_distance,
      });
      const attemptResult = await client.query<{ received_seq: string }>(
        `
          INSERT INTO quiz.quiz_attempts (
            session_id,
            round_id,
            participant_id,
            mode,
            whatsapp_message_id,
            answer_text,
            normalized_answer,
            evaluation_status,
            levenshtein_distance,
            received_at,
            evaluated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            GREATEST(clock_timestamp(), $10::timestamptz)
          )
          ON CONFLICT DO NOTHING
          RETURNING received_seq::text
        `,
        [
          session.id,
          round.id,
          participantId,
          session.mode,
          input.whatsappMessageId,
          input.answerText.slice(0, MAX_STORED_ANSWER_LENGTH),
          answer.normalizedAnswer,
          answer.isCorrect ? "correct" : "incorrect",
          answer.levenshteinDistance,
          input.receivedAt,
        ],
      );
      const receivedSeq = attemptResult.rows[0]?.received_seq;

      if (!receivedSeq) {
        const duplicateResult = await client.query<{ duplicate: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1 FROM quiz.quiz_attempts WHERE whatsapp_message_id = $1
            ) AS duplicate
          `,
          [input.whatsappMessageId],
        );

        return commit(client, {
          handled: true,
          kind: duplicateResult.rows[0]?.duplicate
            ? "duplicate"
            : "already-attempted",
        });
      }

      if (!answer.isCorrect) {
        let bossReset = false;
        let outboxIds: string[] = [];

        if (boss && boss.current_streak > 0) {
          await client.query(
            `
              UPDATE quiz.boss_raids
              SET current_streak = 0, reset_count = reset_count + 1
              WHERE id = $1
            `,
            [boss.id],
          );
          await insertSessionEvent(
            client,
            `boss-reset:${receivedSeq}`,
            session.id,
            round.id,
            participantId,
            "boss_progress_reset",
            { previousProgress: boss.current_streak },
          );
          outboxIds = await insertOutbox(
            client,
            `boss-reset:${receivedSeq}`,
            session.id,
            "quiz.boss_progress_reset",
            {
              groupId: input.groupId,
              roundId: round.id,
              previousProgress: boss.current_streak,
              required: boss.required_correct_answers,
            },
          );
          bossReset = true;
        }

        return commit(client, {
          handled: true,
          kind: "incorrect",
          bossReset,
          bossRequired: boss?.required_correct_answers,
          outboxIds,
        });
      }

      const firstBlood = round.first_blood_received_seq === null;
      const points = firstBlood
        ? session.first_blood_points
        : session.chaos_followup_points;
      const scoreEventKey = `round-reward:${round.id}:${participantId}`;
      const scoreResult = await client.query<{ id: string }>(
        `
          INSERT INTO quiz.score_events (
            event_key,
            season_id,
            group_id,
            session_id,
            round_id,
            participant_id,
            event_type,
            points,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
          ON CONFLICT DO NOTHING
          RETURNING id::text
        `,
        [
          scoreEventKey,
          session.season_id,
          session.group_id,
          session.id,
          round.id,
          participantId,
          firstBlood ? "first_blood" : "chaos_followup",
          points,
          JSON.stringify({ receivedSeq, whatsappMessageId: input.whatsappMessageId }),
        ],
      );

      if (!scoreResult.rows[0]) {
        return commit(client, { handled: true, kind: "already-scored" });
      }

      await client.query(
        `
          UPDATE quiz.quiz_rounds
          SET
            first_blood_received_seq = CASE
              WHEN $2::boolean THEN $3::bigint
              ELSE first_blood_received_seq
            END,
            correct_answer_count = correct_answer_count + 1,
            status = CASE
              WHEN $2::boolean AND ($4::text = 'strict' OR boss_raid_id IS NOT NULL)
                THEN 'closed'
              ELSE status
            END,
            closed_at = CASE
              WHEN $2::boolean AND ($4::text = 'strict' OR boss_raid_id IS NOT NULL)
                THEN clock_timestamp()
              ELSE closed_at
            END
          WHERE id = $1
        `,
        [round.id, firstBlood, receivedSeq, session.mode],
      );
      await client.query(
        `
          INSERT INTO quiz.leaderboard (
            season_id,
            group_id,
            participant_id,
            points,
            correct_answers,
            first_bloods
          ) VALUES ($1, $2, $3, $4, 1, $5)
          ON CONFLICT (season_id, group_id, participant_id) DO UPDATE
          SET
            points = quiz.leaderboard.points + EXCLUDED.points,
            correct_answers = quiz.leaderboard.correct_answers + 1,
            first_bloods = quiz.leaderboard.first_bloods + EXCLUDED.first_bloods,
            updated_at = clock_timestamp()
        `,
        [session.season_id, session.group_id, participantId, points, firstBlood ? 1 : 0],
      );

      let bossProgress: number | undefined;
      let bossRequired: number | undefined;
      let bossDefeated = false;
      let outboxEventKey = `correct:${scoreEventKey}`;
      let outboxEventType = "quiz.answer_correct";

      if (boss && firstBlood) {
        await client.query(
          `
            INSERT INTO quiz.boss_raid_contributors (
              boss_raid_id,
              participant_id
            ) VALUES ($1, $2)
            ON CONFLICT (boss_raid_id, participant_id) DO UPDATE
            SET
              correct_stage_count = quiz.boss_raid_contributors.correct_stage_count + 1,
              last_contributed_at = clock_timestamp()
          `,
          [boss.id, participantId],
        );
        const progressResult = await client.query<{
          current_streak: number;
          required_correct_answers: number;
          status: string;
        }>(
          `
            UPDATE quiz.boss_raids
            SET
              current_streak = LEAST(current_streak + 1, required_correct_answers),
              status = CASE
                WHEN current_streak + 1 >= required_correct_answers
                  THEN 'defeated'
                ELSE status
              END,
              defeated_at = CASE
                WHEN current_streak + 1 >= required_correct_answers
                  THEN clock_timestamp()
                ELSE defeated_at
              END,
              ended_at = CASE
                WHEN current_streak + 1 >= required_correct_answers
                  THEN clock_timestamp()
                ELSE ended_at
              END
            WHERE id = $1
            RETURNING current_streak, required_correct_answers, status
          `,
          [boss.id],
        );
        const progress = progressResult.rows[0];
        if (!progress) throw new Error("Failed to update Boss Raid progress.");

        bossProgress = progress.current_streak;
        bossRequired = progress.required_correct_answers;
        bossDefeated = progress.status === "defeated";
        await insertSessionEvent(
          client,
          `${bossDefeated ? "boss-defeated" : "boss-progress"}:${receivedSeq}`,
          session.id,
          round.id,
          participantId,
          bossDefeated ? "boss_defeated" : "boss_progressed",
          { progress: bossProgress, required: bossRequired },
        );

        if (bossDefeated) {
          await client.query(
            `
              WITH awarded AS (
                INSERT INTO quiz.score_events (
                  event_key,
                  season_id,
                  group_id,
                  session_id,
                  boss_raid_id,
                  participant_id,
                  event_type,
                  points
                )
                SELECT
                  'boss-bonus:' || $1::bigint::text || ':' || contributor.participant_id::text,
                  $2,
                  $3,
                  $4,
                  $1::bigint,
                  contributor.participant_id,
                  'boss_defeat_bonus',
                  $5
                FROM quiz.boss_raid_contributors AS contributor
                WHERE contributor.boss_raid_id = $1::bigint
                ON CONFLICT DO NOTHING
                RETURNING participant_id, points
              )
              INSERT INTO quiz.leaderboard (
                season_id,
                group_id,
                participant_id,
                points,
                boss_bonus_awards
              )
              SELECT $2, $3, participant_id, points, 1 FROM awarded
              ON CONFLICT (season_id, group_id, participant_id) DO UPDATE
              SET
                points = quiz.leaderboard.points + EXCLUDED.points,
                boss_bonus_awards = quiz.leaderboard.boss_bonus_awards + 1,
                updated_at = clock_timestamp()
            `,
            [
              boss.id,
              session.season_id,
              session.group_id,
              session.id,
              session.boss_contributor_bonus_points,
            ],
          );
          outboxEventKey = `boss-defeated:${boss.id}`;
          outboxEventType = "quiz.boss_defeated";
        } else {
          outboxEventKey = `boss-progress:${receivedSeq}`;
          outboxEventType = "quiz.boss_progressed";
        }
      }

      const outboxIds = await insertOutbox(
        client,
        outboxEventKey,
        session.id,
        outboxEventType,
        {
          groupId: input.groupId,
          roundId: round.id,
          participantWhatsAppId: input.participantWhatsAppId,
          whatsappMessageId: input.whatsappMessageId,
          points,
          firstBlood,
          bossProgress,
          bossRequired,
          bossDefeated,
          bossBonusPoints: bossDefeated
            ? session.boss_contributor_bonus_points
            : undefined,
        },
      );

      return commit(client, {
        handled: true,
        kind: "correct",
        points,
        firstBlood,
        bossProgress,
        bossRequired,
        bossDefeated,
        bossBonusPoints: bossDefeated
          ? session.boss_contributor_bonus_points
          : undefined,
        outboxIds,
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          destroyClient = true;
        }
      }
      throw error;
    } finally {
      client.release(destroyClient);
    }
  }
}
