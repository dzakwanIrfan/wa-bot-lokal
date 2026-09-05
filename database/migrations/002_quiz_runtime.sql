BEGIN;

CREATE TABLE quiz.quiz_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES quiz.seasons(id),
  group_id TEXT NOT NULL CHECK (group_id ~ '^[0-9]+@g\.us$'),
  topic TEXT NOT NULL DEFAULT 'campuran' CHECK (length(btrim(topic)) > 0),
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'chaos')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'cancelled', 'failed')),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  question_duration_seconds SMALLINT NOT NULL DEFAULT 30
    CHECK (question_duration_seconds BETWEEN 5 AND 300),
  first_blood_points INTEGER NOT NULL DEFAULT 10 CHECK (first_blood_points > 0),
  chaos_followup_points INTEGER NOT NULL DEFAULT 5
    CHECK (chaos_followup_points > 0),
  boss_required_correct_answers SMALLINT NOT NULL DEFAULT 3
    CHECK (boss_required_correct_answers > 0),
  boss_contributor_bonus_points INTEGER NOT NULL DEFAULT 50
    CHECK (boss_contributor_bonus_points > 0),
  created_by BIGINT REFERENCES quiz.participants(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  UNIQUE (id, mode),
  UNIQUE (id, season_id, group_id)
);

CREATE UNIQUE INDEX quiz_sessions_one_active_per_group_idx
  ON quiz.quiz_sessions (group_id)
  WHERE status IN ('running', 'paused');

CREATE INDEX quiz_sessions_season_group_idx
  ON quiz.quiz_sessions (season_id, group_id, started_at DESC);

COMMENT ON TABLE quiz.quiz_sessions IS
  'Concurrency boundary. First Blood transactions must lock this row with SELECT ... FOR UPDATE before reading or changing the active round.';

CREATE TABLE quiz.boss_raids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES quiz.quiz_sessions(id),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'defeated', 'expired', 'cancelled')),
  required_correct_answers SMALLINT NOT NULL DEFAULT 3
    CHECK (required_correct_answers > 0),
  current_streak SMALLINT NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  reset_count INTEGER NOT NULL DEFAULT 0 CHECK (reset_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  defeated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  CHECK (current_streak <= required_correct_answers),
  CHECK (defeated_at IS NULL OR defeated_at >= started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  UNIQUE (session_id, ordinal),
  UNIQUE (id, session_id)
);

CREATE UNIQUE INDEX boss_raids_one_active_per_session_idx
  ON quiz.boss_raids (session_id)
  WHERE status = 'active';

CREATE TABLE quiz.quiz_rounds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL REFERENCES quiz.questions(id),
  boss_raid_id BIGINT,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'chaos')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'open', 'closed', 'expired', 'cancelled')),
  opened_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  first_blood_received_seq BIGINT,
  correct_answer_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_answer_count >= 0),
  CONSTRAINT quiz_rounds_session_mode_fk
    FOREIGN KEY (session_id, mode)
    REFERENCES quiz.quiz_sessions(id, mode),
  CONSTRAINT quiz_rounds_boss_session_fk
    FOREIGN KEY (boss_raid_id, session_id)
    REFERENCES quiz.boss_raids(id, session_id),
  CHECK ((opened_at IS NULL) = (closes_at IS NULL)),
  CHECK (closes_at IS NULL OR closes_at > opened_at),
  CHECK (closed_at IS NULL OR opened_at IS NULL OR closed_at >= opened_at),
  UNIQUE (session_id, ordinal),
  UNIQUE (id, session_id),
  UNIQUE (id, session_id, mode)
);

CREATE UNIQUE INDEX quiz_rounds_one_open_per_session_idx
  ON quiz.quiz_rounds (session_id)
  WHERE status = 'open';

CREATE INDEX quiz_rounds_deadline_idx
  ON quiz.quiz_rounds (closes_at, id)
  WHERE status = 'open';

CREATE TABLE quiz.quiz_attempts (
  received_seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT NOT NULL,
  round_id BIGINT NOT NULL,
  participant_id BIGINT NOT NULL REFERENCES quiz.participants(id),
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'chaos')),
  whatsapp_message_id TEXT NOT NULL UNIQUE
    CHECK (length(btrim(whatsapp_message_id)) > 0),
  answer_text TEXT NOT NULL CHECK (length(btrim(answer_text)) > 0),
  normalized_answer TEXT,
  evaluation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (evaluation_status IN ('pending', 'correct', 'incorrect', 'ignored', 'error')),
  levenshtein_distance SMALLINT CHECK (levenshtein_distance >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  evaluated_at TIMESTAMPTZ,
  CONSTRAINT quiz_attempts_round_fk
    FOREIGN KEY (round_id, session_id, mode)
    REFERENCES quiz.quiz_rounds(id, session_id, mode),
  CHECK (evaluated_at IS NULL OR evaluated_at >= received_at),
  UNIQUE (received_seq, round_id)
);

CREATE UNIQUE INDEX quiz_attempts_one_strict_attempt_idx
  ON quiz.quiz_attempts (round_id, participant_id)
  WHERE mode = 'strict';

CREATE INDEX quiz_attempts_worker_idx
  ON quiz.quiz_attempts (received_seq)
  WHERE evaluation_status = 'pending';

CREATE INDEX quiz_attempts_round_order_idx
  ON quiz.quiz_attempts (round_id, received_seq);

ALTER TABLE quiz.quiz_rounds
  ADD CONSTRAINT quiz_rounds_first_blood_attempt_fk
  FOREIGN KEY (first_blood_received_seq, id)
  REFERENCES quiz.quiz_attempts(received_seq, round_id);

CREATE TABLE quiz.boss_raid_contributors (
  boss_raid_id BIGINT NOT NULL REFERENCES quiz.boss_raids(id),
  participant_id BIGINT NOT NULL REFERENCES quiz.participants(id),
  correct_stage_count SMALLINT NOT NULL DEFAULT 1
    CHECK (correct_stage_count > 0),
  first_contributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (boss_raid_id, participant_id),
  CHECK (last_contributed_at >= first_contributed_at)
);

CREATE TABLE quiz.session_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  session_id BIGINT NOT NULL REFERENCES quiz.quiz_sessions(id),
  round_id BIGINT,
  actor_participant_id BIGINT REFERENCES quiz.participants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_started',
    'session_paused',
    'session_resumed',
    'session_completed',
    'session_cancelled',
    'round_opened',
    'round_closed',
    'boss_started',
    'boss_progressed',
    'boss_progress_reset',
    'boss_defeated'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_events_round_session_fk
    FOREIGN KEY (round_id, session_id)
    REFERENCES quiz.quiz_rounds(id, session_id)
);

CREATE INDEX session_events_timeline_idx
  ON quiz.session_events (session_id, created_at, id);

COMMIT;
