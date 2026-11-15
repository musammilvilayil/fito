import { z } from "zod";
import { isoDate, optionalText } from "./common";

/** Text encoded in a member's QR code. Versioned so the format can change later. */
export const QR_PREFIX = "FITO1:";
export function qrPayload(token: string) {
  return `${QR_PREFIX}${token}`;
}
export function parseQrPayload(text: string): string | null {
  const t = text.trim();
  if (t.startsWith(QR_PREFIX)) return t.slice(QR_PREFIX.length) || null;
  // Also accept a bare token (e.g. typed or from a USB scanner without prefix)
  return /^[A-Za-z0-9_-]{20,40}$/.test(t) ? t : null;
}

export const checkInSchema = z
  .object({
    qr: z.string().trim().max(200).optional(),
    memberId: z.uuid().optional(),
    overrideReason: optionalText(200),
  })
  .refine((v) => v.qr || v.memberId, { message: "Scan a QR code or choose a member" });
export type CheckInInput = z.input<typeof checkInSchema>;

export const attendanceDayQuery = z.object({ date: isoDate.optional() });

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
