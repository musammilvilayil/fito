-- AI assistant tables: private to the user who owns the conversation, within
-- the selected gym. Owners see gym-wide assistant usage through
-- ai_generations (feature = 'assistant'), never other people's messages.

GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_threads, assistant_messages, assistant_actions TO fito_app;
--> statement-breakpoint

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON assistant_threads, assistant_messages, assistant_actions FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assistant_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistant_threads', 'assistant_messages', 'assistant_actions'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO fito_app
         USING (gym_id = app_gym_id() AND user_id = app_user_id())
         WITH CHECK (gym_id = app_gym_id() AND user_id = app_user_id())',
      t || '_own', t
    );
  END LOOP;
END $$;
