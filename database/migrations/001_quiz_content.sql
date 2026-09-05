BEGIN;

CREATE SCHEMA IF NOT EXISTS quiz;

CREATE TABLE quiz.seasons (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  timezone_name TEXT NOT NULL DEFAULT 'Asia/Jakarta'
    CHECK (timezone_name = 'Asia/Jakarta'),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (starts_at, ends_at)
);

CREATE UNIQUE INDEX seasons_one_active_idx
  ON quiz.seasons ((TRUE))
  WHERE status = 'active';

CREATE TABLE quiz.participants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  whatsapp_user_id TEXT NOT NULL UNIQUE
    CHECK (whatsapp_user_id ~ '^[^@]+@(c\.us|lid)$'),
  phone_e164 TEXT
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[1-9][0-9]{6,14}$'),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz.generation_batches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id TEXT CHECK (group_id IS NULL OR group_id ~ '^[0-9]+@g\.us$'),
  topic TEXT NOT NULL CHECK (length(btrim(topic)) > 0),
  requested_difficulty SMALLINT NOT NULL
    CHECK (requested_difficulty BETWEEN 1 AND 5),
  group_win_rate NUMERIC(6, 5)
    CHECK (group_win_rate IS NULL OR group_win_rate BETWEEN 0 AND 1),
  requested_count SMALLINT NOT NULL CHECK (requested_count BETWEEN 1 AND 100),
  generated_count SMALLINT NOT NULL DEFAULT 0
    CHECK (generated_count BETWEEN 0 AND requested_count),
  model_name TEXT NOT NULL CHECK (length(btrim(model_name)) > 0),
  prompt_version TEXT NOT NULL CHECK (length(btrim(prompt_version)) > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX generation_batches_worker_idx
  ON quiz.generation_batches (created_at, id)
  WHERE status = 'queued';

CREATE TABLE quiz.questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generation_batch_id BIGINT REFERENCES quiz.generation_batches(id),
  topic TEXT NOT NULL CHECK (length(btrim(topic)) > 0),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  question_text TEXT NOT NULL CHECK (length(btrim(question_text)) > 0),
  canonical_answer TEXT NOT NULL CHECK (length(btrim(canonical_answer)) > 0),
  accepted_answers TEXT[] NOT NULL DEFAULT '{}',
  answer_regex TEXT,
  max_levenshtein_distance SMALLINT NOT NULL DEFAULT 0
    CHECK (max_levenshtein_distance BETWEEN 0 AND 5),
  explanation TEXT,
  persona_prompt TEXT,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'retired', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX questions_selection_idx
  ON quiz.questions (topic, difficulty, id)
  WHERE status = 'ready';

CREATE TABLE quiz.question_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^[0-9]+@g\.us$'),
  requested_by BIGINT NOT NULL REFERENCES quiz.participants(id),
  generation_batch_id BIGINT REFERENCES quiz.generation_batches(id),
  topic TEXT NOT NULL CHECK (length(btrim(topic)) > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'completed', 'rejected', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX question_requests_worker_idx
  ON quiz.question_requests (created_at, id)
  WHERE status = 'queued';

COMMIT;
