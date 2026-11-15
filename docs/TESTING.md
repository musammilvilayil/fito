# Testing report

_Last full run: 15 November 2026, on the `fito-web-mvp` branch (after adding the AI assistant)._

## Results

| Check | Command | Result |
|---|---|---|
| TypeScript (strict) | `npm run typecheck` | No errors |
| Lint | `npm run lint` | No errors or warnings |
| Unit + integration | `npm test` | **109 passed**, 1 skipped (14 files) |
| End-to-end, desktop + Pixel 7 | `npm run test:e2e` | **26 passed**, 2 skipped (14 scenarios × 2 devices) |
| Production dependencies | `npm audit --omit=dev` | 0 known vulnerabilities |
| All dependencies | `npm audit` | 12 moderate, all in dev-only tooling (drizzle-kit's bundled esbuild, typescript-eslint's minimatch). Not shipped to users. |

The skips are intentional:
* `receipt-render.test.ts` writes a sample receipt PDF for visual review. It
  only runs when asked to.
* The camera check-in test runs once (desktop). Chromium's fake camera is the
  same on both device profiles.
* The security spec runs once (desktop). It tests the HTTP API, which
  doesn't depend on the device.

## How the suites work

* **Unit** (`tests/unit`): pure logic covering phone normalisation, money in
  paise, date and financial-year maths, membership periods and renewal
  dates, permissions, and workout-day scheduling.
* **Integration** (`tests/integration`): services against a real
  PostgreSQL database (`fito_test`) through the same `fito_app` role and
  row-level security as production. The database is reset before each test.
* **End-to-end** (`tests/e2e`): Playwright drives a production build
  (`npm run build && npm start`) in Chromium as a 1440px desktop and as a
  **Pixel 7** phone. Each scenario registers its own gym, so runs don't
  share data. The server runs with `ASSISTANT_PROVIDER=fake`, a scripted
  stand-in model, so assistant tests make no API calls. If you start the
  server yourself for e2e, start it the same way.

Run them locally:

```bash
npm run db:setup-local
```

```bash
npm test
```

```bash
npm run test:e2e -- --trace off
```

## What is covered

| Area | Integration | End-to-end |
|---|---|---|
| Registration, login, sessions, invites, password reset | `auth` | 01 |
| Member self sign-up, gym search (only gyms open to sign-ups, wildcard-safe), joining (no takeover of existing register entries), joining a second gym and switching | `self-signup` | 10 |
| Trainers adding members (assigned to themselves; can invite only their own; no edit or deactivate) | `trainer-members` | (none) |
| Gym isolation (RLS on every table, policies, no cross-gym reads/writes) | `tenancy` | 08 |
| Roles and permissions (owner, manager, trainer, front desk, member) | `auth`, `members`, `workouts`, `member-portal` | 01, 05, 07, 08 |
| Members: create, search, edit, deactivate, CSV import with dry run (Excel files share the import path but have no test of their own) | `members` | 02 |
| Plans, sales, renewals, discounts, part payments, freezes, cancellations | `billing` | 03 |
| Payments, receipts (financial-year numbering, PDF), refunds, voids, dues | `billing` | 03, 07 |
| QR check-in by camera, handheld scanner and name; one check-in a day; expired-member refusal; staff override | `attendance` | 04 |
| Dashboard and reports | `billing`, `attendance` | 04, 06 |
| Fitness profile, health screening, medical clearance | `workouts`, `member-portal` | 05, 07 |
| Workout plans: AI draft (fake provider), validation, retry, template fallback, quota, versioning, approval with acknowledged warnings, one active plan | `workouts` | 05 |
| Member portal: home, QR, dues, workout logging, progress, receipts | `member-portal` | 07 |
| Security through the HTTP API: no session, CSRF, member vs staff, member vs member, trainer scope, cross-gym and `X-Gym-Id`, Bearer tokens and logout, SQL injection and XSS input, login throttling, headers and cookies | `tenancy`, `auth` | 08 |
| Demo seed: one flagged demo gym; realistic mix of statuses, dues and plans; check-ins only on valid membership days and never in the future; gap-free receipts per financial year; demo member login with a plan; re-run replaces it and other gyms are untouched | `demo-seed` | (none) |
| AI assistant: role-based tools, a model asking for tools outside the role, invalid tool input, exact append-only replay (thinking blocks, stable system prompt and tools), confirm-before-save, privacy between users and from the owner, refusals, provider failures, model or tool changes starting a new chat, monthly limits, usage logging | `assistant` | 09 |
| Layout: no page scrolls sideways on desktop or phone, with long real-world names | (none) | 06, plus checks in 04, 05, 07 and 09 |

## Problems the tests caught (all fixed)

* Searching a member code such as `M0001` also matched phone numbers ending
  in 0001.
* Correlated SQL subqueries were built with unqualified column names. That
  gave wrong "paid" totals, plan member counts, setup progress and trainer
  member counts.
* A duplicate check-in queried the database after a failed insert had
  already aborted the transaction.
* On phones, the plan editor and exercise library were wider than the
  screen (the plan editor by 86px), so dialogs were cut off. The cause was
  grids without explicit columns, fixed across the app; test 06 now guards
  every page.
* The native mobile app could not log in: requests with no cookie and no
  `Origin` header were rejected as CSRF.
* A member could read the staff's internal notes about them via
  `GET /members/:id`.
* A member could clear their own pending medical clearance by re-answering
  the health screening with "no".
* Several pages ran queries concurrently on one transaction (deprecated by
  the Postgres driver and rejected in its next major version).
* Local setup didn't load the exercise library.

## Checked by hand

* Screenshots of every member-portal page on a Pixel 7 and on desktop,
  including the progress chart's tooltip and end label.
* The overflow measurement script used for the phone-layout bug (element
  edges compared against the 412px screen width).

## Not tested yet

| Gap | Why | What to do |
|---|---|---|
| A live Claude API call (workout drafts and the assistant) | No API key could be used in this environment. Both are tested with stand-in models (valid, invalid, refused and failing responses). | Set `ANTHROPIC_API_KEY` on staging. Run **Settings → AI → Test connection**, then one AI draft and a few assistant questions as a member and as the owner. |
| Real phones and iOS Safari | Only Chromium device emulation is installed here. | Try check-in scanning and the member portal on one Android and one iPhone before the pilot. |
| Screen-reader and automated accessibility audit | Not run. Components use labelled controls, focus rings and keyboard-reachable charts, but no axe/Lighthouse pass was done. | Run Lighthouse accessibility on the main pages. |
| Load | Not run. | Pilot scale (one or two gyms of 200–400 members) is well within one small server or serverless deployment. Load-test before onboarding many gyms. |
| Payment gateway, SMS and email delivery | Not built (see `STATUS.md`). | Not applicable. |
