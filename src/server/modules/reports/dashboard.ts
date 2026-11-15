import "server-only";
import { sql } from "drizzle-orm";
import { addDays } from "@/shared/dates";
import type { MemberStanding } from "@/shared/membership";
import { hasPermission, type GymContext } from "../../auth/context";
import type { Tx } from "../../db/tx";
import { gymToday, soonDays } from "../members/service";
import { currentMembershipJoin, standingExpr } from "../members/standing";

export type DashboardMember = {
  id: string;
  fullName: string;
  phone: string | null;
  memberCode: string;
  planName: string | null;
  validUntil: string | null;
  joinedOn: string;
  standing: MemberStanding;
};

function mapMember(r: Record<string, unknown>): DashboardMember {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    phone: r.phone as string | null,
    memberCode: r.member_code as string,
    planName: r.plan_name as string | null,
    validUntil: r.valid_until ? String(r.valid_until) : null,
    joinedOn: String(r.joined_on),
    standing: r.standing as MemberStanding,
  };
}

/** Member-related numbers for the dashboard. Trainers only see their own members. */
export async function getMemberOverview(tx: Tx, ctx: GymContext) {
  const today = gymToday(ctx);
  const soon = soonDays(ctx);
  const standing = standingExpr(today, soon);
  const scope = hasPermission(ctx, "members.view_all")
    ? sql`true`
    : sql`m.assigned_trainer_id = ${ctx.staffId ?? "00000000-0000-0000-0000-000000000000"}`;
  const monthStart = `${today.slice(0, 8)}01`;

  const counts = await tx.execute(sql`
    select ${standing} as standing, count(*)::int as n
    from members m ${currentMembershipJoin(today)}
    where m.gym_id = ${ctx.gym.id} and ${scope}
    group by 1`);
  const byStanding: Record<string, number> = {};
  for (const r of counts.rows as { standing: string; n: number }[]) byStanding[r.standing] = r.n;

  const [newThisMonth] = (
    await tx.execute(sql`select count(*)::int as n from members m where m.gym_id = ${ctx.gym.id} and ${scope} and m.joined_on >= ${monthStart}::date`)
  ).rows as { n: number }[];

  const expiring = await tx.execute(sql`
    select m.id, m.full_name, m.phone, m.member_code, m.joined_on, cm.plan_name, cm.valid_until, ${standing} as standing
    from members m ${currentMembershipJoin(today)}
    where m.gym_id = ${ctx.gym.id} and ${scope} and m.status = 'active'
      and (${standing} = 'expiring' or (${standing} = 'expired' and cm.end_date >= ${addDays(today, -14)}::date))
    order by cm.valid_until asc
    limit 8`);

  const recent = await tx.execute(sql`
    select m.id, m.full_name, m.phone, m.member_code, m.joined_on, cm.plan_name, cm.valid_until, ${standing} as standing
    from members m ${currentMembershipJoin(today)}
    where m.gym_id = ${ctx.gym.id} and ${scope}
    order by m.created_at desc
    limit 6`);

  const active = (byStanding.active ?? 0) + (byStanding.expiring ?? 0) + (byStanding.frozen ?? 0);
  return {
    today,
    soonDays: soon,
    total: Object.values(byStanding).reduce((a, b) => a + b, 0),
    active,
    expiring: byStanding.expiring ?? 0,
    expired: byStanding.expired ?? 0,
    noMembership: byStanding.none ?? 0,
    newThisMonth: newThisMonth?.n ?? 0,
    expiringList: (expiring.rows as Record<string, unknown>[]).map(mapMember),
    recentMembers: (recent.rows as Record<string, unknown>[]).map(mapMember),
  };
}
