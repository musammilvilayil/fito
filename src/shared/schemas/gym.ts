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

export const gymSettingsSchema = z.object({
  expiringSoonDays: z.coerce.number().int().min(1).max(60),
  sessionMinutes: z.coerce.number().int().min(15).max(480),
  openingHours: optionalText(200),
  availableEquipment: z.array(z.enum(EQUIPMENT_OPTIONS)).default([]),
  /** Let people find this gym in the app and join it themselves. */
  allowMemberSignup: z.boolean().default(true),
});
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
