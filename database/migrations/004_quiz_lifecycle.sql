BEGIN;

ALTER TABLE quiz.quiz_sessions
  ADD COLUMN question_count SMALLINT NOT NULL DEFAULT 10
    CHECK (question_count BETWEEN 1 AND 50),
  ADD COLUMN boss_every SMALLINT NOT NULL DEFAULT 5
    CHECK (boss_every BETWEEN 0 AND 50),
  ADD CONSTRAINT quiz_sessions_boss_frequency_check
    CHECK (boss_every = 0 OR boss_every <= question_count);

CREATE VIEW quiz.season_group_history AS
SELECT
  season.id AS season_id,
  season.name AS season_name,
  season.starts_at,
  season.ends_at,
  leaderboard.group_id,
  count(*) AS participant_count,
  sum(leaderboard.points) AS total_points,
  sum(leaderboard.correct_answers) AS correct_answers,
  sum(leaderboard.first_bloods) AS first_bloods,
  sum(leaderboard.boss_bonus_awards) AS boss_bonus_awards
FROM quiz.seasons AS season
JOIN quiz.leaderboard AS leaderboard ON leaderboard.season_id = season.id
GROUP BY season.id, leaderboard.group_id;

COMMIT;
