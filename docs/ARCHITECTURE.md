# FITO architecture

FITO is a **modular monolith**: one Next.js application that serves the web
UI and a versioned REST API, backed by one PostgreSQL database.

```
Browser (owner / trainer / member)      Future Expo Android app
            │  cookie session                     │  Bearer token
            ▼                                     ▼
   ┌───────────────────────── Next.js app ─────────────────────────┐
   │  Pages (server components)      REST API  /api/v1/*           │
   │            │                         │                        │
   │            └──────────┬──────────────┘                        │
   │                       ▼                                       │
   │        src/server/modules/*   (all business logic)            │
   │                       │                                       │
   │        withScope(): one transaction per request,              │
   │        sets app.user_id + app.gym_id                          │
   └───────────────────────┼───────────────────────────────────────┘
                           ▼
              PostgreSQL (row-level security per gym)
```

## Folders

| Path | Contents |
|---|---|
| `src/app` | Routes. `(auth)` sign-in flows, `(staff)` owner/trainer/front-desk area, `me` member portal, `api/v1` REST endpoints. |
| `src/server/modules/<module>` | Business logic per module (gyms, staff, members, memberships, payments, attendance, workouts, ai, reports, notifications). Pure functions taking `(tx, ctx, input)`. |
| `src/server/auth` | Passwords, sessions, gym context resolution, page guards. |
| `src/server/http` | `route()` wrapper: auth, gym context, permission check, Zod validation, CSRF origin check, JSON errors. |
| `src/server/db` | Drizzle schema, connection pool, scoped transactions. |
| `src/shared` | Code safe for both client and server: Zod schemas, money/date/phone helpers, permission matrix. Ready to move into a shared package when the Expo app is added. |
| `src/components` | Design system (`ui/`), app shells, shared widgets. |
| `db/migrations` | SQL migrations (generated tables + hand-written RLS policies). |
| `tests` | `unit/` (pure logic), `integration/` (services against a real Postgres), `e2e/` (Playwright, desktop + mobile). |

## Requests, sessions and gyms

1. The session token comes from the `fito_session` HttpOnly cookie (web) or
   `Authorization: Bearer` (mobile). Tokens are random 256-bit values; only
   their SHA-256 hash is stored.
2. The gym for the request is the session's active gym, or the `X-Gym-Id`
   header (mobile). Membership of that gym is verified on every request.
3. The user's role in that gym (owner, manager, trainer, front desk, member)
   maps to a fixed permission set (`src/shared/permissions.ts`).
4. All database work runs in `withScope({ userId, gymId })`, which sets
   `app.user_id` and `app.gym_id` for the transaction.

## Tenant isolation (database level)

* The app connects as `fito_app`, which does not own the tables and has no
  `BYPASSRLS`, so **row-level security applies to every query**.
* Every gym-owned table has a `gym_id` and a policy `gym_id = app_gym_id()`.
  A query that forgets `WHERE gym_id = …` still only sees the current gym.
* Steps that happen before a user is known (login lookup, session lookup,
  invite lookup, password reset, rate limiting) use narrow
  `SECURITY DEFINER` functions that return only what that step needs.
* `tests/integration/tenancy.test.ts` fails if any table lacks RLS or a
  `gym_id` table lacks a policy.

## Money and dates

* Money is stored in integer **paise** (`bigint`); rupees exist only in the UI.
* Membership dates are calendar dates (`YYYY-MM-DD`) in the gym's time zone
  (default `Asia/Kolkata`), so periods never shift with server time zones.

## Security measures

* scrypt password hashing (N=2^15, r=8, p=3), constant-time comparison and a
  dummy hash for unknown accounts.
* Database-backed rate limits on login, registration, invites and resets.
* CSRF: cookie-authenticated writes must come from the app's own origin.
* Security headers (HSTS, frame denial, nosniff, referrer policy,
  camera permission limited to our origin for the QR scanner).
* Audit log of sensitive actions (staff changes, resets, payments, approvals).
* Secrets only in environment variables; the AI key is used server-side only.
