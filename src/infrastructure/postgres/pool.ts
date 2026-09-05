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
    sessions: string | null;
    attempts: string | null;
    scores: string | null;
    questions: string | null;
    bosses: string | null;
    leaderboard: string | null;
    outbox: string | null;
  }>(`
    SELECT
      to_regclass('quiz.quiz_sessions')::text AS sessions,
      to_regclass('quiz.quiz_attempts')::text AS attempts,
      to_regclass('quiz.score_events')::text AS scores,
      to_regclass('quiz.questions')::text AS questions,
      to_regclass('quiz.boss_raids')::text AS bosses,
      to_regclass('quiz.leaderboard')::text AS leaderboard,
      to_regclass('quiz.outbox')::text AS outbox
  `);
  const schema = result.rows[0];

  if (!schema || Object.values(schema).some((relation) => !relation)) {
    throw new Error(
      "Quiz database schema is incomplete. Apply database/migrations/001-003 first.",
    );
  }
}
