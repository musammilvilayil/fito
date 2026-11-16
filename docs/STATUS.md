# What's built, what isn't, and what needs a decision

_Status as of 15 November 2026 (branch `fito-web-mvp`)._

## Working today (tested; see `TESTING.md`)

### Gym owner and manager
* Gym sign-up (optionally gated by an access code), gym profile (GSTIN,
  receipt prefix, opening hours, equipment) and operating rules
  (expiring-soon window, session length, monthly AI limit).
* Staff invites with roles (owner, manager, trainer, front desk), a role
  permission matrix, one-time password-reset links and deactivation.
* Dashboard: members by status, renewals to chase, revenue, today's
  check-ins and setup progress.
* Reports: members, revenue and renewals for a date range, and check-ins
  by day and by hour (charts with table views).

### Front desk
* Members: add, search (name, phone, member code), edit, deactivate,
  assign a trainer, and import a CSV or Excel register with a dry run.
* Memberships: sell or renew (early renewals start after the current end),
  admission fee, discounts, part payments, freeze/unfreeze, cancel.
* Payments: cash, UPI, card and bank transfer recorded by hand; PDF
  receipts numbered per Indian financial year (`PREFIX/2026-27/0001`);
  refunds, voids, dues list, CSV export.
* QR check-in by phone camera, USB/Bluetooth scanner or name search. Expired
  or frozen members are refused. Owners and managers can override with a
  reason. One check-in per member per day.
* WhatsApp click-to-chat links for invites, reset links and renewal
  reminders (staff tap to send from their own WhatsApp).

### At the gym: door QR, crowd, batches and equipment
* **Entrance and exit QR.** Attendance → Entrance & exit QR shows two
  posters to print. A member scans the entrance code (phone camera or Home →
  Scan gym QR) and is checked in; the exit code checks them out and shows
  their time in the gym. It only ever checks in the signed-in member, only
  at that gym, with the same rules as the desk (expired, frozen, one
  check-in a day). Signed-out members sign in and are taken straight back.
  Owners can replace both codes; old posters stop working at once.
* **Gym right now.** The member home shows how many people are inside, how
  full that is against the gym's capacity (Settings), and the usual
  check-ins per hour for today's weekday (last 8 weeks), with the busiest and
  a quieter hour. Counts only, never names. The assistant answers "is the gym
  busy?" from the same numbers.
* **Morning and evening batches.** Members are morning, evening or any time
  (member form, list filter, profile). Settings hold the batch hours and the
  rule: allow with a warning (default), refuse unless an owner or manager
  overrides, or ignore.
* **Equipment list.** A catalogue of about 110 common items in 8 groups.
  Owners, managers and trainers add items with quantities, change counts
  with a stepper and add their own items. Front desk and members see the
  list. Workout plans use exercises for the listed equipment.

### Trainer
* Sees only assigned members.
* Fitness profile, PAR-Q style health screening and medical clearance.
  Plans are blocked until clearance when the screening needs it.
* Workout plans in three ways: **AI draft** (Claude), **rule-based
  template**, or **blank**. Exercises come from an 820-exercise
  public-domain library plus the gym's own exercises.
* Every plan is checked against the member's limitations, level, the gym's
  equipment and session length. Plans are versioned. **Nothing reaches a
  member until a trainer approves it**; warnings must be acknowledged at
  approval.
* Sees each member's logged workouts and measurements.

### Member (mobile-first portal at `/me`)
* Membership status, days left and dues; check-in QR (full-screen view).
* Today's or next workout with images, instructions and coaching notes.
  Members tick off exercises, record weight used and effort, and see their
  history.
* Progress: weight, body fat and body measurements with a trend chart.
* Profile: fitness profile, health screening, memberships, receipts and
  attendance history. In-app updates (for example, "your plan is ready").

### AI assistant (members and staff)
* **Member fitness assistant** (`/me/assistant`, the "Ask" tab). It answers
  questions about:
  * their membership, expiry and dues;
  * their approved workout plan and today's session;
  * how to do an exercise, and equipment alternatives;
  * their workout history, visits and progress;
  * general fitness and nutrition, with safety limits (no diagnosis or
    supplement doses; pain or medical issues are referred to a trainer or
    doctor);
  * how to use FITO (QR check-in, renewals, payments, opening hours,
    trainers).
* **Admin assistant** (`/assistant`), answering from whatever the person's
  role can see:
  * today's attendance and estimated occupancy;
  * revenue for a period and pending payments;
  * expiring memberships and inactive members;
  * workout plans waiting for approval, and trainers with their member
    counts;
  * member lookup.
* **Security (brief §19.4):**
  * The AI has no database access. It can only call backend tools, and
    each tool runs with the signed-in person's own permissions and the
    database's row-level security. That covers identity, role, gym and
    resource checks. Branches don't exist in FITO yet; each gym is one
    location.
  * Tools are offered only if the person's role allows them.
  * The one change it can make (saving a measurement) is proposed as a
    card and only happens when the person taps **Confirm**.
  * Every tool call is written to the audit log. Conversations are private
    to each person; owners see usage totals only.
* **Settings → AI:** connection status, a test button, monthly usage and
  estimated cost, on/off for members and staff, and monthly limits.

### Sign-up and gyms
* People can create a member account (`/signup`), find a gym by name or
  city, and join it. They land on the register with no membership; the
  front desk is notified and sells a plan.
* They can join more gyms and switch between them from the account menu.
  Each gym's records (memberships, payments, attendance) stay separate:
  nothing moves between gyms.
* An existing register entry is never linked by phone number alone, because
  without SMS verification that would let someone take over another
  person's membership. Those people use the gym's invite link instead.
* Gyms can turn app sign-ups off (Settings → Operations).
* Trainers can add members, who are assigned to them.

### Demo gym for sales
* `npm run db:seed-demo` creates a demo gym with an owner, a trainer, a front
  desk and 100 fictional members, plus two months of realistic history
  (batches, door check-outs and an equipment list included).
* It's marked with a "Demo data" badge, re-runnable, and never touches real
  gyms (see README).

### Platform
* Next.js 16 + TypeScript, PostgreSQL with row-level security per gym,
  REST API `/api/v1` with Bearer tokens ready for the planned Expo app.
* Security: scrypt passwords, hashed session tokens, HttpOnly cookies, CSRF
  origin checks, database-backed rate limits, security headers and an
  audit log.

## Integrations not connected (clean boundaries in place)

| Integration | Today | What's in the code | What it needs |
|---|---|---|---|
| **Online payments** (Razorpay or similar) | Staff record payments by hand; UPI goes to the gym's own account. | `src/server/modules/payments/gateway.ts`: interface for payment links and webhooks; schema columns and a unique index for gateway payment IDs. | A gateway account (the gym as merchant), keys and a webhook route. **Split settlements or marketplace payouts are not assumed**: they need separate approval from the provider. |
| **SMS / WhatsApp Business API / email** | Invites, reset links and reminders go out as WhatsApp click-to-chat links sent by staff. In-app notifications only. | `src/server/modules/notifications/service.ts` is the single place to add delivery channels. | A provider account (for example, WhatsApp Business via a BSP, an SMS provider with DLT registration, or transactional email) and the owner's choice of channel. |
| **Automatic reminders** | Renewal lists are on the dashboard; staff send reminders. | Not scheduled. | A daily job (Vercel Cron or a server cron) once a delivery channel exists. |
| **Live AI** | Workout drafts and the assistant are built and tested with stand-in models. No API key was available here (this environment can't accept one for Anthropic's host), so **no live Claude call has been made yet**. Without a key, drafts use templates and the assistant is hidden. | `src/server/modules/ai/` (workout drafts) and `src/server/modules/assistant/` (chat). Both use a server-only key, validate every model output or tool input, log usage and cost per gym, and apply monthly limits. Requests opt in to Anthropic's **server-side refusal fallback** (beta): if the model declines, Anthropic retries on a fallback model in the same call, and FITO records the model that actually answered. | `ANTHROPIC_API_KEY` on the server, then **Settings → AI → Test connection** and one real draft and chat on staging. |
| **Exercise media hosting** | Images load from the public free-exercise-db GitHub repository. | `EXERCISE_MEDIA_BASE_URL`. | Copy the images to your own storage/CDN for production. Licensed video can be added per exercise (gym exercises already accept a YouTube link). |
| **Expo Android app** | Not started. | The REST API, Bearer tokens, `X-Gym-Id` and `/api/v1/me` are ready; shared Zod schemas live in `src/shared`. | The mobile app itself. |

## Known limitations

* **Logo:** the app uses raster crops of the supplied logo
  (`public/brand/`) as placeholders. The source image is a raster with a
  Gemini watermark, and its tagline ("Fitness, Connected.") differs from the
  brief ("Fitness. Evolved."). A clean vector logo (SVG) and a tagline
  choice are needed before launch; swap the files in `public/brand/` and
  `src/components/brand.tsx`.
* **GST:** receipts show the GSTIN when set, but FITO doesn't calculate
  tax lines or produce GST invoices. Confirm the requirement with your CA.
* **Members can't pay online or book classes**; there is no class
  scheduling module.
* **The assistant can't help with** online payments, supplement or shop
  orders, inventory, class or session bookings, trainer shift timetables or
  branches. Those modules don't exist yet, and it tells people so. There is
  no public (signed-out) support chatbot: it would need abuse and cost
  controls first.
* **Member details** (name, phone) are changed by staff, not by members.
* **Door QR posters are fixed codes.** A member with a photo of the entrance
  poster could check in without being at the gym. FITO has no location or
  Wi-Fi check. If a photo is shared, replace the codes (Attendance →
  Entrance & exit QR). A code shown on a screen that changes every minute
  would close this gap; it isn't built.
* **One check-in per day.** A member who leaves and comes back later the
  same day isn't checked in again (the entrance code says so).
* **"Inside now" is an estimate** for people who don't scan the exit code:
  they're counted until the typical visit length (Settings) has passed.
* **Single language** (English). Malayalam is not added yet.
* **Not yet checked on real phones**, iOS Safari, with a screen reader, or
  under load (see `TESTING.md`).
* **Dev-tool advisories:** 12 moderate `npm audit` findings exist in
  development tooling only; none in production dependencies.

## Decisions for you before launch

1. **Hosting plan.** Vercel Pro or a VPS, plus a paid managed Postgres with
   backups. These are paid and need your approval (`DEPLOYMENT.md`).
2. **Subdomain and DNS record.** You add one record at your DNS provider;
   nothing has been changed.
3. **Anthropic API key** on the server (it powers both workout drafts and the
   assistant), plus the monthly limits in Settings → AI.
4. **Payment gateway** and whether gyms will use their own merchant accounts.
5. **Messaging channel** for reminders (WhatsApp Business, SMS or email).
6. **Logo and tagline.**
