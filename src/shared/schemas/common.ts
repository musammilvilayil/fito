import { z } from "zod";
import { isISODate } from "../dates";
import { normalizePhone } from "../phone";
import { rupeesToPaise } from "../money";

/** Trims and turns empty strings into undefined so optional fields behave. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

export const phoneField = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 98470 12345" });
      return z.NEVER;
    }
    return p;
  });

export const optionalPhoneField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 98470 12345" });
      return z.NEVER;
    }
    return p;
  });

export const optionalEmailField = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!z.email().safeParse(v).success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
      return z.NEVER;
    }
    return v;
  });

export const isoDate = z.string().refine(isISODate, "Enter a valid date");
export const optionalIsoDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), "Enter a valid date");

/** Accepts rupees as typed ("1,500.50") or a number, returns paise. */
export const rupeesField = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const paise = rupeesToPaise(typeof v === "number" ? v : v.trim() === "" ? "0" : v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be an amount like 1500 or 1500.50` });
      return z.NEVER;
    }
    return paise;
  });

export const uuid = z.uuid("Invalid id");

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "Password is too long");

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
