/**
 * DEMO DATA for sales demos. Never use it to create real data.
 *
 * One clearly marked demo gym (settings.demo = true) with an owner, one
 * trainer and 100 fictional members, plus about two months of history:
 * memberships, renewals, payments with receipts, dues, freezes, check-ins,
 * workout plans, workout logs and weigh-ins. Business records go through
 * FITO's own services (same rules and receipt numbering as the app); only
 * high-volume history (check-ins, workout logs, weigh-ins) is inserted
 * directly. Dates are relative to the day it runs. Running it again replaces
 * the previous demo gym; gyms without the demo flag are never touched.
 *
 * Run it with `npm run db:seed-demo` (see scripts/seed-demo.ts).
 */
import { Pool } from "pg";
import { inGym, resolveGymContext } from "../src/server/auth/context";
import { resolveSession } from "../src/server/auth/session";
import { registerGymOwner, acceptInvite } from "../src/server/modules/auth/service";
import { updateGymProfile, updateGymSettings } from "../src/server/modules/gyms/service";
import { createMember, createMemberInvite, setMemberStatus } from "../src/server/modules/members/service";
import { freezeMembership, sellMembership } from "../src/server/modules/memberships/service";
import { recordPayment } from "../src/server/modules/payments/service";
import { createPlan } from "../src/server/modules/plans/service";
import { inviteStaff } from "../src/server/modules/staff/service";
import { approvePlan, generatePlan, recordClearance, saveHealthScreening, updateFitnessProfile } from "../src/server/modules/workouts/service";
import { addDays, diffDays, todayIn } from "../src/shared/dates";
import { periodEnd } from "../src/shared/membership";
import { registerSchema } from "../src/shared/schemas/auth";
import { freezeSchema, planSchema, recordPaymentSchema, sellMembershipSchema } from "../src/shared/schemas/billing";
import { EQUIPMENT_OPTIONS, gymProfileSchema, gymSettingsSchema, staffInviteSchema } from "../src/shared/schemas/gym";
import { memberCreateSchema } from "../src/shared/schemas/member";
import { fitnessProfileSchema } from "../src/shared/schemas/workout";

export const OWNER_EMAIL = "demo.owner@example.com";
export const TRAINER_EMAIL = "demo.trainer@example.com";
export const MEMBER_EMAIL = "demo.member@example.com";
const DAYS = 60;

/* ------------------------------------------------------------ randomness */

// Fixed seed: the same people and patterns every run; only dates move.
let seed = 20261115;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1]![0];
}

const MALE = ["Arjun", "Rahul", "Vishnu", "Akhil", "Anand", "Nikhil", "Sreejith", "Abhijith", "Jithin", "Arun", "Midhun", "Sanjay", "Gokul", "Harikrishnan", "Sachin", "Jishnu", "Amal", "Adarsh", "Aswin", "Basil", "Jobin", "Tony", "Kevin", "Albin", "Ebin", "Fahad", "Shameer", "Ajmal", "Irfan", "Rinshad", "Faisal", "Nithin", "Vivek", "Deepak", "Rohit", "Manu", "Sarath", "Bibin", "Shinto", "Alan", "Joel", "Sidharth", "Anoop", "Rejith", "Hashim"];
const FEMALE = ["Anjali", "Aparna", "Lakshmi", "Meera", "Nisha", "Athira", "Aswathy", "Divya", "Gopika", "Keerthana", "Sneha", "Sruthi", "Ann Mary", "Neethu", "Reshma", "Fathima", "Shabna", "Hiba", "Ayisha", "Riya", "Anu", "Devika", "Nimisha", "Parvathy", "Ancy", "Jincy", "Merin", "Sona", "Haritha", "Amrutha"];
const SURNAMES = ["Nair", "Menon", "Pillai", "Kurup", "Varghese", "Thomas", "Mathew", "Joseph", "Kurian", "George", "Jacob", "Abraham", "Babu", "Krishnan", "Das", "Raj", "Rahman", "Basheer", "Ali", "Hameed", "Ashraf", "Panicker", "Warrier", "Antony", "Sebastian", "Philip", "Chacko", "Prakash", "Mohan", "Suresh"];
const AREAS = ["Kakkanad", "Edappally", "Palarivattom", "Vyttila", "Kaloor", "Kadavanthra", "Thrikkakara", "Aluva", "Tripunithura", "Panampilly Nagar", "Elamakkara", "Vennala"];

type PlanKey = "monthly" | "quarterly" | "half" | "annual" | "student";
const PLANS: Record<PlanKey, { name: string; months: number; price: string; admission: string }> = {
  monthly: { name: "Monthly", months: 1, price: "1200", admission: "500" },
  quarterly: { name: "Quarterly", months: 3, price: "3300", admission: "500" },
  half: { name: "Half-yearly", months: 6, price: "6000", admission: "500" },
  annual: { name: "Annual", months: 12, price: "10500", admission: "0" },
  student: { name: "Student Monthly", months: 1, price: "900", admission: "300" },
};
const PRICE_PAISE = (k: PlanKey) => Number(PLANS[k].price) * 100;
const ADMISSION_PAISE = (k: PlanKey) => Number(PLANS[k].admission) * 100;

export type DemoOptions = { name: string; owner: string; password: string; adminUrl: string };

export async function seedDemo(opts: DemoOptions) {
  seed = 20261115;
  const admin = new Pool({ connectionString: opts.adminUrl, max: 2 });
  const q = (text: string, params: unknown[] = []) => admin.query(text, params);
  const TZ = "Asia/Kolkata";
  const today = todayIn(TZ);
  const windowStart = addDays(today, -DAYS);
  const meta = { ip: `demo-seed-${Date.now()}`, userAgent: "fito-demo-seed" };
  const contextFor = async (token: string) => {
    const session = await resolveSession(token);
    const r = session ? await resolveGymContext(session) : null;
    if (!r || r.kind !== "ok") throw new Error("Could not open the demo gym");
    return r.ctx;
  };

  try {
  /* ----- 1. remove the previous demo gym (only gyms flagged as demo) */
  const old = await q(`select id from gyms where settings->>'demo' = 'true'`);
  const oldIds = old.rows.map((r) => r.id as string);
  if (oldIds.length) {
    const users = await q(
      `select user_id from gym_staff where gym_id = any($1) and user_id is not null
       union select user_id from members where gym_id = any($1) and user_id is not null`,
      [oldIds],
    );
    await q(`delete from gyms where id = any($1)`, [oldIds]);
    const userIds = users.rows.map((r) => r.user_id as string);
    // Only delete accounts that don't belong to any other gym.
    await q(
      `delete from users u where (u.id = any($1) or lower(u.email) = any($2))
         and not exists (select 1 from gym_staff s where s.user_id = u.id)
         and not exists (select 1 from members m where m.user_id = u.id)`,
      [userIds, [OWNER_EMAIL, TRAINER_EMAIL, MEMBER_EMAIL]],
    );
  } else {
    await q(
      `delete from users u where lower(u.email) = any($1)
         and not exists (select 1 from gym_staff s where s.user_id = u.id)
         and not exists (select 1 from members m where m.user_id = u.id)`,
      [[OWNER_EMAIL, TRAINER_EMAIL, MEMBER_EMAIL]],
    );
  }

  /* ----- 2. gym, owner, settings, trainer, plans */
  const reg = await registerGymOwner(
    registerSchema.parse({
      fullName: opts.owner,
      email: OWNER_EMAIL,
      phone: "9000000001",
      password: opts.password,
      gymName: opts.name,
      city: "Kochi",
      accessCode: process.env.SIGNUP_ACCESS_CODE ?? null,
    }),
    meta,
  );
  let owner = await contextFor(reg.token!);
  const gymId = owner.gym.id;
  // Flag it first, so a failed run is still cleaned up next time.
  await q(`update gyms set settings = settings || '{"demo": true}'::jsonb where id = $1`, [gymId]);

  await inGym(owner, (tx) =>
    updateGymProfile(
      tx,
      owner,
      gymProfileSchema.parse({
        name: opts.name,
        phone: "9000000001",
        email: OWNER_EMAIL,
        addressLine: "2nd Floor, Metro Pillar 512, NH 66",
        city: "Kochi",
        state: "Kerala",
        pincode: "682024",
        gstin: null,
        receiptPrefix: "DEMO",
      }),
    ),
  );
  await inGym(owner, (tx) =>
    updateGymSettings(
      tx,
      owner,
      gymSettingsSchema.parse({
        expiringSoonDays: 7,
        sessionMinutes: 90,
        openingHours: "Mon–Sat 5:00–22:00 · Sun 6:00–11:00",
        availableEquipment: EQUIPMENT_OPTIONS.filter((e) => e !== "other"),
      }),
    ),
  );
  owner = await contextFor(reg.token!);

  const invite = await inGym(owner, (tx) =>
    inviteStaff(tx, owner, staffInviteSchema.parse({ fullName: "Vishnu Prasad", email: TRAINER_EMAIL, phone: "9000000002", role: "trainer", specializations: ["Strength", "Weight loss", "Mobility"] })),
  );
  const trainerSession = await acceptInvite({ token: invite.inviteUrl.split("/").pop()!, password: opts.password }, null, meta);
  const trainer = await contextFor(trainerSession.token!);

  const plans = {} as Record<PlanKey, string>;
  for (const key of Object.keys(PLANS) as PlanKey[]) {
    const p = PLANS[key];
    const row = await inGym(owner, (tx) =>
      createPlan(tx, owner, planSchema.parse({ name: p.name, description: null, durationUnit: "months", durationValue: p.months, price: p.price, admissionFee: p.admission, isActive: true })),
    );
    plans[key] = row.id;
  }

  /* ----- 3. people */
  type Person = {
    i: number;
    name: string;
    gender: "male" | "female";
    phone: string;
    plan: PlanKey;
    joinedOn: string;
    kind: "existing" | "new" | "enquiry";
    churnAfter: string | null;
    deactivate: boolean;
    freeze: boolean;
    fading: boolean;
    perWeek: number;
    slot: "morning" | "evening" | "midday";
    trainer: boolean;
    id?: string;
  };
  const used = new Set<string>();
  const people: Person[] = [];
  for (let i = 0; i < 100; i++) {
    const gender = chance(0.64) ? "male" : "female";
    let name = "";
    do name = `${pick(gender === "male" ? MALE : FEMALE)} ${pick(SURNAMES)}`;
    while (used.has(name));
    used.add(name);
    const kind = i < 60 ? "existing" : i < 96 ? "new" : "enquiry";
    const plan = weighted<PlanKey>([["monthly", 45], ["quarterly", 22], ["half", 10], ["annual", 8], ["student", 15]]);
    const joinedOn = kind === "existing" ? addDays(windowStart, -int(20, 400)) : kind === "new" ? addDays(windowStart, int(1, DAYS - 1)) : addDays(today, -int(0, 12));
    const churn = (kind === "existing" && i % 6 === 0) || (kind === "new" && i % 9 === 0);
    people.push({
      i,
      name,
      gender,
      phone: `90000${String(10001 + i)}`,
      plan,
      joinedOn,
      kind,
      churnAfter: churn ? addDays(windowStart, int(0, DAYS - 20)) : null,
      deactivate: kind === "existing" && (i === 6 || i === 36),
      freeze: kind === "existing" && (i === 10 || i === 25 || i === 47),
      fading: kind === "existing" && [3, 14, 21, 29, 41, 53].includes(i),
      perWeek: weighted([[2, 15], [3, 30], [4, 25], [5, 20], [6, 10]]),
      slot: weighted([["morning", 55], ["evening", 40], ["midday", 5]]),
      trainer: i % 5 !== 4 && kind !== "enquiry" && people.filter((p) => p.trainer).length < 40,
    });
  }
  // The member whose app is shown in demos: coached, regular, with a plan.
  const demoMember = people.find((p) => p.kind === "new" && p.gender === "female" && p.plan === "quarterly" && !p.churnAfter) ?? people[70]!;
  Object.assign(demoMember, { trainer: true, perWeek: 4, slot: "morning", joinedOn: addDays(windowStart, 8) });

  // Members are created oldest first, so member codes follow join order.
  for (const p of [...people].sort((a, b) => (a.joinedOn < b.joinedOn ? -1 : 1))) {
    const age = int(18, 52);
    const row = await inGym(owner, (tx) =>
      createMember(
        tx,
        owner,
        memberCreateSchema.parse({
          fullName: p.name,
          phone: p.phone,
          email: p === demoMember ? MEMBER_EMAIL : null,
          gender: p.gender,
          dateOfBirth: addDays(today, -(age * 365 + int(0, 364))),
          address: `${pick(AREAS)}, Kochi`,
          emergencyContactName: chance(0.5) ? `${pick(p.gender === "male" ? FEMALE : MALE)} ${p.name.split(" ").pop()}` : null,
          emergencyContactPhone: null,
          notes: p.fading ? "Hasn't been coming lately — call to check in." : chance(0.08) ? pick(["Prefers the morning slot.", "Interested in personal training.", "Referred by a friend."]) : null,
          joinedOn: p.joinedOn,
          assignedTrainerId: p.trainer ? trainer.staffId : null,
        }),
      ),
    );
    p.id = row.id;
  }
  // The demo member gets an app login, so the member app can be shown too.
  const memberInvite = await inGym(owner, (tx) => createMemberInvite(tx, owner, demoMember.id!));
  await acceptInvite({ token: memberInvite.inviteUrl.split("/").pop()!, password: opts.password }, null, meta);

  /* ----- 4. memberships and payments, in date order (receipts stay sequential) */
  type Event = { date: string; run: () => Promise<void> };
  const events: Event[] = [];
  const methods: ["upi" | "cash" | "card", number][] = [["upi", 60], ["cash", 32], ["card", 8]];
  for (const p of people) {
    if (p.kind === "enquiry") continue;
    const durMonths = PLANS[p.plan].months;
    let start = p.joinedOn;
    let first = true;
    for (;;) {
      const end = periodEnd(start, "months", durMonths);
      const saleStart = start;
      const isFirst = first;
      const total = PRICE_PAISE(p.plan) + (isFirst ? ADMISSION_PAISE(p.plan) : 0);
      const discount = durMonths >= 3 && chance(0.15) ? pick([20000, 30000, 50000]) : 0;
      const due = total - discount;
      const partial = chance(0.12);
      const firstPay = partial ? Math.max(50000, Math.round((due * (0.5 + rand() * 0.2)) / 10000) * 10000) : due;
      const payDate = isFirst ? saleStart : addDays(saleStart, -int(0, 2)) > today ? today : addDays(saleStart, -int(0, 2));
      const method = weighted(methods);
      const holder: { membershipId?: string } = {};
      events.push({
        date: payDate,
        run: async () => {
          const sale = await inGym(owner, (tx) =>
            sellMembership(
              tx,
              owner,
              sellMembershipSchema.parse({
                memberId: p.id,
                planId: plans[p.plan],
                startDate: saleStart,
                chargeAdmission: isFirst && ADMISSION_PAISE(p.plan) > 0,
                discountType: "amount",
                discountValue: discount ? String(discount / 100) : null,
                discountNote: discount ? pick(["Festival offer", "Referral discount", "Couple discount"]) : null,
                payNow: false,
              }),
            ),
          );
          holder.membershipId = sale.membership.id;
          await inGym(owner, (tx) =>
            recordPayment(
              tx,
              owner,
              recordPaymentSchema.parse({
                memberId: p.id,
                membershipId: sale.membership.id,
                amount: String(firstPay / 100),
                method,
                reference: method === "upi" ? `UPI${int(100000000, 999999999)}` : null,
                notes: null,
                paidOn: payDate,
              }),
            ),
          );
        },
      });
      // Most balances are settled a week or two later; recent ones stay due.
      const settleOn = addDays(saleStart, int(6, 16));
      if (partial && settleOn <= today && chance(0.6)) {
        events.push({
          date: settleOn,
          run: async () => {
            await inGym(owner, (tx) =>
              recordPayment(
                tx,
                owner,
                recordPaymentSchema.parse({ memberId: p.id, membershipId: holder.membershipId, amount: String((due - firstPay) / 100), method: weighted(methods), reference: null, notes: "Balance", paidOn: settleOn }),
              ),
            );
          },
        });
      }
      first = false;
      if (end >= today) break;
      if (p.churnAfter && end >= p.churnAfter) break;
      const next = addDays(end, 1 + (chance(0.35) ? int(1, 5) : 0));
      if (next > today) break;
      start = next;
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const e of events) await e.run();

  // Freezes on a few current memberships, and two members who left.
  const freezeReasons = ["Travelling to Dubai for work", "Recovering from a minor surgery", "University exams"];
  for (const p of people.filter((x) => x.freeze)) {
    const cur = await q(`select id, start_date::text as s from memberships where member_id = $1 and start_date <= $2 and end_date >= $2 order by start_date desc limit 1`, [p.id, today]);
    if (!cur.rows[0]) continue;
    const from = [addDays(today, -int(4, 18)), cur.rows[0].s as string].sort().pop()!;
    await inGym(owner, (tx) => freezeMembership(tx, owner, cur.rows[0].id, freezeSchema.parse({ startDate: from, reason: freezeReasons.shift() })));
  }
  for (const p of people.filter((x) => x.deactivate)) {
    await inGym(owner, (tx) => setMemberStatus(tx, owner, p.id!, "inactive"));
    await q(`update members set notes = 'Moved to Bengaluru for work.' where id = $1`, [p.id]);
  }

  /* ----- 5. check-ins over the last 60 days */
  const ms = await q(`select member_id, start_date::text as s, end_date::text as e, frozen_since::text as f from memberships where gym_id = $1 and state = 'active'`, [gymId]);
  const periods = new Map<string, { s: string; e: string; f: string | null }[]>();
  for (const r of ms.rows) periods.set(r.member_id, [...(periods.get(r.member_id) ?? []), { s: r.s, e: r.e, f: r.f }]);
  const ownerUserId = owner.user.id;
  const now = new Date();
  const visits: unknown[][] = [];
  const visitDays = new Map<string, string[]>();
  const at = (date: string, minutes: number) => new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+05:30`);
  for (const p of people) {
    if (p.kind === "enquiry") continue;
    const lastFading = p.fading ? addDays(today, -int(16, 30)) : null;
    for (let d = windowStart; d <= today; d = addDays(d, 1)) {
      const valid = (periods.get(p.id!) ?? []).some((x) => x.s <= d && d <= x.e && !(x.f && d >= x.f));
      if (!valid || (lastFading && d > lastFading)) continue;
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
      let prob = p.perWeek / 6.3;
      if (weekday === 0) prob *= 0.35;
      if (diffDays(p.joinedOn, d) < 21 && p.kind === "new") prob *= 1.15;
      if (p.churnAfter && d >= addDays(p.churnAfter, -21)) prob *= 0.5;
      if (!chance(Math.min(prob, 0.95))) continue;
      const base = weekday === 0 ? 7 * 60 : p.slot === "morning" ? 6 * 60 + 20 : p.slot === "evening" ? 18 * 60 + 15 : 11 * 60 + 30;
      const minutes = Math.max(weekday === 0 ? 6 * 60 + 5 : 5 * 60 + 5, Math.min(21 * 60 + 15, base + int(-70, 110)));
      const inAt = at(d, minutes);
      if (inAt > now) continue;
      const stay = int(45, 110);
      const outAt = new Date(inAt.getTime() + stay * 60_000);
      visits.push([gymId, p.id, inAt, d, chance(0.7) && outAt < now ? outAt : null, chance(0.86) ? "qr" : "manual", ownerUserId]);
      visitDays.set(p.id!, [...(visitDays.get(p.id!) ?? []), d]);
    }
  }
  for (let i = 0; i < visits.length; i += 500) {
    const chunk = visits.slice(i, i + 500);
    const values = chunk.map((_, j) => `($${j * 7 + 1}, $${j * 7 + 2}, $${j * 7 + 3}, $${j * 7 + 4}, $${j * 7 + 5}, $${j * 7 + 6}, $${j * 7 + 7})`).join(",");
    await q(`insert into attendance (gym_id, member_id, check_in_at, check_in_date, check_out_at, method, recorded_by_user_id) values ${values}`, chunk.flat());
  }

  /* ----- 6. fitness profiles, workout plans, logs and weigh-ins */
  const goals = ["weight_loss", "muscle_gain", "general_fitness", "strength", "body_recomposition", "endurance"] as const;
  const coached = [demoMember, ...people.filter((p) => p !== demoMember && p.trainer && !p.deactivate && !p.churnAfter)];
  const withPlans = coached.slice(0, 25);
  const pending = coached.slice(25, 28);
  const goalOf = new Map<string, (typeof goals)[number]>();
  for (const p of [...withPlans, ...pending]) {
    const goal = pick(goals);
    goalOf.set(p.id!, goal);
    const tags = p.i % 11 === 0 ? ["knee"] : p.i % 13 === 0 ? ["lower_back"] : [];
    await inGym(trainer, (tx) =>
      updateFitnessProfile(
        tx,
        trainer,
        p.id!,
        fitnessProfileSchema.parse({
          fitnessGoal: goal,
          experienceLevel: weighted([["beginner", 55], ["intermediate", 35], ["advanced", 10]]),
          trainingDaysPerWeek: Math.min(6, Math.max(3, p.perWeek)),
          sessionMinutes: pick([45, 60, 60, 75]),
          exercisePreferences: chance(0.3) ? pick(["Likes free weights", "Prefers machines", "Enjoys cardio"]) : null,
          limitations: tags.length ? (tags[0] === "knee" ? "Old knee injury from football" : "Occasional lower back stiffness") : null,
          limitationTags: tags,
        }),
      ),
    );
    const answers = { heartCondition: false, chestPain: false, dizziness: false, boneOrJointProblem: tags.length > 0, bloodPressureMedication: false, pregnant: false, otherReason: false };
    await inGym(trainer, (tx) => saveHealthScreening(tx, trainer, p.id!, answers));
    if (tags.length) await inGym(trainer, (tx) => recordClearance(tx, trainer, p.id!, "Doctor's note seen; avoid heavy loading of the affected joint."));
  }
  const planDates = new Map<string, string>();
  for (const p of withPlans) {
    const g = await generatePlan(trainer, { memberId: p.id!, mode: "template", instructions: null });
    await inGym(trainer, (tx) => approvePlan(tx, trainer, g.planId, { acknowledgeWarnings: true }));
    const approved = p === demoMember ? addDays(p.joinedOn, 3) : [addDays(today, -int(10, 45)), p.joinedOn].sort().pop()!;
    planDates.set(p.id!, approved);
    const ts = at(approved, 19 * 60 + int(0, 120));
    await q(`update workout_plans set created_at = $2, updated_at = $2, approved_at = $2 where id = $1`, [g.planId, ts]);
    await q(`update workout_plan_versions set created_at = $2 where plan_id = $1`, [g.planId, ts]);
  }
  for (const p of pending) await generatePlan(trainer, { memberId: p.id!, mode: "template", instructions: null });

  // Workout logs on gym days after the plan was approved.
  const planRows = await q(
    `select p.id, p.member_id, v.content from workout_plans p join workout_plan_versions v on v.plan_id = p.id and v.version = p.current_version
     where p.gym_id = $1 and p.status = 'active'`,
    [gymId],
  );
  const logs: unknown[][] = [];
  for (const r of planRows.rows) {
    const days = (r.content.days ?? []) as { key: string; exercises: { exerciseId: string; reps: string }[] }[];
    if (!days.length) continue;
    let next = 0;
    for (const d of visitDays.get(r.member_id) ?? []) {
      if (d < (planDates.get(r.member_id) ?? today) || !chance(0.75)) continue;
      const day = days[next++ % days.length]!;
      const entries = day.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        done: chance(0.88),
        weightKg: /s|sec|min/i.test(e.reps) || chance(0.35) ? null : pick([5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50]),
      }));
      logs.push([gymId, r.member_id, r.id, 1, day.key, d, JSON.stringify(entries), entries.filter((e) => e.done).length, entries.length, int(2, 4), chance(0.15) ? pick(["Felt strong today", "Short on time", "Shoulder a bit tight", "New personal best!"]) : null]);
    }
  }
  for (let i = 0; i < logs.length; i += 300) {
    const chunk = logs.slice(i, i + 300);
    const values = chunk.map((_, j) => `(${Array.from({ length: 11 }, (__, k) => `$${j * 11 + k + 1}`).join(", ")})`).join(",");
    await q(
      `insert into workout_logs (gym_id, member_id, plan_id, plan_version, day_key, performed_on, entries, completed_exercises, total_exercises, difficulty, notes) values ${values}`,
      chunk.flat(),
    );
  }

  // Weigh-ins every two weeks for coached members.
  const progress: unknown[][] = [];
  for (const p of coached) {
    const goal = goalOf.get(p.id!) ?? "general_fitness";
    let weight = p.gender === "male" ? int(62, 96) : int(48, 80);
    const trend = goal === "weight_loss" ? -0.6 : goal === "muscle_gain" ? 0.35 : goal === "body_recomposition" ? -0.25 : -0.1;
    let waist = p.gender === "male" ? int(80, 102) : int(68, 92);
    for (let d = [windowStart, p.joinedOn].sort().pop()!; d <= today; d = addDays(d, 14)) {
      progress.push([gymId, p.id, d, (weight + (rand() - 0.5) * 0.6).toFixed(1), chance(0.5) ? JSON.stringify({ waistCm: Math.round(waist) }) : null, trainer.user.id]);
      weight += trend + (rand() - 0.5) * 0.3;
      waist += trend * 0.6;
    }
  }
  for (let i = 0; i < progress.length; i += 300) {
    const chunk = progress.slice(i, i + 300);
    const values = chunk.map((_, j) => `($${j * 6 + 1}, $${j * 6 + 2}, $${j * 6 + 3}, $${j * 6 + 4}, $${j * 6 + 5}, $${j * 6 + 6})`).join(",");
    await q(`insert into progress_entries (gym_id, member_id, recorded_on, weight_kg, measurements, recorded_by_user_id) values ${values}`, chunk.flat());
  }

  /* ----- 7. tidy timestamps, notifications and sessions */
  await q(`update members set created_at = (joined_on + time '10:00' + (random() * interval '8 hours')) at time zone $2 where gym_id = $1`, [gymId, TZ]);
  await q(`update memberships set created_at = (start_date + time '09:00' + (random() * interval '10 hours')) at time zone $2 where gym_id = $1`, [gymId, TZ]);
  // Keep only the latest few notifications unread.
  await q(
    `update notifications set read_at = now() where gym_id = $1 and id not in (select id from notifications where gym_id = $1 order by created_at desc limit 4)`,
    [gymId],
  );
  await q(`delete from sessions where user_id in (select user_id from gym_staff where gym_id = $1 union select user_id from members where gym_id = $1 and user_id is not null)`, [gymId]);

  const counts = await q(
    `select (select count(*) from members where gym_id = $1)::int as members,
            (select count(*) from memberships where gym_id = $1)::int as memberships,
            (select count(*) from payments where gym_id = $1)::int as payments,
            (select count(*) from attendance where gym_id = $1)::int as checkins,
            (select count(*) from workout_plans where gym_id = $1)::int as plans,
            (select count(*) from workout_logs where gym_id = $1)::int as logs,
            (select count(*) from progress_entries where gym_id = $1)::int as weighins`,
    [gymId],
  );
  const c = counts.rows[0];
  return {
    gymId,
    replaced: oldIds.length > 0,
    name: opts.name,
    today,
    days: DAYS,
    demoMemberName: demoMember.name,
    logins: { owner: OWNER_EMAIL, trainer: TRAINER_EMAIL, member: MEMBER_EMAIL },
    counts: c as Record<"members" | "memberships" | "payments" | "checkins" | "plans" | "logs" | "weighins", number>,
  };
  } finally {
    await admin.end();
  }
}
