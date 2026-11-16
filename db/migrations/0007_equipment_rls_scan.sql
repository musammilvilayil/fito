-- Equipment: gym-owned like everything else.
GRANT SELECT, INSERT, UPDATE, DELETE ON gym_equipment TO fito_app;
--> statement-breakpoint
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON gym_equipment FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE gym_equipment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY gym_equipment_gym_isolation ON gym_equipment FOR ALL TO fito_app
  USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint

-- Batches.
ALTER TABLE members ADD CONSTRAINT members_batch CHECK (batch IN ('morning', 'evening', 'any'));
--> statement-breakpoint

-- Entrance/exit QR tokens for existing gyms (new gyms get them at sign-up).
UPDATE gyms SET
  entrance_token = coalesce(entrance_token, md5(random()::text || clock_timestamp()::text || id::text) || md5(random()::text || id::text)),
  exit_token = coalesce(exit_token, md5(random()::text || clock_timestamp()::text || name) || md5(random()::text || slug));
--> statement-breakpoint

-- A member scans a gym's posted QR. Before knowing which gym (and so
-- before RLS can apply), this returns only the gym id and the direction.
CREATE OR REPLACE FUNCTION fito_scan_gym(p_token text)
RETURNS TABLE (gym_id uuid, direction text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id, CASE WHEN g.entrance_token = p_token THEN 'in' ELSE 'out' END
  FROM gyms g
  WHERE p_token IS NOT NULL AND length(p_token) >= 32
    AND (g.entrance_token = p_token OR g.exit_token = p_token)
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_scan_gym(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_scan_gym(text) TO fito_app;
