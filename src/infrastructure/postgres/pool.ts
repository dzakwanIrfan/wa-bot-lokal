import pg from "pg";

const { Pool } = pg;

export function createPostgresPool(connectionString: string): pg.Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  pool.on("error", (error) => {
    console.error(`Unexpected PostgreSQL pool error: ${error.message}`);
  });

  return pool;
}

export async function verifyQuizDatabase(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{
    seasons: string | null;
    batches: string | null;
    sessions: string | null;
    rounds: string | null;
    attempts: string | null;
    events: string | null;
    scores: string | null;
    questions: string | null;
    bosses: string | null;
    leaderboard: string | null;
    outbox: string | null;
    history: string | null;
  }>(`
    SELECT
      to_regclass('quiz.seasons')::text AS seasons,
      to_regclass('quiz.generation_batches')::text AS batches,
      to_regclass('quiz.quiz_sessions')::text AS sessions,
      to_regclass('quiz.quiz_rounds')::text AS rounds,
      to_regclass('quiz.quiz_attempts')::text AS attempts,
      to_regclass('quiz.session_events')::text AS events,
      to_regclass('quiz.score_events')::text AS scores,
      to_regclass('quiz.questions')::text AS questions,
      to_regclass('quiz.boss_raids')::text AS bosses,
      to_regclass('quiz.leaderboard')::text AS leaderboard,
      to_regclass('quiz.outbox')::text AS outbox,
      to_regclass('quiz.season_group_history')::text AS history
  `);
  const schema = result.rows[0];

  if (!schema || Object.values(schema).some((relation) => !relation)) {
    throw new Error(
      "Quiz database schema is incomplete. Apply database/migrations/001-004 first.",
    );
  }
}
