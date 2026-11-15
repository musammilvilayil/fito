# Deploying FITO

This guide puts FITO on a subdomain of a domain you already own, for example
`app.yourgym-domain.in`. Nothing here buys a domain or changes DNS for you:
the one DNS record you add is listed in step 6, and you add it yourself.

> **Decisions that need the owner's approval before going live**
> 1. **Hosting plan.** Vercel's free Hobby plan is for personal,
>    non-commercial projects. A paid gym product needs a paid plan (Vercel
>    Pro) or another host such as a small VPS (option B below).
> 2. **Database plan.** Supabase's free tier pauses idle projects and has no
>    point-in-time recovery. For real member and payment data, use a paid
>    plan or another managed Postgres with daily backups.
> 3. **The DNS record** in step 6.
>
> Check current terms and prices on the providers' sites; they change.

## What you need

| Item | Notes |
|---|---|
| PostgreSQL 15+ | Mumbai region (`ap-south-1`) keeps latency low for Kerala. Supabase, Neon, AWS RDS or your own server all work. |
| Node.js 22 host | Vercel (option A) or any Linux server (option B). |
| Your domain's DNS access | To add one CNAME (or A) record for the subdomain. |
| Anthropic API key (optional) | Without it, plans come from FITO's rule-based templates. |

## Environment variables

Set these on the host. Never commit real values. `.env.example` has the same
list with comments.

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | yes | Connection as the **`fito_app`** role. Never the table owner: row-level security does not apply to the owner. |
| `DATABASE_ADMIN_URL` | migrations only | Owner connection for `db:migrate` and `db:seed-exercises`. Do **not** set it on the web host. |
| `APP_URL` | yes | `https://app.yourgym-domain.in` with no trailing slash. Used in invite/reset links and the CSRF check, and an `https` value makes the session cookie `Secure`. |
| `SIGNUP_ACCESS_CODE` | recommended | When set, creating a gym at `/register` needs this code. Keep it set during the pilot. |
| `ANTHROPIC_API_KEY` | optional | Server-only. Turns on AI workout drafts and the in-app assistant (see "Turning on AI" below). |
| `AI_MODEL` | optional | Default `claude-opus-5-5`. |
| `AI_MONTHLY_LIMIT_DEFAULT` | optional | AI workout drafts per gym per month (default 100). Owners change it in Settings → AI. |
| `ASSISTANT_MODEL` | optional | Assistant model; defaults to `AI_MODEL`. |
| `ASSISTANT_EFFORT` | optional | `low` (default: fastest and cheapest), `medium` or `high`. |
| `ASSISTANT_MONTHLY_MESSAGES_DEFAULT` | optional | Messages per person per month (default 300). Owners change it in Settings → AI. |
| `ASSISTANT_PROVIDER` | optional | Leave unset (`anthropic`). `fake` is a scripted model for automated tests only. |
| `EXERCISE_MEDIA_BASE_URL` | optional | Exercise images. Defaults to the public-domain free-exercise-db on GitHub; point it at your own storage/CDN for production. |
| `DATABASE_POOL_MAX` | optional | Connections per server instance. Keep 3 to 5 on serverless. |
| `LOG_LEVEL` | optional | `info` in production. |

## Step 1: Create the database

Create a Postgres 15+ database in Mumbai. You need two connection strings:

* **Owner** (for migrations): the provider's admin user. On Supabase use
  the *direct* or *session pooler* string (port 5432) with the `postgres`
  user.
* **App** (for the running site): the `fito_app` role created by the
  migrations (step 2). On Supabase use the *transaction pooler* (port 6543)
  and the user name `fito_app.<project-ref>`.

FITO sets its tenant variables with `set_config(..., true)`, which only last
for the current transaction, and it doesn't use named prepared statements.
That makes it safe to run behind transaction-mode poolers (Supabase
Supavisor, PgBouncer).

On Supabase, also turn off the **Data API** (Project settings → API). FITO
doesn't use it, and the migrations already revoke access from the `anon` and
`authenticated` roles.

## Step 2: Run migrations and load the exercise library

From your computer or CI, with the **owner** string:

```bash
npm ci
```

```bash
DATABASE_ADMIN_URL="postgres://postgres:...@...:5432/postgres" npm run db:migrate
```

```bash
DATABASE_ADMIN_URL="postgres://postgres:...@...:5432/postgres" npm run db:seed-exercises
```

Both are safe to re-run. Migrations create the `fito_app` role without a
password (it can't log in yet).

## Step 3: Let `fito_app` log in

Pick a long random password and run this once as the owner (`psql` or the
provider's SQL editor):

```sql
ALTER ROLE fito_app WITH LOGIN PASSWORD 'a-long-random-password';
```

Then check that row-level security is in force for that role. This should
return `false`:

```sql
SELECT rolbypassrls FROM pg_roles WHERE rolname = 'fito_app';
```

## Step 4: Deploy the app

### Option A: Vercel

1. Import the GitHub repository in Vercel. The framework preset is
   Next.js; build command `npm run build`; Node.js 22.
2. `vercel.json` pins functions to **Mumbai (`bom1`)**, next to the
   database. Keep the database in the same region.
3. Add the environment variables above (Production scope). Leave out
   `DATABASE_ADMIN_URL`.
4. Deploy. The AI draft endpoint asks for up to 180 seconds
   (`maxDuration` in `src/app/api/v1/workouts/generate/route.ts`). Confirm
   your plan allows that; if not, lower it, since template fallback still
   works.

### Option B: Your own Linux server

1. Install Node.js 22, and Postgres if it runs on the same machine.
2. Run these commands:

```bash
git clone https://github.com/<you>/fito.git && cd fito
```

```bash
npm ci && npm run build
```

3. Put the variables in a root-readable env file and run `npm start` (port
   3000) under systemd or pm2.
4. Put Caddy or nginx in front for HTTPS. Caddy gets certificates
   automatically once DNS points at the server.

## Turning on AI (workout drafts and the assistant)

1. Create an API key in the Anthropic Console (console.anthropic.com), in an
   organisation with billing set up. Paying for API usage is your decision.
   FITO shows an estimated monthly cost in Settings → AI.
2. Add it to the **server's** environment as `ANTHROPIC_API_KEY` (Vercel:
   Project → Settings → Environment Variables, Production) and redeploy.
   Never put it in code, in `NEXT_PUBLIC_*` variables or in the database.
3. The server must be able to reach `api.anthropic.com` over HTTPS.
4. Sign in as the owner and open **Settings → AI**. It should say
   *Connected*. Press **Test connection**, which sends one tiny request.
5. In the same card, choose whether members and staff can use the assistant
   and set the monthly limits.

The chat endpoint streams for up to 120 seconds
(`src/app/api/v1/assistant/chat/route.ts`) and workout drafts up to 180
seconds. Check your hosting plan allows that.

## Step 5: First sign-in

1. Open `https://<your-subdomain>/register`, enter the
   `SIGNUP_ACCESS_CODE`, and create the first gym and owner account.
2. Complete **Settings → Gym profile**: receipt prefix, GSTIN if you
   have one, and equipment. The equipment list drives which exercises plans
   can use.
3. Add plans, invite staff, add or import members.

## Step 6: Connect your existing domain (you make this change)

Use a **subdomain** such as `app.` so the main website and email records are
untouched.

1. In Vercel: Project → Settings → Domains → add `app.yourgym-domain.in`.
   Vercel shows the exact record to create, usually
   `CNAME app → <value Vercel shows>`. (For option B: an `A` record to
   your server's IP.)
2. At your DNS provider, add **only that record**. Don't change `MX`,
   `TXT`/SPF/DKIM or the apex `A` record.
3. Wait for HTTPS to show as valid in Vercel (minutes to a few hours).
4. Set `APP_URL` to the `https://` subdomain and redeploy. Invite links
   generated before this point use the old URL; resend them.

## Smoke test after each deploy

* `/login` loads over HTTPS. Response headers include
  `Strict-Transport-Security` and `X-Frame-Options: DENY`.
* Sign in as owner. The dashboard loads and the **Exercise library**
  shows 820+ exercises.
* Sell a test membership and open its receipt PDF.
* On a phone: open **Attendance → Open check-in scanner**, allow the camera, and scan a
  member's QR from another screen.
* Invite a test member, open the link on a phone, and confirm `/me` shows
  the QR, membership and plan.
* Create an AI draft (or a template draft if no key) and approve it. The
  member sees it on **Workout**.
* With a key set: Settings → AI shows *Connected*, **Test connection**
  succeeds, and asking the **Assistant** "How many people checked in
  today?" returns today's count.

## Backups and updates

* **Backups:** turn on daily backups at your database provider. In
  addition, take a weekly logical backup kept off-site:

```bash
pg_dump --format=custom --no-owner "$DATABASE_ADMIN_URL" > fito-$(date +%F).dump
```

* **Before every migration**, take a `pg_dump`. Migrations only move
  forward; to undo one, restore the dump.
* **Updates:** merge to the deployed branch, run `npm run db:migrate` with
  the owner string *before* the new code goes live when a release adds
  migrations, then deploy. Vercel can roll back the code instantly; the
  database is restored from the dump if needed.
* **Secrets:** rotate the `fito_app` password and the Anthropic key if they
  are ever exposed. Changing `fito_app`'s password needs only an env update
  and a redeploy. Sessions are stored hashed in the database; to sign
  everyone out, run `DELETE FROM sessions;` as the owner.

## Production notes

* **Exercise images** load from GitHub's raw file host by default. That is
  fine for a pilot. For production, copy the images to your own storage and
  set `EXERCISE_MEDIA_BASE_URL`.
* **Rate limits** (login, registration, invites, resets) live in the
  database, so they work across serverless instances.
* **Time zone:** each gym has its own (default `Asia/Kolkata`). Membership
  dates and "today" follow the gym, not the server.
