import type { ISODate } from "./dates";

/** Monday = 0 … Sunday = 6, matching WEEKDAYS in the plan schema. */
export function weekdayIndex(date: ISODate): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

type DayLike = { key: string; weekday?: number | null };
type LogLike = { dayKey: string; performedOn: ISODate; planId: string };

/**
 * Which plan day the member should do today:
 * 1. a day scheduled for today's weekday;
 * 2. otherwise the day already logged today (so it shows as done);
 * 3. for weekday plans, the next scheduled day (today is a rest day);
 * 4. otherwise the day after the one they did last (simple rotation);
 * 5. otherwise the first day.
 */
export function suggestDay<D extends DayLike>(days: D[], today: ISODate, logs: LogLike[], planId: string): D | null {
  if (days.length === 0) return null;
  const todayIdx = weekdayIndex(today);
  const scheduled = days.find((d) => d.weekday === todayIdx);
  if (scheduled) return scheduled;
  const mine = logs.filter((l) => l.planId === planId).sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1));
  const doneToday = mine.find((l) => l.performedOn === today);
  if (doneToday) return days.find((d) => d.key === doneToday.dayKey) ?? days[0]!;
  // Weekday plans: the next scheduled day (today is a rest day).
  const withDays = days.filter((d) => d.weekday !== null && d.weekday !== undefined);
  if (withDays.length > 0) {
    return withDays.reduce((best, d) => ((d.weekday! - todayIdx + 7) % 7 < (best.weekday! - todayIdx + 7) % 7 ? d : best));
  }
  const last = mine[0];
  if (last) {
    const i = days.findIndex((d) => d.key === last.dayKey);
    if (i >= 0) return days[(i + 1) % days.length]!;
  }
  return days[0]!;
}

/** True when the day is meant for today (scheduled today, or the plan isn't tied to weekdays). */
export function isForToday(day: DayLike, today: ISODate): boolean {
  return day.weekday === null || day.weekday === undefined || day.weekday === weekdayIndex(today);
}
