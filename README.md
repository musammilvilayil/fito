# FITO

Gym management and fitness platform for gym owners, trainers and members:
memberships, payments, QR attendance, trainer management and AI workout
suggestions that a trainer must approve.

Built as one Next.js (TypeScript) app with a REST API (`/api/v1`) on
PostgreSQL. Each gym's data is isolated by Postgres row-level security.

| Document | What's in it |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | What's built, integrations not yet connected, known limitations, decisions needed |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Database, hosting, environment variables, connecting your existing domain, backups |
| [`docs/TESTING.md`](docs/TESTING.md) | Testing report: results, coverage, gaps |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the app is structured and secured |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Initial repository audit and plan |

## Who uses what

* **Owners and managers:** dashboard, members, memberships, payments and
  receipts, staff and roles, reports, settings.
* **Front desk:** members, selling and renewing, payments, QR check-in.
* **Trainers:** their assigned members, fitness profiles and health
  screening, AI or template workout plans they review and approve, the
  exercise library.
* **Members:** a mobile-first portal at `/me` with their membership, check-in
  QR, approved workout plan with logging, progress tracking and receipts.
* **AI assistant:** "Ask FITO" for members and an admin assistant for staff.
  It answers from the data the person's role can see, and changes nothing
  without their confirmation. It needs `ANTHROPIC_API_KEY` on the server; see
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#turning-on-ai-workout-drafts-and-the-assistant).

## Requirements

* Node.js 20.9+ (22 recommended)
* PostgreSQL 15+ (local install, Docker, or a hosted database)

## Run locally

```bash
npm install
```

```bash
npm run db:setup-local
```

This creates the `fito` and `fito_test` databases, applies migrations, loads
the exercise library (820 public-domain exercises) and gives the `fito_app`
role a local password. It expects a local superuser
`postgres` on `localhost:5432`; set `PGHOST`, `PGPORT` or `PGUSER` if yours
differs.

```bash
cp .env.example .env.local
```

Set `DATABASE_URL=postgres://fito_app:fito_app_local@localhost:5432/fito` in
`.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000 and choose **Set up your gym**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Generates route types and runs TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (needs the `fito_test` database) |
| `npm run test:e2e` | Playwright tests (desktop + mobile) against a production build. If you start the server yourself, use `ASSISTANT_PROVIDER=fake npm run start` |
| `npm run db:migrate` | Applies migrations using `DATABASE_ADMIN_URL` |
| `npm run db:generate` | Generates a migration after editing `src/server/db/schema.ts` |
| `npm run db:seed-exercises` | Loads or updates the global exercise library using `DATABASE_ADMIN_URL` |
| `npm run db:seed-demo` | Creates or refreshes the **demo gym** for sales demos (see below) |

## Demo gym for sales demos

```bash
npm run db:seed-demo
```

This creates **FITO Demo Gym**, marked with a "Demo data" badge in the app. It has:
* an owner and one trainer;
* 100 fictional members;
* about two months of history: memberships, renewals, payments with receipts,
  dues, freezes, expiring and lapsed members, check-ins with morning and
  evening peaks, trainer-approved workout plans, workout logs and weigh-ins.

Dates are relative to the day you run it, so run it again before a demo. That
replaces the old demo gym; gyms without the demo flag are never touched.

Sign in with password `demo1234`:

| Role | Login |
|---|---|
| Owner | `demo.owner@example.com` |
| Trainer | `demo.trainer@example.com` |
| Member | `demo.member@example.com` (member app) |

Options: `npm run db:seed-demo -- --name "Your Gym Name" --owner "Owner Name" --password "a-long-password"`.
Use a separate demo deployment rather than your live one. On an `https`
`APP_URL` the command refuses unless you add `--confirm`. Names and numbers
are invented, but a `+91 90000 xxxxx` number could still belong to someone,
so don't send WhatsApp messages from the demo gym.

## Environment variables

All variables are listed with comments in [`.env.example`](.env.example) and
explained in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#environment-variables).
The app works without `ANTHROPIC_API_KEY`: workout drafts then come from
FITO's rule-based templates and are labelled as such.
