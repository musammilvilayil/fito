import "server-only";
import { eq, sql } from "drizzle-orm";
import { addDays, addMonths, maxDate } from "@/shared/dates";
import { periodEnd } from "@/shared/membership";
import { rupeesToPaise } from "@/shared/money";
import { importRowSchema } from "@/shared/schemas/member";
import { randomToken } from "../../auth/crypto";
import { requirePermission, type GymContext } from "../../auth/context";
import { membershipPlans, members, memberships, payments } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { audit } from "../audit";
import { gymToday, newMemberCode } from "./service";

export type ImportRowResult = {
  row: number;
  status: "ready" | "duplicate" | "error";
  fullName: string;
  phone: string | null;
  errors: string[];
  warnings: string[];
  membership: { planName: string; startDate: string; endDate: string; amountPaise: number } | null;
};

export type ImportSummary = {
  dryRun: boolean;
  total: number;
  ready: number;
  duplicates: number;
  errors: number;
  created: number;
  membershipsCreated: number;
  rows: ImportRowResult[];
};

/**
 * Imports members from spreadsheet rows (already mapped to FITO's columns).
 * A dry run validates every row and reports problems without saving.
 * Members whose phone already exists in the gym are skipped, not updated.
 * Rows with a membership end date also get their current membership, and an
 * "imported" payment dated on the membership start when an amount is given.
 */
export async function importMembers(
  tx: Tx,
  ctx: GymContext,
  rows: Record<string, unknown>[],
  dryRun: boolean,
): Promise<ImportSummary> {
  requirePermission(ctx, "members.manage");
  const today = gymToday(ctx);

  const plans = await tx
    .select({ id: membershipPlans.id, name: membershipPlans.name, unit: membershipPlans.durationUnit, value: membershipPlans.durationValue })
    .from(membershipPlans)
    .where(eq(membershipPlans.gymId, ctx.gym.id));
  const planByName = new Map(plans.map((p) => [p.name.trim().toLowerCase(), p]));

  const existing = await tx.execute(sql`select phone from members where gym_id = ${ctx.gym.id} and phone is not null`);
  const existingPhones = new Set((existing.rows as { phone: string }[]).map((r) => r.phone));
  const seenInFile = new Map<string, number>();

  const results: ImportRowResult[] = rows.map((raw, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based rows
    const strings = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === null || v === undefined ? null : String(v).trim()]),
    );
    const parsed = importRowSchema.safeParse(strings);
    const fullName = String(strings.fullName ?? "").trim();
    if (!parsed.success) {
      return {
        row: rowNumber,
        status: "error",
        fullName,
        phone: null,
        errors: [...new Set(parsed.error.issues.map((i) => i.message))],
        warnings: [],
        membership: null,
      };
    }
    const r = parsed.data;
    const errors: string[] = [];
    const warnings: string[] = [];
    let status: ImportRowResult["status"] = "ready";

    if (r.phone) {
      if (existingPhones.has(r.phone)) status = "duplicate";
      const firstRow = seenInFile.get(r.phone);
      if (firstRow) errors.push(`Same phone number as row ${firstRow}`);
      else seenInFile.set(r.phone, rowNumber);
    } else {
      warnings.push("No phone number: they can't receive an invite or WhatsApp reminders");
    }

    let membership: ImportRowResult["membership"] = null;
    const plan = r.planName ? planByName.get(r.planName.toLowerCase()) : undefined;
    if (r.planName && !plan) warnings.push(`Plan "${r.planName}" isn't set up in FITO; kept as text`);
    let start = r.membershipStart;
    let end = r.membershipEnd;
    if (!end && start && plan) end = periodEnd(start, plan.unit, plan.value);
    if (end) {
      if (!start) {
        start = plan
          ? plan.unit === "months"
            ? addMonths(addDays(end, 1), -plan.value)
            : addDays(end, 1 - plan.value)
          : r.joinedOn ?? addDays(end, -29);
      }
      if (end < start) errors.push("Membership end is before its start");
      const amount = r.amountPaid ? rupeesToPaise(r.amountPaid) : 0;
      if (amount === null) errors.push(`Amount paid "${r.amountPaid}" isn't a number`);
      membership = { planName: plan?.name ?? r.planName ?? "Imported membership", startDate: start, endDate: end, amountPaise: amount ?? 0 };
    } else if (r.planName || r.membershipStart) {
      warnings.push("No membership end date, so no membership was added");
    }

    if (errors.length > 0) status = "error";
    return { row: rowNumber, status, fullName: r.fullName, phone: r.phone, errors, warnings, membership };
  });

  let created = 0;
  let membershipsCreated = 0;
  if (!dryRun) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status !== "ready") continue;
      const r = importRowSchema.parse(
        Object.fromEntries(Object.entries(rows[i]!).map(([k, v]) => [k, v === null || v === undefined ? null : String(v).trim()])),
      );
      const [member] = await tx
        .insert(members)
        .values({
          gymId: ctx.gym.id,
          memberCode: await newMemberCode(tx, ctx.gym.id),
          fullName: r.fullName,
          phone: r.phone,
          email: r.email,
          gender: r.gender,
          dateOfBirth: r.dateOfBirth,
          joinedOn: r.joinedOn ?? result.membership?.startDate ?? today,
          notes: r.notes,
          qrToken: randomToken(18),
        })
        .returning({ id: members.id });
      created++;
      const m = result.membership;
      if (m) {
        const plan = planByName.get(m.planName.toLowerCase());
        const [ms] = await tx
          .insert(memberships)
          .values({
            gymId: ctx.gym.id,
            memberId: member!.id,
            planId: plan?.id ?? null,
            planName: m.planName,
            durationUnit: plan?.unit ?? "days",
            durationValue: plan?.value ?? Math.max(1, Math.round((Date.parse(m.endDate) - Date.parse(m.startDate)) / 86_400_000) + 1),
            kind: "new",
            startDate: m.startDate,
            endDate: m.endDate,
            pricePaise: m.amountPaise,
            totalPaise: m.amountPaise,
            createdByUserId: ctx.user.id,
          })
          .returning({ id: memberships.id });
        membershipsCreated++;
        if (m.amountPaise > 0) {
          await tx.insert(payments).values({
            gymId: ctx.gym.id,
            memberId: member!.id,
            membershipId: ms!.id,
            amountPaise: m.amountPaise,
            method: "other",
            paidAt: new Date(`${maxDate(m.startDate, "2000-01-01")}T06:00:00Z`),
            notes: "Imported from previous records",
            recordedByUserId: ctx.user.id,
          });
        }
      }
    }
    await audit(tx, ctx, "member.import", "member", null, { created, membershipsCreated });
  }

  return {
    dryRun,
    total: results.length,
    ready: results.filter((r) => r.status === "ready").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
    created,
    membershipsCreated,
    rows: results,
  };
}
