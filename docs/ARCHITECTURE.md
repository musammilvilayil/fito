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
  The same applies to finding a gym to join (`fito_search_gyms`) and to the
  door QR (`fito_scan_gym`), which returns only the gym id and "in" or
  "out"; the check-in itself then runs as the signed-in member, under RLS.
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
* CSRF: writes that carry the session cookie must come from the app's own
  origin, and any request that sends an `Origin` header is checked. Native
  apps use Bearer tokens and send neither.
* Security headers (HSTS, frame denial, nosniff, referrer policy,
  camera permission limited to our origin for the QR scanner).
* Audit log of sensitive actions (staff changes, resets, payments, approvals).
* Secrets only in environment variables; the AI key is used server-side only.

## Workout plans and AI

```
trainer picks member ─▶ generatePlan ─┬─ AI draft (Claude, structured output)
                                      │     validate against library + safety rules
                                      │     └─ problems? retry once with them ─▶ still bad? template
                                      ├─ rule-based template
                                      └─ blank
                    ▼
        plan (status: pending_review / draft, version 1)
                    │  edits create new versions
                    ▼
        approvePlan (needs workouts.approve; warnings must be acknowledged;
                     medical clearance must be recorded if screening requires it)
                    ▼
        active (one per member, enforced by a partial unique index) ─▶ member sees it
```

* The AI call runs **outside** any database transaction; prep and save are
  separate short transactions.
* The prompt never includes the member's name, phone, email or member code.
  It contains:
  * goal, level and schedule;
  * age and gender, if recorded;
  * limitation tags;
  * free-text notes from the member's limitations and preferences, plus the
    trainer's instructions. These are sent as typed, so don't put names in
    them;
  * a candidate exercise list filtered by those rules. The model can only
    pick IDs from that list.
* Requests use Anthropic's server-side refusal fallback (beta). Usage,
  latency, cost and the model that answered are stored in `ai_generations`.
  A monthly per-gym limit stops runaway cost.
* Safety rules (`src/shared/workout-rules.ts`, `exercise-safety.ts`) run in
  the browser while editing and again on the server at save and approval.

## Member portal

`/me` serves members (role `member`) with a member-safe projection of their
record (`selfView` in `src/server/modules/portal/service.ts`: no staff notes,
QR token or invite state). Members can only reach their own record. Every
service checks `ctx.memberId === memberId` before allowing self-access, and
RLS still limits them to their gym. Workout logs (`workout_logs`, one per
member, plan, day and date) and progress entries (`progress_entries`) are
written by the member or by staff who coach them.

## AI assistant

```
browser ──POST /api/v1/assistant/chat──▶ runTurn (src/server/modules/assistant/service.ts)
   ▲          (Server-Sent Events)            │ 1. checks: provider, gym on/off, rate limit, monthly quota
   │                                          │ 2. loads the thread transcript (append-only)
   └──── text deltas, tool status, ◀──────────┤ 3. model call (Claude, streaming) with role-filtered tools
         proposed actions, done                │ 4. tool_use → validate input (Zod) → run tool with the
                                               │    person's own GymContext (permissions + RLS)
                                               │ 5. repeat up to 6 rounds; store the turn; log usage
```

* **No database access for the model.** Tools in `tools.ts` call the same
  service functions the app uses, with the signed-in person's context. A
  trainer's tool sees only their members; a member's tools see only
  themselves. Tools a role can't use aren't offered, and calls to anything
  else are refused.
* **Writes need confirmation.** A tool that would change data returns a
  proposal, stored in `assistant_actions`. The UI shows Confirm/Cancel, and
  confirming runs the normal service (for example `addProgressEntry`) with
  the person's permissions. The model is told the outcome on the next turn.
* **Privacy.** `assistant_threads`, `assistant_messages` and
  `assistant_actions` have row-level security on gym *and* user. Owners see
  only usage totals (`ai_generations`, feature `assistant`), never content.
  Tool calls are written to `audit_logs`.
* **Transcript discipline.** Claude ties its reasoning blocks to the exact
  system prompt, tools and earlier messages. So the system prompt per
  persona is constant, tools come in a fixed order, and the transcript is
  replayed exactly as stored and only appended to. Facts that change
  (today's date, who is asking, outcomes of confirmed actions) are added as
  mid-conversation system messages. If the model or the person's tool set
  changes, a new thread starts.
* **Cost control.** Effort `low` by default, prompt caching on the stable
  prefix, a burst limit (20 messages per 10 minutes) and a per-person
  monthly limit set by the owner.
* **Provider boundary.** `model.ts` has the Claude implementation and a
  scripted stand-in (`ASSISTANT_PROVIDER=fake`) for automated tests.
