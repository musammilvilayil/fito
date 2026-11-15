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

* Node.js 22 LTS (20.12 or newer works)
* PostgreSQL 15 or newer, running on the same computer (or Docker, or a hosted database)
* Git

## Run on your laptop (Windows, macOS or Linux)

1. Install **Node.js 22 LTS** (nodejs.org), **PostgreSQL** (postgresql.org/download)
   and **Git**.
   * The PostgreSQL installer on Windows and macOS asks you to choose a password
     for the `postgres` user. Remember it.
   * On a Mac with Homebrew you can instead run
     `brew install postgresql@16 && brew services start postgresql@16`. That
     setup has no password.
2. Get the code:

```bash
git clone https://github.com/musammilvilayil/fito.git
```

```bash
cd fito
```

```bash
git checkout fito-web-mvp
```

3. Install and start, with the demo gym:

```bash
npm install
```

```bash
npm run demo
```

`npm run demo` does four things:
* It sets up the databases, asking for the PostgreSQL password if there is one.
* It writes `.env.local`.
* It creates the demo gym.
* It builds the app and starts it.

The first run takes a few minutes.

4. Open http://localhost:3000 and sign in as `demo.owner@example.com` with
   password `demo1234` (other logins are listed under "Demo gym for sales
   demos").

Next time, refresh the demo dates and start. The build is already there unless
you've pulled new code; if you have, run `npm run build` first.

```bash
npm run db:seed-demo
```

```bash
npm start
```

Stop the app with Ctrl+C in that window.

**Showing it on a phone:** connect the phone to the same Wi-Fi and open the
"Network" address that `npm start` prints (for example
`http://192.168.1.5:3000`). If Windows asks whether Node.js may use the
network, allow it for private networks. Phone browsers only allow the camera
on https sites, so on a phone use name search for check-in. The laptop's own
camera works at `localhost`.

**In GitHub Codespaces:** Docker gives you PostgreSQL, and the setup fills in
the Codespace's https address for you. Run these in the Codespace terminal:

```bash
git checkout fito-web-mvp
```

```bash
docker run -d --name fito-db --restart unless-stopped -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

```bash
npm install
```

```bash
PGPASSWORD=postgres npm run demo
```

When it says *Ready*, open port 3000 from the **Ports** tab. Ports are private
to your GitHub account by default. Making port 3000 *Public* lets anyone with
the link open the demo.

**For development**, use `npm run dev` instead of build and start. To set up
the databases without the demo gym, run `npm run db:setup-local`. It's safe
to re-run, and you can set `PGHOST`, `PGPORT`, `PGUSER` or `PGPASSWORD` if
your PostgreSQL differs from the defaults.

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
| `npm run db:setup-local` | Creates the local databases, applies migrations, loads exercises, writes `.env.local` |
| `npm run demo` | Local setup, demo gym, build and start, in one command |

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
