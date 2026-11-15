-- "Find your gym": a signed-in person searches gyms they can join from the
-- app. Gyms are otherwise invisible to anyone outside them (RLS), so this
-- narrow SECURITY DEFINER function returns only the public listing fields
-- (name, city, state) of gyms that allow app sign-ups
-- (settings.allowMemberSignup, on unless the owner turns it off).
-- The caller escapes LIKE wildcards in p_query.

CREATE OR REPLACE FUNCTION fito_search_gyms(p_query text, p_limit integer)
RETURNS TABLE (id uuid, name text, city text, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id, g.name, g.city, g.state
  FROM gyms g
  WHERE coalesce((g.settings->>'allowMemberSignup')::boolean, true)
    AND (
      coalesce(p_query, '') = ''
      OR g.name ILIKE '%' || p_query || '%'
      OR g.city ILIKE '%' || p_query || '%'
    )
  ORDER BY g.name
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fito_search_gyms(text, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fito_search_gyms(text, integer) TO fito_app;
