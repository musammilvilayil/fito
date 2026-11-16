import { z } from "zod";
import { STAFF_ROLES } from "../permissions";
import { optionalEmailField, optionalPhoneField, optionalText, requiredText } from "./common";

export const EQUIPMENT_OPTIONS = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "body only",
  "kettlebells",
  "bands",
  "e-z curl bar",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "other",
] as const;

export const gymProfileSchema = z.object({
  name: requiredText("Gym name", 120),
  phone: optionalPhoneField,
  email: optionalEmailField,
  addressLine: optionalText(300),
  city: optionalText(80),
  state: requiredText("State", 80),
  pincode: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{6}$/.test(v), "PIN code must be 6 digits"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9A-Z]{15}$/.test(v), "GSTIN must be 15 characters"),
  receiptPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "Use 1–6 letters or digits"),
});
export type GymProfileInput = z.input<typeof gymProfileSchema>;

const hhmm = (label: string) => z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: use 24-hour time like 05:30`);

export const gymSettingsSchema = z
  .object({
    expiringSoonDays: z.coerce.number().int().min(1).max(60),
    sessionMinutes: z.coerce.number().int().min(15).max(480),
    openingHours: optionalText(200),
    /** Set from the equipment list (Equipment page); only sent by older clients and tests. */
    availableEquipment: z.array(z.enum(EQUIPMENT_OPTIONS)).optional(),
    /** Let people find this gym in the app and join it themselves. */
    allowMemberSignup: z.boolean().default(true),
    morningStart: hhmm("Morning start").default("05:00"),
    morningEnd: hhmm("Morning end").default("11:00"),
    eveningStart: hhmm("Evening start").default("16:00"),
    eveningEnd: hhmm("Evening end").default("22:00"),
    /** off: ignore batches · warn: allow, but show it · enforce: refuse outside the batch (owners can override). */
    batchPolicy: z.enum(["off", "warn", "enforce"]).default("warn"),
    crowdCapacity: z.coerce.number().int().min(5, "At least 5").max(2000).default(40),
  })
  .refine((v) => v.morningStart < v.morningEnd, { message: "Morning batch must end after it starts", path: ["morningEnd"] })
  .refine((v) => v.eveningStart < v.eveningEnd, { message: "Evening batch must end after it starts", path: ["eveningEnd"] });
export type GymSettingsInput = z.input<typeof gymSettingsSchema>;

export const staffInviteSchema = z
  .object({
    fullName: requiredText("Name", 120),
    email: optionalEmailField,
    phone: optionalPhoneField,
    role: z.enum(STAFF_ROLES),
    specializations: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  })
  .refine((v) => v.email || v.phone, { message: "Enter a phone number or email", path: ["phone"] });
export type StaffInviteInput = z.input<typeof staffInviteSchema>;

export const staffUpdateSchema = z.object({
  fullName: requiredText("Name", 120).optional(),
  email: optionalEmailField,
  phone: optionalPhoneField,
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  specializations: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  bio: optionalText(1000),
});
export type StaffUpdateInput = z.input<typeof staffUpdateSchema>;
