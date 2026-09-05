\set ON_ERROR_STOP on

BEGIN;

DO $verify$
DECLARE
  season_id BIGINT;
  participant_one BIGINT;
  participant_two BIGINT;
  question_id BIGINT;
  strict_session_id BIGINT;
  chaos_session_id BIGINT;
  strict_round_id BIGINT;
  chaos_round_id BIGINT;
  boss_raid_id BIGINT;
BEGIN
  INSERT INTO quiz.seasons (name, starts_at, ends_at)
  VALUES (
    'schema verification',
    '2099-01-01 00:00:00+07',
    '2099-02-01 00:00:00+07'
  )
  RETURNING id INTO season_id;

  INSERT INTO quiz.participants (whatsapp_user_id)
  VALUES ('100000000001@lid')
  RETURNING id INTO participant_one;

  INSERT INTO quiz.participants (whatsapp_user_id)
  VALUES ('620000000002@c.us')
  RETURNING id INTO participant_two;

  INSERT INTO quiz.questions (
    topic,
    difficulty,
    question_text,
    canonical_answer,
    accepted_answers,
    source
  ) VALUES (
    'verification',
    1,
    'Berapa hasil 1 + 1?',
    '2',
    ARRAY['dua'],
    'manual'
  ) RETURNING id INTO question_id;

  INSERT INTO quiz.quiz_sessions (
    season_id,
    group_id,
    topic,
    mode,
    difficulty,
    created_by
  ) VALUES (
    season_id,
    '120363000000000001@g.us',
    'verification',
    'strict',
    1,
    participant_one
  ) RETURNING id INTO strict_session_id;

  BEGIN
    INSERT INTO quiz.quiz_sessions (season_id, group_id, mode, difficulty)
    VALUES (season_id, '120363000000000001@g.us', 'chaos', 1);
    RAISE EXCEPTION 'missing one-active-session constraint';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO quiz.quiz_rounds (
    session_id,
    question_id,
    ordinal,
    mode,
    status,
    opened_at,
    closes_at
  ) VALUES (
    strict_session_id,
    question_id,
    1,
    'strict',
    'open',
    clock_timestamp(),
    clock_timestamp() + interval '30 seconds'
  ) RETURNING id INTO strict_round_id;

  INSERT INTO quiz.quiz_attempts (
    session_id,
    round_id,
    participant_id,
    mode,
    whatsapp_message_id,
    answer_text
  ) VALUES (
    strict_session_id,
    strict_round_id,
    participant_one,
    'strict',
    'verify-strict-one',
    '2'
  );

  BEGIN
    INSERT INTO quiz.quiz_attempts (
      session_id,
      round_id,
      participant_id,
      mode,
      whatsapp_message_id,
      answer_text
    ) VALUES (
      strict_session_id,
      strict_round_id,
      participant_one,
      'strict',
      'verify-strict-two',
      'dua'
    );
    RAISE EXCEPTION 'missing strict one-attempt constraint';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  UPDATE quiz.quiz_sessions
  SET status = 'completed', ended_at = clock_timestamp()
  WHERE id = strict_session_id;

  INSERT INTO quiz.quiz_sessions (
    season_id,
    group_id,
    topic,
    mode,
    difficulty,
    created_by
  ) VALUES (
    season_id,
    '120363000000000001@g.us',
    'verification',
    'chaos',
    1,
    participant_one
  ) RETURNING id INTO chaos_session_id;

  INSERT INTO quiz.quiz_rounds (
    session_id,
    question_id,
    ordinal,
    mode,
    status,
    opened_at,
    closes_at
  ) VALUES (
    chaos_session_id,
    question_id,
    1,
    'chaos',
    'open',
    clock_timestamp(),
    clock_timestamp() + interval '30 seconds'
  ) RETURNING id INTO chaos_round_id;

  INSERT INTO quiz.quiz_attempts (
    session_id,
    round_id,
    participant_id,
    mode,
    whatsapp_message_id,
    answer_text
  ) VALUES
    (
      chaos_session_id,
      chaos_round_id,
      participant_one,
      'chaos',
      'verify-chaos-one',
      'salah'
    ),
    (
      chaos_session_id,
      chaos_round_id,
      participant_one,
      'chaos',
      'verify-chaos-two',
      '2'
    );

  UPDATE quiz.quiz_attempts
  SET
    evaluation_status = CASE whatsapp_message_id
      WHEN 'verify-chaos-one' THEN 'incorrect'
      ELSE 'correct'
    END,
    evaluated_at = clock_timestamp()
  WHERE round_id = chaos_round_id;

  INSERT INTO quiz.score_events (
    event_key,
    season_id,
    group_id,
    session_id,
    round_id,
    participant_id,
    event_type,
    points
  ) VALUES (
    'verify:first-blood',
    season_id,
    '120363000000000001@g.us',
    chaos_session_id,
    chaos_round_id,
    participant_one,
    'first_blood',
    10
  );

  BEGIN
    INSERT INTO quiz.score_events (
      event_key,
      season_id,
      group_id,
      session_id,
      round_id,
      participant_id,
      event_type,
      points
    ) VALUES (
      'verify:duplicate-round-reward',
      season_id,
      '120363000000000001@g.us',
      chaos_session_id,
      chaos_round_id,
      participant_one,
      'chaos_followup',
      5
    );
    RAISE EXCEPTION 'missing one-round-reward constraint';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO quiz.boss_raids (session_id, ordinal)
  VALUES (chaos_session_id, 1)
  RETURNING id INTO boss_raid_id;

  INSERT INTO quiz.boss_raid_contributors (boss_raid_id, participant_id)
  VALUES (boss_raid_id, participant_two);

  INSERT INTO quiz.score_events (
    event_key,
    season_id,
    group_id,
    session_id,
    boss_raid_id,
    participant_id,
    event_type,
    points
  ) VALUES (
    'verify:boss-bonus',
    season_id,
    '120363000000000001@g.us',
    chaos_session_id,
    boss_raid_id,
    participant_two,
    'boss_defeat_bonus',
    50
  );

  BEGIN
    INSERT INTO quiz.score_events (
      event_key,
      season_id,
      group_id,
      session_id,
      boss_raid_id,
      participant_id,
      event_type,
      points
    ) VALUES (
      'verify:duplicate-boss-bonus',
      season_id,
      '120363000000000001@g.us',
      chaos_session_id,
      boss_raid_id,
      participant_two,
      'boss_defeat_bonus',
      50
    );
    RAISE EXCEPTION 'missing one-boss-bonus constraint';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RAISE NOTICE 'Quiz schema verification passed.';
END
$verify$;

ROLLBACK;
