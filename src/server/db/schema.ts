/**
 * FITO database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 * - Every gym-owned table has a `gym_id` column. Row-level security (see
 *   db/migrations/*_rls.sql) limits the app's database role to rows of the gym
 *   selected for the current request, so a missing WHERE clause in app code
 *   cannot leak another gym's data.
 * - Money is stored as integer paise (bigint), never floating point.
 * - Calendar dates (membership start/end, attendance day) are `date` columns,
 *   handled as "YYYY-MM-DD" strings in the gym's local time zone.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ----------------------------------------------------------------- enums */

export const staffRole = pgEnum("staff_role", ["owner", "manager", "trainer", "receptionist"]);
export const staffStatus = pgEnum("staff_status", ["invited", "active", "disabled"]);
export const memberStatus = pgEnum("member_status", ["active", "inactive"]);
export const gender = pgEnum("gender", ["male", "female", "other", "undisclosed"]);
export const durationUnit = pgEnum("duration_unit", ["days", "months"]);
export const membershipKind = pgEnum("membership_kind", ["new", "renewal"]);
export const membershipState = pgEnum("membership_state", ["active", "cancelled"]);
export const paymentKind = pgEnum("payment_kind", ["payment", "refund"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "upi", "card", "bank_transfer", "online"]);
export const paymentStatus = pgEnum("payment_status", ["completed", "pending", "failed", "void"]);
export const attendanceMethod = pgEnum("attendance_method", ["qr", "manual"]);
export const planStatus = pgEnum("workout_plan_status", ["draft", "pending_review", "active", "rejected", "archived"]);
export const planSource = pgEnum("workout_plan_source", ["ai", "template", "manual"]);
export const aiStatus = pgEnum("ai_generation_status", ["succeeded", "failed", "invalid_output", "fallback", "blocked"]);

/* -------------------------------------------------------------- identity */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_key").on(t.phone),
    check("users_contact_present", sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    activeGymId: uuid("active_gym_id"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** One-time tokens for password resets created by gym staff (shared via WhatsApp). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/* ------------------------------------------------------------------ gyms */

export type GymSettings = {
  /** Days before expiry when a membership is shown as "expiring soon". */
  expiringSoonDays?: number;
  /** Typical session length, used to estimate who is still inside. */
  sessionMinutes?: number;
  /** Monthly cap on AI workout generations (cost control). */
  aiMonthlyLimit?: number;
  /** Equipment the gym has; AI and templates only use matching exercises. */
  availableEquipment?: string[];
  openingHours?: string | null;
};

export const gyms = pgTable(
  "gyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    phone: text("phone"),
    email: text("email"),
    addressLine: text("address_line"),
    city: text("city"),
    state: text("state").notNull().default("Kerala"),
    pincode: text("pincode"),
    gstin: text("gstin"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    receiptPrefix: text("receipt_prefix").notNull().default("RCPT"),
    settings: jsonb("settings").$type<GymSettings>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gyms_slug_key").on(t.slug)],
);

export const gymStaff = pgTable(
  "gym_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: staffRole("role").notNull(),
    status: staffStatus("status").notNull().default("invited"),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    specializations: text("specializations").array().notNull().default(sql`'{}'::text[]`),
    bio: text("bio"),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("gym_staff_gym_user_key").on(t.gymId, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("gym_staff_invite_key").on(t.inviteTokenHash).where(sql`${t.inviteTokenHash} is not null`),
    index("gym_staff_user_idx").on(t.userId),
  ],
);

export const counters = pgTable(
  "counters",
  {
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gymId, t.name] })],
);

/* --------------------------------------------------------------- members */

export type HealthScreening = {
  /** PAR-Q style answers; any "true" requires clearance before a plan. */
  heartCondition?: boolean;
  chestPain?: boolean;
  dizziness?: boolean;
  boneOrJointProblem?: boolean;
  bloodPressureMedication?: boolean;
  pregnant?: boolean;
  otherReason?: boolean;
  answeredAt?: string;
};

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    memberCode: text("member_code").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    gender: gender("gender"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    address: text("address"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    joinedOn: date("joined_on", { mode: "string" }).notNull().defaultNow(),
    status: memberStatus("status").notNull().default("active"),
    assignedTrainerId: uuid("assigned_trainer_id").references(() => gymStaff.id, { onDelete: "set null" }),
    notes: text("notes"),
    qrToken: text("qr_token").notNull(),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    // Fitness profile (inputs for workout generation)
    fitnessGoal: text("fitness_goal"),
    experienceLevel: text("experience_level"),
    trainingDaysPerWeek: integer("training_days_per_week"),
    sessionMinutes: integer("session_minutes"),
    exercisePreferences: text("exercise_preferences"),
    limitations: text("limitations"),
    limitationTags: text("limitation_tags").array().notNull().default(sql`'{}'::text[]`),
    healthScreening: jsonb("health_screening").$type<HealthScreening>(),
    medicalClearanceRequired: boolean("medical_clearance_required").notNull().default(false),
    medicalClearanceNote: text("medical_clearance_note"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("members_gym_code_key").on(t.gymId, t.memberCode),
    uniqueIndex("members_gym_phone_key").on(t.gymId, t.phone).where(sql`${t.phone} is not null`),
    uniqueIndex("members_gym_user_key").on(t.gymId, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("members_qr_token_key").on(t.qrToken),
    uniqueIndex("members_invite_key").on(t.inviteTokenHash).where(sql`${t.inviteTokenHash} is not null`),
    index("members_gym_status_idx").on(t.gymId, t.status),
    index("members_trainer_idx").on(t.assignedTrainerId),
    index("members_user_idx").on(t.userId),
  ],
);

/* ----------------------------------------------------------- memberships */

export const membershipPlans = pgTable(
  "membership_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationUnit: durationUnit("duration_unit").notNull(),
    durationValue: integer("duration_value").notNull(),
    pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
    admissionFeePaise: bigint("admission_fee_paise", { mode: "number" }).notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("membership_plans_gym_name_key").on(t.gymId, sql`lower(${t.name})`),
    check("membership_plans_price_nonneg", sql`${t.pricePaise} >= 0 and ${t.admissionFeePaise} >= 0`),
    check("membership_plans_duration_pos", sql`${t.durationValue} > 0`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => membershipPlans.id, { onDelete: "set null" }),
    planName: text("plan_name").notNull(),
    durationUnit: durationUnit("duration_unit").notNull(),
    durationValue: integer("duration_value").notNull(),
    kind: membershipKind("kind").notNull().default("new"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
    admissionFeePaise: bigint("admission_fee_paise", { mode: "number" }).notNull().default(0),
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    discountNote: text("discount_note"),
    state: membershipState("state").notNull().default("active"),
    frozenSince: date("frozen_since", { mode: "string" }),
    totalFrozenDays: integer("total_frozen_days").notNull().default(0),
    renewedFromId: uuid("renewed_from_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("memberships_gym_member_idx").on(t.gymId, t.memberId),
    index("memberships_gym_end_idx").on(t.gymId, t.endDate),
    check("memberships_dates", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "memberships_total",
      sql`${t.totalPaise} = ${t.pricePaise} + ${t.admissionFeePaise} - ${t.discountPaise} and ${t.totalPaise} >= 0 and ${t.discountPaise} >= 0`,
    ),
  ],
);

export const membershipFreezes = pgTable(
  "membership_freezes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("membership_freezes_open_key").on(t.membershipId).where(sql`${t.endDate} is null`),
    index("membership_freezes_gym_idx").on(t.gymId),
  ],
);

/* -------------------------------------------------------------- payments */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    refundOfId: uuid("refund_of_id"),
    kind: paymentKind("kind").notNull().default("payment"),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull().default("completed"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    reference: text("reference"),
    notes: text("notes"),
    receiptNumber: text("receipt_number"),
    gateway: text("gateway"),
    gatewayPaymentId: text("gateway_payment_id"),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_gym_receipt_key").on(t.gymId, t.receiptNumber).where(sql`${t.receiptNumber} is not null`),
    uniqueIndex("payments_gateway_key").on(t.gateway, t.gatewayPaymentId).where(sql`${t.gatewayPaymentId} is not null`),
    index("payments_gym_paid_idx").on(t.gymId, t.paidAt),
    index("payments_gym_member_idx").on(t.gymId, t.memberId),
    index("payments_membership_idx").on(t.membershipId),
    check("payments_amount_pos", sql`${t.amountPaise} > 0`),
  ],
);

/* ------------------------------------------------------------ attendance */

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull().defaultNow(),
    checkInDate: date("check_in_date", { mode: "string" }).notNull(),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    method: attendanceMethod("method").notNull(),
    overrideReason: text("override_reason"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    // One check-in per member per gym-local day prevents duplicate scans.
    uniqueIndex("attendance_member_day_key").on(t.gymId, t.memberId, t.checkInDate),
    index("attendance_gym_day_idx").on(t.gymId, t.checkInDate),
  ],
);

/* -------------------------------------------------------------- workouts */

export const exercises = pgTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    /** NULL = global library row (read-only for gyms); set = gym's own exercise. */
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    equipment: text("equipment").notNull(),
    level: text("level").notNull(),
    mechanic: text("mechanic"),
    force: text("force"),
    primaryMuscles: text("primary_muscles").array().notNull().default(sql`'{}'::text[]`),
    secondaryMuscles: text("secondary_muscles").array().notNull().default(sql`'{}'::text[]`),
    instructions: text("instructions").array().notNull().default(sql`'{}'::text[]`),
    images: text("images").array().notNull().default(sql`'{}'::text[]`),
    videoUrl: text("video_url"),
    /** Safety tags (e.g. high_impact, spinal_load) matched against member limitations. */
    riskTags: text("risk_tags").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("exercises_gym_idx").on(t.gymId), index("exercises_name_idx").on(sql`lower(${t.name})`)],
);

export const workoutPlans = pgTable(
  "workout_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    trainerId: uuid("trainer_id").references(() => gymStaff.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    goal: text("goal"),
    status: planStatus("status").notNull().default("draft"),
    source: planSource("source").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    approvedByStaffId: uuid("approved_by_staff_id").references(() => gymStaff.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    startDate: date("start_date", { mode: "string" }),
    createdByStaffId: uuid("created_by_staff_id").references(() => gymStaff.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workout_plans_one_active_key").on(t.memberId).where(sql`${t.status} = 'active'`),
    index("workout_plans_gym_status_idx").on(t.gymId, t.status),
    index("workout_plans_member_idx").on(t.memberId),
    check(
      "workout_plans_active_requires_approval",
      sql`${t.status} <> 'active' or (${t.approvedByStaffId} is not null and ${t.approvedAt} is not null)`,
    ),
  ],
);

export const workoutPlanVersions = pgTable(
  "workout_plan_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    changeSummary: text("change_summary"),
    aiGenerationId: uuid("ai_generation_id"),
    createdByStaffId: uuid("created_by_staff_id").references(() => gymStaff.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workout_plan_versions_key").on(t.planId, t.version)],
);

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    planVersion: integer("plan_version").notNull(),
    dayKey: text("day_key").notNull(),
    performedOn: date("performed_on", { mode: "string" }).notNull(),
    entries: jsonb("entries").notNull(),
    completedExercises: integer("completed_exercises").notNull(),
    totalExercises: integer("total_exercises").notNull(),
    difficulty: integer("difficulty"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workout_logs_day_key").on(t.memberId, t.planId, t.dayKey, t.performedOn),
    index("workout_logs_gym_member_idx").on(t.gymId, t.memberId, t.performedOn),
  ],
);

export const progressEntries = pgTable(
  "progress_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    recordedOn: date("recorded_on", { mode: "string" }).notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1 }),
    measurements: jsonb("measurements").$type<Record<string, number>>(),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("progress_entries_member_idx").on(t.gymId, t.memberId, t.recordedOn)],
);

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    requestedByStaffId: uuid("requested_by_staff_id").references(() => gymStaff.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model"),
    status: aiStatus("status").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    validationErrors: jsonb("validation_errors"),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_generations_gym_created_idx").on(t.gymId, t.createdAt)],
);

/* --------------------------------------------------------- notifications */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_gym_created_idx").on(t.gymId, t.createdAt)],
);
