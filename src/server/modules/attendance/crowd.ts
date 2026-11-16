import "server-only";
import { sql } from "drizzle-orm";
import { addDays } from "@/shared/dates";
import { batchHoursOf } from "@/shared/batches";
import type { GymContext } from "../../auth/context";
import type { Tx } from "../../db/tx";
import { gymToday } from "../members/service";
import { insideNow } from "./service";

export type CrowdLevel = "empty" | "quiet" | "moderate" | "busy" | "very_busy";
export const CROWD_LABELS: Record<CrowdLevel, string> = { empty: "Empty", quiet: "Quiet", moderate: "Moderate", busy: "Busy", very_busy: "Very busy" };

/**
 * How busy the gym is right now, and how busy it usually is through today.
 * Aggregates only (no names), so anyone in the gym, members included, may
 * see it. "Inside now" counts check-ins without a check-out from the last
 * typical visit length; exit-QR check-outs make it exact.
 */
export async function gymCrowd(tx: Tx, ctx: GymContext) {
  const tz = ctx.gym.timezone;
  const today = gymToday(ctx);
  const inside = await insideNow(tx, ctx);
  const capacity = ctx.gym.settings.crowdCapacity ?? 40;
  const ratio = inside / capacity;
  const level: CrowdLevel = inside === 0 ? "empty" : ratio < 0.3 ? "quiet" : ratio < 0.6 ? "moderate" : ratio < 0.85 ? "busy" : "very_busy";
  const hourNow = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }));

  // Same weekday over the last 8 weeks: average check-ins per hour.
  const since = addDays(today, -56);
  const typicalRows = (
    await tx.execute(sql`
      with days as (
        select distinct check_in_date from attendance
        where gym_id = ${ctx.gym.id} and check_in_date >= ${since}::date and check_in_date < ${today}::date
          and extract(dow from check_in_date) = extract(dow from ${today}::date)
      )
      select extract(hour from a.check_in_at at time zone ${tz})::int as hour,
             round(count(*)::numeric / greatest((select count(*) from days), 1), 1)::float as avg
      from attendance a
      where a.gym_id = ${ctx.gym.id} and a.check_in_date in (select check_in_date from days)
      group by 1 order by 1`)
  ).rows as { hour: number; avg: number }[];
  const todayRows = (
    await tx.execute(sql`
      select extract(hour from check_in_at at time zone ${tz})::int as hour, count(*)::int as n
      from attendance where gym_id = ${ctx.gym.id} and check_in_date = ${today}::date group by 1`)
  ).rows as { hour: number; n: number }[];

  const typical = new Map(typicalRows.map((r) => [r.hour, r.avg]));
  const sofar = new Map(todayRows.map((r) => [r.hour, r.n]));
  const hours = Array.from({ length: 19 }, (_, i) => i + 5); // 5 am – 11 pm
  const byHour = hours.map((h) => ({ hour: h, typical: typical.get(h) ?? 0, today: sofar.get(h) ?? 0 }));
  const busiest = [...byHour].sort((a, b) => b.typical - a.typical).filter((h) => h.typical > 0).slice(0, 2).map((h) => h.hour).sort((a, b) => a - b);
  // A quieter time later today, if there is one.
  const later = byHour.filter((h) => h.hour > hourNow && h.typical > 0);
  const quietLater = later.length ? later.reduce((best, h) => (h.typical < best.typical ? h : best)).hour : null;

  return { inside, capacity, level, hourNow, byHour, busiestHours: busiest, quietLater, batches: batchHoursOf(ctx.gym.settings), updatedAt: new Date().toISOString() };
}
export type GymCrowd = Awaited<ReturnType<typeof gymCrowd>>;
