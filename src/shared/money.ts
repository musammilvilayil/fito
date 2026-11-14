/** Money is handled as integer paise everywhere; these helpers convert at the edges. */

/** Parses a rupee amount typed by a user ("1,500", "1500.50") into paise. */
export function rupeesToPaise(input: string | number): number | null {
  const text = typeof input === "number" ? String(input) : input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** 150000 -> "₹1,500" (paise shown only when non-zero): Indian digit grouping. */
export function formatINR(paise: number, opts: { symbol?: boolean; alwaysPaise?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  const decimals = rem !== 0 || opts.alwaysPaise ? `.${String(rem).padStart(2, "0")}` : "";
  const symbol = opts.symbol === false ? "" : "₹";
  return `${negative ? "-" : ""}${symbol}${grouped}${decimals}`;
}

/** Applies a percentage discount (0-100) to an amount in paise, rounded to the nearest paisa. */
export function percentOf(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100);
}

/** Compact rupee labels for chart axes: 1250000 paise -> "12.5K", 1 lakh -> "1L", 1 crore -> "1Cr". */
export function compactRupees(paise: number): string {
  const r = paise / 100;
  const sign = r < 0 ? "-" : "";
  const a = Math.abs(r);
  if (a >= 1_00_00_000) return `${sign}${(a / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (a >= 1_00_000) return `${sign}${(a / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}${Math.round(a)}`;
}
