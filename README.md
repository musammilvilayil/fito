# FITO

Gym management and fitness platform for gym owners, trainers and members:
memberships, payments, QR attendance, trainer management and AI workout
suggestions that a trainer must approve.

Built as one Next.js (TypeScript) app with a REST API (`/api/v1`) on
PostgreSQL. Each gym's data is isolated by Postgres row-level security.

* Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
* Repository audit and plan: [`docs/AUDIT.md`](docs/AUDIT.md)

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

This creates the `fito` and `fito_test` databases, applies migrations and
gives the `fito_app` role a local password. It expects a local superuser
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
| `npm run test:e2e` | Playwright tests (desktop + mobile) against a production build |
| `npm run db:migrate` | Applies migrations using `DATABASE_ADMIN_URL` |
| `npm run db:generate` | Generates a migration after editing `src/server/db/schema.ts` |
