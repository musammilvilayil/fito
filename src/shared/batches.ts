/** Training batches: many gyms run separate morning and evening batches. */
export const BATCHES = ["morning", "evening", "any"] as const;
export type Batch = (typeof BATCHES)[number];
export const BATCH_LABELS: Record<Batch, string> = { morning: "Morning", evening: "Evening", any: "Any time" };

export type BatchHours = { morning: { start: string; end: string }; evening: { start: string; end: string } };
export const DEFAULT_BATCH_HOURS: BatchHours = { morning: { start: "05:00", end: "11:00" }, evening: { start: "16:00", end: "22:00" } };

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** "HH:MM" now in a time zone. */
export function timeIn(timeZone: string, now: Date = new Date()): string {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}

/** Whether a member of `batch` is within their batch at `hhmm` ("any" always is). */
export function inBatch(batch: Batch, hhmm: string, hours: BatchHours = DEFAULT_BATCH_HOURS): boolean {
  if (batch === "any") return true;
  const t = minutesOf(hhmm);
  const { start, end } = hours[batch];
  return t >= minutesOf(start) && t < minutesOf(end);
}

/** "5:00–11:00 am" style label for a batch's hours. */
export function batchHoursLabel(batch: Exclude<Batch, "any">, hours: BatchHours = DEFAULT_BATCH_HOURS): string {
  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number) as [number, number];
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
  };
  return `${fmt(hours[batch].start)} – ${fmt(hours[batch].end)}`;
}

/** The gym's batch hours, falling back to the defaults for anything missing. */
export function batchHoursOf(settings: { batches?: Partial<BatchHours> | null }): BatchHours {
  const b = settings.batches;
  const pick = (k: keyof BatchHours) => ({
    start: b?.[k]?.start ?? DEFAULT_BATCH_HOURS[k].start,
    end: b?.[k]?.end ?? DEFAULT_BATCH_HOURS[k].end,
  });
  return { morning: pick("morning"), evening: pick("evening") };
}

/** What each batch policy means, for forms. */
export const BATCH_HINTS: Record<"off" | "warn" | "enforce", string> = {
  off: "Batches are only for your records; check-ins aren't checked.",
  warn: "Check-ins outside the batch are allowed, with a warning.",
  enforce: "Check-ins outside the batch are refused unless an owner or manager overrides.",
};
