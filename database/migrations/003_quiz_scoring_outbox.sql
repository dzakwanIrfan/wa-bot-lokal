BEGIN;

CREATE TABLE quiz.score_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  season_id BIGINT NOT NULL,
  group_id TEXT NOT NULL CHECK (group_id ~ '^[0-9]+@g\.us$'),
  session_id BIGINT NOT NULL,
  round_id BIGINT,
  boss_raid_id BIGINT,
  participant_id BIGINT NOT NULL REFERENCES quiz.participants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'first_blood',
    'chaos_followup',
    'boss_defeat_bonus',
    'admin_adjustment'
  )),
  points INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT score_events_session_fk
    FOREIGN KEY (session_id, season_id, group_id)
    REFERENCES quiz.quiz_sessions(id, season_id, group_id),
  CONSTRAINT score_events_round_session_fk
    FOREIGN KEY (round_id, session_id)
    REFERENCES quiz.quiz_rounds(id, session_id),
  CONSTRAINT score_events_boss_session_fk
    FOREIGN KEY (boss_raid_id, session_id)
    REFERENCES quiz.boss_raids(id, session_id),
  CHECK (
    (
      event_type IN ('first_blood', 'chaos_followup')
      AND round_id IS NOT NULL
      AND boss_raid_id IS NULL
      AND points > 0
    )
    OR (
      event_type = 'boss_defeat_bonus'
      AND round_id IS NULL
      AND boss_raid_id IS NOT NULL
      AND points > 0
    )
    OR (
      event_type = 'admin_adjustment'
      AND round_id IS NULL
      AND boss_raid_id IS NULL
      AND points <> 0
    )
  )
);

CREATE UNIQUE INDEX score_events_one_round_reward_per_participant_idx
  ON quiz.score_events (round_id, participant_id)
  WHERE event_type IN ('first_blood', 'chaos_followup');

CREATE UNIQUE INDEX score_events_one_boss_bonus_per_participant_idx
  ON quiz.score_events (boss_raid_id, participant_id)
  WHERE event_type = 'boss_defeat_bonus';

CREATE INDEX score_events_history_idx
  ON quiz.score_events (season_id, group_id, participant_id, created_at);

CREATE TABLE quiz.leaderboard (
  season_id BIGINT NOT NULL REFERENCES quiz.seasons(id),
  group_id TEXT NOT NULL CHECK (group_id ~ '^[0-9]+@g\.us$'),
  participant_id BIGINT NOT NULL REFERENCES quiz.participants(id),
  points BIGINT NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  first_bloods INTEGER NOT NULL DEFAULT 0 CHECK (first_bloods >= 0),
  boss_bonus_awards INTEGER NOT NULL DEFAULT 0 CHECK (boss_bonus_awards >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, group_id, participant_id)
);

CREATE INDEX leaderboard_ranking_idx
  ON quiz.leaderboard (
    season_id,
    group_id,
    points DESC,
    first_bloods DESC,
    updated_at ASC,
    participant_id
  );

CREATE TABLE quiz.outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  aggregate_type TEXT NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
  aggregate_id TEXT NOT NULL CHECK (length(btrim(aggregate_id)) > 0),
  event_type TEXT NOT NULL CHECK (length(btrim(event_type)) > 0),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX outbox_worker_idx
  ON quiz.outbox (available_at, id)
  WHERE status IN ('pending', 'failed');

COMMENT ON TABLE quiz.outbox IS
  'Workers may claim rows with FOR UPDATE SKIP LOCKED. First Blood evaluation must never use SKIP LOCKED on quiz_sessions.';

CREATE VIEW quiz.group_topic_performance AS
SELECT
  session.group_id,
  question.topic,
  count(*) AS rounds_played,
  count(*) FILTER (WHERE round.first_blood_received_seq IS NOT NULL) AS rounds_won,
  round(
    count(*) FILTER (WHERE round.first_blood_received_seq IS NOT NULL)::numeric
      / count(*)::numeric,
    4
  ) AS win_rate
FROM quiz.quiz_rounds AS round
JOIN quiz.quiz_sessions AS session ON session.id = round.session_id
JOIN quiz.questions AS question ON question.id = round.question_id
WHERE round.status IN ('closed', 'expired')
GROUP BY session.group_id, question.topic;

COMMIT;
