import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { ISODate } from "@/shared/dates";

/**
 * SQL that derives each member's standing from their memberships.
 * Use with the members table aliased as `m`:
 *
 *   ... from members m ${currentMembershipJoin(today)} ...
 *   select ${standingExpr(today, soonDays)} as standing
 *
 * `cm` is the membership that matters today (current, else upcoming, else the
 * latest past one); `cm.valid_until` is the furthest end date across active
 * memberships, so a member who already renewed is not "expiring".
 */
export function currentMembershipJoin(today: ISODate): SQL {
  return sql`left join lateral (
    select ms.id, ms.plan_name, ms.start_date, ms.end_date, ms.frozen_since,
      (select max(x.end_date) from memberships x where x.member_id = m.id and x.state = 'active') as valid_until
    from memberships ms
    where ms.member_id = m.id and ms.state = 'active'
    order by (ms.start_date <= ${today}::date and ms.end_date >= ${today}::date) desc,
             (ms.start_date > ${today}::date) desc,
             ms.end_date desc
    limit 1
  ) cm on true`;
}

export function standingExpr(today: ISODate, soonDays: number): SQL {
  return sql`(case
    when m.status = 'inactive' then 'inactive'
    when cm.id is null then 'none'
    when cm.frozen_since is not null then 'frozen'
    when cm.start_date > ${today}::date then 'upcoming'
    when cm.end_date < ${today}::date then 'expired'
    when cm.valid_until - ${today}::date < ${soonDays} then 'expiring'
    else 'active'
  end)`;
}
