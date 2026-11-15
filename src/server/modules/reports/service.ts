import "server-only";
import { sql } from "drizzle-orm";
import { addDays, addMonths, diffDays, type ISODate } from "@/shared/dates";
import { requirePermission, type GymContext } from "../../auth/context";
import type { Tx } from "../../db/tx";
import { badRequest } from "../../errors";
import { dailyCounts, hourlyCounts } from "../attendance/service";
import { gymToday, soonDays } from "../members/service";
import { currentMembershipJoin, standingExpr } from "../members/standing";
import { duesTotal } from "../payments/service";

/** Days after the old end date within which a new membership still counts as a renewal. */
export const RENEWAL_GRACE_DAYS = 30;

function monthKey(d: ISODate) {
  return d.slice(0, 7);
}

export async function getReport(tx: Tx, ctx: GymContext, range: { from?: ISODate; to?: ISODate }) {
  requirePermission(ctx, "reports.view");
  const today = gymToday(ctx);
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -29);
  if (to < from) throw badRequest("The end date is before the start date.");
  const tz = ctx.gym.timezone;
  const gymId = ctx.gym.id;

  // Members today
  const standing = standingExpr(today, soonDays(ctx));
  const standings = await tx.execute(sql`
    select ${standing} as standing, count(*)::int as n
    from members m ${currentMembershipJoin(today)}
    where m.gym_id = ${gymId} group by 1`);
  const by: Record<string, number> = {};
  for (const r of standings.rows as { standing: string; n: number }[]) by[r.standing] = r.n;

  const [newInRange] = (
    await tx.execute(sql`select count(*)::int as n from members where gym_id = ${gymId} and joined_on between ${from}::date and ${to}::date`)
  ).rows as { n: number }[];

  // Money in range
  const [money] = (
    await tx.execute(sql`
      select coalesce(sum(case when kind = 'payment' then amount_paise else 0 end), 0)::bigint as collected,
             coalesce(sum(case when kind = 'refund' then amount_paise else 0 end), 0)::bigint as refunded
      from payments
      where gym_id = ${gymId} and status = 'completed'
        and (paid_at at time zone ${tz})::date between ${from}::date and ${to}::date`)
  ).rows as { collected: string; refunded: string }[];

  // Last 12 months (ending with the month of `to`)
  const firstMonth = `${addMonths(`${monthKey(to)}-01`, -11)}`;
  const monthly = await tx.execute(sql`
    with months as (select generate_series(${firstMonth}::date, ${`${monthKey(to)}-01`}::date, interval '1 month')::date as m)
    select to_char(months.m, 'YYYY-MM') as month,
      coalesce((select sum(case when p.kind = 'payment' then p.amount_paise else -p.amount_paise end)
                from payments p where p.gym_id = ${gymId} and p.status = 'completed'
                  and date_trunc('month', (p.paid_at at time zone ${tz}))::date = months.m), 0)::bigint as revenue,
      (select count(*)::int from members x where x.gym_id = ${gymId} and date_trunc('month', x.joined_on)::date = months.m) as new_members
    from months order by months.m`);

  // Renewals: memberships whose period ended in the range (and has already ended)
  const renewalEnd = to < today ? to : addDays(today, -1);
  const [renewals] =
    renewalEnd >= from
      ? ((
          await tx.execute(sql`
            select count(*)::int as due,
              count(*) filter (where exists (
                select 1 from memberships n
                where n.member_id = ms.member_id and n.id <> ms.id and n.state = 'active'
                  and (n.renewed_from_id = ms.id or (n.start_date > ms.start_date and n.start_date <= ms.end_date + ${RENEWAL_GRACE_DAYS}::int))
              ))::int as renewed
            from memberships ms
            where ms.gym_id = ${gymId} and ms.state = 'active' and ms.end_date between ${from}::date and ${renewalEnd}::date`)
        ).rows as { due: number; renewed: number }[])
      : [{ due: 0, renewed: 0 }];

  const [visits] = (
    await tx.execute(sql`
      select count(*)::int as total, count(distinct member_id)::int as unique_members
      from attendance where gym_id = ${gymId} and check_in_date between ${from}::date and ${to}::date`)
  ).rows as { total: number; unique_members: number }[];

  const span = diffDays(from, to);
  const [daily, hourly, dues] = await Promise.all([
    span <= 92 ? dailyCounts(tx, ctx, from, to) : Promise.resolve(null),
    hourlyCounts(tx, ctx, from, to),
    duesTotal(tx, ctx),
  ]);

  return {
    from,
    to,
    today,
    members: {
      total: Object.values(by).reduce((a, b) => a + b, 0),
      active: (by.active ?? 0) + (by.expiring ?? 0) + (by.frozen ?? 0),
      expiring: by.expiring ?? 0,
      expired: by.expired ?? 0,
      noMembership: by.none ?? 0,
      newInRange: newInRange?.n ?? 0,
    },
    revenue: {
      collected: Number(money?.collected ?? 0),
      refunded: Number(money?.refunded ?? 0),
      net: Number(money?.collected ?? 0) - Number(money?.refunded ?? 0),
      outstanding: dues.outstanding,
      membersWithDues: dues.membersWithDues,
    },
    monthly: (monthly.rows as { month: string; revenue: string; new_members: number }[]).map((r) => ({
      month: r.month,
      revenue: Number(r.revenue),
      newMembers: r.new_members,
    })),
    renewals: {
      due: renewals?.due ?? 0,
      renewed: renewals?.renewed ?? 0,
      rate: renewals && renewals.due > 0 ? renewals.renewed / renewals.due : null,
      graceDays: RENEWAL_GRACE_DAYS,
    },
    attendance: { total: visits?.total ?? 0, uniqueMembers: visits?.unique_members ?? 0, daily, hourly },
  };
}
export type Report = Awaited<ReturnType<typeof getReport>>;
