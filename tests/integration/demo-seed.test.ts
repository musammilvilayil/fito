import { beforeAll, describe, expect, it } from "vitest";
import { inGym, type GymContext } from "@/server/auth/context";
import { login } from "@/server/modules/auth/service";
import { createMember } from "@/server/modules/members/service";
import { duesTotal } from "@/server/modules/payments/service";
import { getMemberOverview } from "@/server/modules/reports/dashboard";
import { activePlanFor } from "@/server/modules/workouts/service";
import { MEMBER_EMAIL, OWNER_EMAIL, seedDemo } from "../../scripts/demo-seed";
import { adminPool, contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const opts = () => ({ name: "Test Demo Gym", owner: "Arun Kumar", password: "demo1234", adminUrl: process.env.TEST_DATABASE_ADMIN_URL! });
const q = (text: string, params: unknown[] = []) => adminPool().query(text, params);

describe("demo data seed", () => {
  let first: Awaited<ReturnType<typeof seedDemo>>;
  let realGym: GymContext;
  let owner: GymContext;

  beforeAll(async () => {
    await resetDb();
    realGym = (await newGym("Real Customer Gym")).ctx;
    await inGym(realGym, (tx) =>
      createMember(tx, realGym, { fullName: "Real Person", phone: uniquePhone(), email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null }),
    );
    first = await seedDemo(opts());
    owner = await contextFor((await login({ identifier: OWNER_EMAIL, password: "demo1234" }, meta)).token);
  }, 120_000);

  it("creates one flagged demo gym with an owner, a trainer and 100 members", async () => {
    expect(first.counts.members).toBe(100);
    expect(owner.gym.id).toBe(first.gymId);
    expect(owner.gym.settings.demo).toBe(true);
    const staff = await q(`select role from gym_staff where gym_id = $1 order by role`, [first.gymId]);
    expect(staff.rows.map((r) => r.role)).toEqual(["owner", "trainer"]);
    expect(first.counts.memberships).toBeGreaterThan(150);
    expect(first.counts.checkins).toBeGreaterThan(1500);
    expect(first.counts.plans).toBe(28);
  });

  it("leaves a realistic mix of members, dues and plans", async () => {
    const o = await inGym(owner, (tx) => getMemberOverview(tx, owner));
    expect(o.active).toBeGreaterThanOrEqual(70);
    expect(o.expiring).toBeGreaterThan(0);
    expect(o.expired).toBeGreaterThan(0);
    expect(o.noMembership).toBeGreaterThan(0);
    const statuses = await q(`select status, count(*)::int as n from members where gym_id = $1 group by status`, [first.gymId]);
    expect(statuses.rows.find((r) => r.status === "inactive")?.n).toBe(2);
    const frozen = await q(`select count(*)::int as n from memberships where gym_id = $1 and frozen_since is not null`, [first.gymId]);
    expect(frozen.rows[0].n).toBe(3);
    const dues = await inGym(owner, (tx) => duesTotal(tx, owner));
    expect(dues.outstanding).toBeGreaterThan(0);
    const plans = await q(`select status, count(*)::int as n from workout_plans where gym_id = $1 group by status`, [first.gymId]);
    expect(Object.fromEntries(plans.rows.map((r) => [r.status, r.n]))).toEqual({ active: 25, pending_review: 3 });
  });

  it("only records check-ins in the past, on days with a valid, unfrozen membership", async () => {
    const bad = await q(
      `select count(*)::int as n from attendance a
       where a.gym_id = $1 and (
         a.check_in_at > now()
         or (a.check_in_at at time zone 'Asia/Kolkata')::date <> a.check_in_date
         or (a.check_out_at is not null and a.check_out_at <= a.check_in_at)
         or not exists (
           select 1 from memberships m where m.member_id = a.member_id and m.state = 'active'
             and a.check_in_date between m.start_date and m.end_date
             and (m.frozen_since is null or a.check_in_date < m.frozen_since)))`,
      [first.gymId],
    );
    expect(bad.rows[0].n).toBe(0);
    const span = await q(`select min(check_in_date)::text as first, max(check_in_date)::text as last from attendance where gym_id = $1`, [first.gymId]);
    expect(span.rows[0].last).toBe(first.today);
  });

  it("numbers receipts per financial year, in payment order, without gaps", async () => {
    const rows = await q(`select receipt_number from payments where gym_id = $1 order by paid_at, created_at`, [first.gymId]);
    const byYear = new Map<string, number[]>();
    for (const r of rows.rows) {
      const [, year, seq] = /^DEMO\/(\d{4}-\d{2})\/(\d{4})$/.exec(r.receipt_number)!;
      byYear.set(year!, [...(byYear.get(year!) ?? []), Number(seq)]);
    }
    for (const seqs of byYear.values()) expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });

  it("gives the demo member an app login with a plan, workouts and weigh-ins", async () => {
    const session = await login({ identifier: MEMBER_EMAIL, password: "demo1234" }, meta);
    const member = await contextFor(session.token);
    expect(member.role).toBe("member");
    const plan = await inGym(member, (tx) => activePlanFor(tx, member, member.memberId!));
    expect(plan?.plan.status).toBe("active");
    const activity = await q(
      `select (select count(*) from workout_logs where member_id = $1)::int as logs, (select count(*) from progress_entries where member_id = $1)::int as weighins`,
      [member.memberId],
    );
    expect(activity.rows[0].logs).toBeGreaterThanOrEqual(5);
    expect(activity.rows[0].weighins).toBeGreaterThanOrEqual(2);
  });

  it("replaces itself when run again and never touches other gyms", async () => {
    const again = await seedDemo(opts());
    expect(again.replaced).toBe(true);
    expect(again.gymId).not.toBe(first.gymId);
    const demoGyms = await q(`select id from gyms where settings->>'demo' = 'true'`);
    expect(demoGyms.rows.map((r) => r.id)).toEqual([again.gymId]);
    const demoUsers = await q(`select count(*)::int as n from users where email like 'demo.%@example.com'`);
    expect(demoUsers.rows[0].n).toBe(3);
    const real = await q(`select count(*)::int as n from members where gym_id = $1`, [realGym.gym.id]);
    expect(real.rows[0].n).toBe(1);
  }, 120_000);
});
