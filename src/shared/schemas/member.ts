import { z } from "zod";
import { MEMBER_STANDINGS } from "../membership";
import {
  isoDate,
  optionalEmailField,
  optionalIsoDate,
  optionalPhoneField,
  optionalText,
  pagination,
  requiredText,
} from "./common";

export const GENDERS = ["male", "female", "other", "undisclosed"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  undisclosed: "Prefer not to say",
};

const optionalGender = z
  .enum(GENDERS)
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const memberFields = {
  fullName: requiredText("Name", 120),
  phone: optionalPhoneField,
  email: optionalEmailField,
  gender: optionalGender,
  dateOfBirth: optionalIsoDate,
  address: optionalText(300),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhoneField,
  notes: optionalText(2000),
};

export const memberCreateSchema = z.object({
  ...memberFields,
  joinedOn: optionalIsoDate,
  assignedTrainerId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
});
export type MemberCreateInput = z.input<typeof memberCreateSchema>;

export const memberUpdateSchema = memberCreateSchema.partial().extend({
  fullName: requiredText("Name", 120).optional(),
});
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;

export const memberStatusSchema = z.object({ status: z.enum(["active", "inactive"]) });

export const assignTrainerSchema = z.object({
  trainerId: z
    .string()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
});

export const MEMBER_FILTERS = ["all", ...MEMBER_STANDINGS] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export const memberListQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(MEMBER_FILTERS).default("all"),
  trainer: z.uuid().optional(),
});
export type MemberListQuery = z.output<typeof memberListQuery>;

/** One row of a CSV/Excel import, after column mapping (all values are text). */
export const importRowSchema = z.object({
  fullName: requiredText("Name", 120),
  phone: optionalPhoneField,
  email: optionalEmailField,
  gender: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      const g = v?.trim().toLowerCase();
      if (!g) return null;
      if (["m", "male"].includes(g)) return "male" as const;
      if (["f", "female"].includes(g)) return "female" as const;
      return "other" as const;
    }),
  dateOfBirth: optionalIsoDate,
  joinedOn: optionalIsoDate,
  notes: optionalText(2000),
  // Optional current membership (members who already paid offline)
  planName: optionalText(120),
  membershipStart: optionalIsoDate,
  membershipEnd: optionalIsoDate,
  amountPaid: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.trim() : null)),
});
export type ImportRow = z.input<typeof importRowSchema>;

export const importRequestSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(z.record(z.string(), z.unknown())).min(1, "The file has no rows").max(2000, "Import at most 2,000 rows at a time"),
});

export const IMPORT_COLUMNS: { key: keyof ImportRow; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "fullName", label: "Name", required: true, aliases: ["name", "full name", "member name", "member"] },
  { key: "phone", label: "Phone", aliases: ["phone", "mobile", "mobile number", "phone number", "contact", "whatsapp"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail"] },
  { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
  { key: "dateOfBirth", label: "Date of birth", aliases: ["dob", "date of birth", "birthday", "birth date"] },
  { key: "joinedOn", label: "Joined on", aliases: ["joined", "joined on", "joining date", "date of joining", "doj", "admission date"] },
  { key: "planName", label: "Plan", aliases: ["plan", "package", "membership", "membership plan"] },
  { key: "membershipStart", label: "Membership start", aliases: ["start", "start date", "membership start", "from"] },
  { key: "membershipEnd", label: "Membership end", aliases: ["end", "end date", "expiry", "expiry date", "valid till", "valid until", "membership end", "to"] },
  { key: "amountPaid", label: "Amount paid", aliases: ["amount", "amount paid", "paid", "fee", "fees"] },
  { key: "notes", label: "Notes", aliases: ["notes", "remarks", "comment", "comments"] },
];

export { isoDate };
