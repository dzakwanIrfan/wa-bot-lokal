BEGIN;

ALTER TABLE quiz.questions
  ADD COLUMN quality_version SMALLINT NOT NULL DEFAULT 1
    CHECK (quality_version BETWEEN 1 AND 100);

UPDATE quiz.questions AS question
SET status = 'rejected'
FROM quiz.generation_batches AS batch
WHERE batch.id = question.generation_batch_id
  AND batch.prompt_version = 'quiz-v1'
  AND question.status = 'ready';

ALTER TABLE quiz.session_events
  DROP CONSTRAINT session_events_event_type_check,
  ADD CONSTRAINT session_events_event_type_check CHECK (event_type IN (
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
    'boss_defeated',
    'boss_expired'
  ));

COMMIT;
