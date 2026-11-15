# Repository audit and implementation plan

_Audit date: 14 November 2026_

## What was in the repository

| Item | Finding |
|---|---|
| Files | One file: `README.md` containing `# fito` |
| Framework / dependencies | None |
| Pages, components, APIs | None |
| Database configuration | None |
| Reusable code | None |
| Broken features / technical debt | None (nothing to break) |

There was no existing code to preserve, so FITO was built from scratch. The
technology choices below follow the master brief and the earlier product
planning (PostgreSQL, modular monolith, Next.js, Expo later).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| App shape | One Next.js app: web UI + REST API (`/api/v1`) | One deployment for a solo founder; Vercel-compatible. The future Expo app uses the same REST API, so business logic is not duplicated. |
| Language | TypeScript (strict) | Brief requirement; one language end to end. |
| Database | PostgreSQL + Drizzle ORM, SQL migrations | Money, attendance and memberships need transactions and constraints. |
| Tenant isolation | Postgres row-level security keyed on `app.gym_id` | Enforced by the database, not just app code (brief §7). |
| Auth | FITO's own sessions (opaque tokens, scrypt passwords) instead of Supabase Auth | Works on any Postgres host (Supabase, Neon, RDS), testable locally, same tokens for web (cookie) and mobile (Bearer). No SMS provider is needed for the pilot: staff share invite and reset links on WhatsApp. |
| Validation | Zod schemas in `src/shared`, used by forms and the API | One set of rules for client and server. |
| UI | Tailwind CSS v4, custom components on Radix primitives, Geist font | Distinct FITO design system rather than a stock admin template. |
| AI | Provider boundary in `src/server/modules/ai`, Claude as default | Replaceable provider; key never leaves the server. |
| Payments | Recording first; gateway behind an interface | Split settlements are not assumed (brief §6D). |

## Implementation plan (phases from the brief)

1. Audit, architecture, authentication, gym setup, staff and roles.
2. Owner dashboard and member management (CRUD, search, import, invites).
3. Membership plans, sales, renewals, freezes, payments, receipts, dues.
4. QR attendance (member QR codes, scanner, manual check-in) and reports.
5. Trainers, exercise library, workout plans, AI generation with approval.
6. Member portal, mobile polish, security tests, deployment guide.

Each phase ends with tests, a responsive check and a commit.
