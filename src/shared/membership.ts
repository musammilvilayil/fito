import { addDays, addMonths, diffDays, type ISODate } from "./dates";

/** A member's standing, derived from their memberships and today's date. */
export const MEMBER_STANDINGS = ["active", "expiring", "frozen", "upcoming", "expired", "none", "inactive"] as const;
export type MemberStanding = (typeof MEMBER_STANDINGS)[number];

export const STANDING_LABELS: Record<MemberStanding, string> = {
  active: "Active",
  expiring: "Expiring soon",
  frozen: "Frozen",
  upcoming: "Starts soon",
  expired: "Expired",
  none: "No membership",
  inactive: "Deactivated",
};

export const STANDING_TONES: Record<MemberStanding, "success" | "warning" | "info" | "neutral" | "danger" | "lime"> = {
  active: "success",
  expiring: "warning",
  frozen: "info",
  upcoming: "info",
  expired: "danger",
  none: "neutral",
  inactive: "neutral",
};

/** Standings that allow a check-in. */
export const CAN_CHECK_IN: ReadonlySet<MemberStanding> = new Set(["active", "expiring"]);

export type DurationUnit = "days" | "months";

/** Inclusive end date for a period starting on `start`: 1 month from 1 Jan ends 31 Jan. */
export function periodEnd(start: ISODate, unit: DurationUnit, value: number): ISODate {
  const exclusiveEnd = unit === "months" ? addMonths(start, value) : addDays(start, value);
  return addDays(exclusiveEnd, -1);
}

/**
 * Renewal start date. Early renewal (current membership still valid) starts
 * the day after it ends, so no days are lost. Late renewal starts today.
 */
export function renewalStart(currentValidUntil: ISODate | null, today: ISODate): ISODate {
  if (currentValidUntil && currentValidUntil >= today) return addDays(currentValidUntil, 1);
  return today;
}

export function daysLeft(validUntil: ISODate, today: ISODate): number {
  return diffDays(today, validUntil);
}

export function durationLabel(unit: DurationUnit, value: number): string {
  if (unit === "months") {
    if (value === 1) return "1 month";
    if (value === 12) return "1 year";
    if (value % 12 === 0) return `${value / 12} years`;
    return `${value} months`;
  }
  return value === 1 ? "1 day" : `${value} days`;
}
