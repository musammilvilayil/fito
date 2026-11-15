-- FITO: database-level tenant isolation and pre-authentication functions.
--
-- The application connects as the `fito_app` role, which does NOT own the
-- tables, so row-level security (RLS) applies to every query it makes. Each
-- request runs in a transaction that sets:
--   app.user_id  -> the signed-in user
--   app.gym_id   -> the gym selected for this request
-- Policies below only expose rows of that gym (plus a user's own identity rows).
-- Migrations run as the table owner, which bypasses RLS.

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_gym_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.gym_id', true), '')::uuid $$;
--> statement-breakpoint

-- --------------------------------------------------------------- app role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fito_app') THEN
    CREATE ROLE fito_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO fito_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fito_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fito_app;
--> statement-breakpoint
-- Rate-limit counters are only reachable through fito_rate_limit_hit().
REVOKE ALL ON rate_limits FROM fito_app;
--> statement-breakpoint

-- Hosted Postgres providers (e.g. Supabase) grant table/function access to
-- their public API roles by default. FITO does not use that API, so remove it.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------- enable RLS (all)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gym_staff ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership_freezes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workout_plan_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ------------------------------------------------------ identity policies
CREATE POLICY users_self_select ON users FOR SELECT TO fito_app USING (id = app_user_id());
--> statement-breakpoint
CREATE POLICY users_self_insert ON users FOR INSERT TO fito_app WITH CHECK (id = app_user_id());
--> statement-breakpoint
CREATE POLICY users_self_update ON users FOR UPDATE TO fito_app USING (id = app_user_id()) WITH CHECK (id = app_user_id());
--> statement-breakpoint
CREATE POLICY sessions_self ON sessions FOR ALL TO fito_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY password_reset_tokens_gym ON password_reset_tokens FOR ALL TO fito_app
  USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint

-- ----------------------------------------------------------- gym policies
CREATE POLICY gyms_select ON gyms FOR SELECT TO fito_app USING (
  id = app_gym_id()
  OR id IN (SELECT s.gym_id FROM gym_staff s WHERE s.user_id = app_user_id() AND s.status = 'active')
  OR id IN (SELECT m.gym_id FROM members m WHERE m.user_id = app_user_id())
);
--> statement-breakpoint
CREATE POLICY gyms_insert ON gyms FOR INSERT TO fito_app WITH CHECK (id = app_gym_id());
--> statement-breakpoint
CREATE POLICY gyms_update ON gyms FOR UPDATE TO fito_app USING (id = app_gym_id()) WITH CHECK (id = app_gym_id());
--> statement-breakpoint

-- Staff and member rows: visible within the current gym, and a user can see
-- their own rows in any gym (to list "my gyms"). Writes only in current gym.
CREATE POLICY gym_staff_select ON gym_staff FOR SELECT TO fito_app
  USING (gym_id = app_gym_id() OR user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY gym_staff_insert ON gym_staff FOR INSERT TO fito_app WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY gym_staff_update ON gym_staff FOR UPDATE TO fito_app
  USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY gym_staff_delete ON gym_staff FOR DELETE TO fito_app USING (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY members_select ON members FOR SELECT TO fito_app
  USING (gym_id = app_gym_id() OR user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY members_insert ON members FOR INSERT TO fito_app WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY members_update ON members FOR UPDATE TO fito_app
  USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY members_delete ON members FOR DELETE TO fito_app USING (gym_id = app_gym_id());
--> statement-breakpoint

-- Global exercise library rows (gym_id IS NULL) are read-only for gyms.
CREATE POLICY exercises_select ON exercises FOR SELECT TO fito_app
  USING (gym_id IS NULL OR gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY exercises_insert ON exercises FOR INSERT TO fito_app WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY exercises_update ON exercises FOR UPDATE TO fito_app
  USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id());
--> statement-breakpoint
CREATE POLICY exercises_delete ON exercises FOR DELETE TO fito_app USING (gym_id = app_gym_id());
--> statement-breakpoint

-- All remaining gym-owned tables: current gym only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'counters', 'membership_plans', 'memberships', 'membership_freezes', 'payments',
    'attendance', 'workout_plans', 'workout_plan_versions', 'workout_logs',
    'progress_entries', 'ai_generations', 'notifications', 'audit_logs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO fito_app USING (gym_id = app_gym_id()) WITH CHECK (gym_id = app_gym_id())',
      t || '_gym_isolation', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- ----------------------------------------- pre-authentication functions
-- These run as the table owner (SECURITY DEFINER) because no user is known
-- yet. Each does one narrow job and returns only what that job needs.

-- Login: find the account for an email or phone.
CREATE OR REPLACE FUNCTION fito_auth_find_login(p_email text, p_phone text)
RETURNS TABLE (id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.password_hash
  FROM users u
  WHERE (p_email IS NOT NULL AND lower(u.email) = lower(p_email))
     OR (p_phone IS NOT NULL AND u.phone = p_phone)
  ORDER BY (p_email IS NOT NULL AND lower(u.email) = lower(p_email)) DESC
  LIMIT 1
$$;
--> statement-breakpoint

-- Session lookup by token hash (cookie or Bearer token). Touches last_seen_at
-- at most every 5 minutes.
CREATE OR REPLACE FUNCTION fito_auth_resolve_session(p_token_hash text)
RETURNS TABLE (
  session_id uuid, user_id uuid, active_gym_id uuid, expires_at timestamptz,
  full_name text, email text, phone text, is_platform_admin boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE sessions s SET last_seen_at = now()
  WHERE s.token_hash = p_token_hash AND s.expires_at > now()
    AND s.last_seen_at < now() - interval '5 minutes';
  RETURN QUERY
  SELECT s.id, s.user_id, s.active_gym_id, s.expires_at, u.full_name, u.email, u.phone, u.is_platform_admin
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash AND s.expires_at > now();
END $$;
--> statement-breakpoint

-- Fixed-window rate limiter. Returns true when the call is allowed.
CREATE OR REPLACE FUNCTION fito_rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO rate_limits AS r (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.count + 1 END,
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END
  RETURNING count INTO v_count;
  RETURN v_count <= p_max;
END $$;
--> statement-breakpoint

-- Invite links for staff and members.
CREATE OR REPLACE FUNCTION fito_lookup_invite(p_token_hash text)
RETURNS TABLE (
  kind text, record_id uuid, gym_id uuid, gym_name text, full_name text,
  email text, phone text, role text, expires_at timestamptz, linked_user_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'staff', s.id, s.gym_id, g.name, s.full_name, s.email, s.phone, s.role::text, s.invite_expires_at, s.user_id
  FROM gym_staff s JOIN gyms g ON g.id = s.gym_id
  WHERE s.invite_token_hash = p_token_hash AND s.status <> 'disabled'
  UNION ALL
  SELECT 'member', m.id, m.gym_id, g.name, m.full_name, m.email, m.phone, 'member', m.invite_expires_at, m.user_id
  FROM members m JOIN gyms g ON g.id = m.gym_id
  WHERE m.invite_token_hash = p_token_hash
$$;
--> statement-breakpoint

-- Password reset links created by gym staff. Sets the new password, marks the
-- token used and signs the user out everywhere. Returns the user id or NULL.
CREATE OR REPLACE FUNCTION fito_consume_password_reset(p_token_hash text, p_new_password_hash text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE password_reset_tokens t SET used_at = now()
  WHERE t.token_hash = p_token_hash AND t.used_at IS NULL AND t.expires_at > now()
  RETURNING t.user_id INTO v_user;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE users SET password_hash = p_new_password_hash, updated_at = now() WHERE id = v_user;
  DELETE FROM sessions WHERE user_id = v_user;
  RETURN v_user;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION fito_auth_find_login(text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_auth_resolve_session(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_rate_limit_hit(text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_lookup_invite(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_consume_password_reset(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_auth_find_login(text, text) TO fito_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_auth_resolve_session(text) TO fito_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_rate_limit_hit(text, integer, integer) TO fito_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_lookup_invite(text) TO fito_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_consume_password_reset(text, text) TO fito_app;
