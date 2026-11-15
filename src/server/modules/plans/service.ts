import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { planSchema } from "@/shared/schemas/billing";
import { requirePermission, type GymContext } from "../../auth/context";
import { membershipPlans } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { conflict, forbidden, notFound, uniqueViolation } from "../../errors";
import { audit } from "../audit";

export type Plan = typeof membershipPlans.$inferSelect & { activeMemberships: number };

export async function listPlans(tx: Tx, ctx: GymContext, opts: { includeInactive?: boolean } = {}): Promise<Plan[]> {
  if (!ctx.permissions.has("plans.manage") && !ctx.permissions.has("memberships.manage")) throw forbidden();
  const rows = await tx
    .select({
      plan: membershipPlans,
      // Outer columns are fully qualified; interpolated columns render unqualified.
      activeMemberships: sql<number>`(select count(*)::int from memberships ms where ms.plan_id = "membership_plans"."id" and ms.state = 'active' and ms.end_date >= current_date)`,
    })
    .from(membershipPlans)
    .where(
      and(eq(membershipPlans.gymId, ctx.gym.id), opts.includeInactive ? sql`true` : eq(membershipPlans.isActive, true)),
    )
    .orderBy(desc(membershipPlans.isActive), asc(membershipPlans.sortOrder), asc(membershipPlans.durationUnit), asc(membershipPlans.durationValue));
  return rows.map((r) => ({ ...r.plan, activeMemberships: r.activeMemberships }));
}

export async function getPlan(tx: Tx, ctx: GymContext, planId: string) {
  const [plan] = await tx
    .select()
    .from(membershipPlans)
    .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.gymId, ctx.gym.id)));
  if (!plan) throw notFound("Plan not found.");
  return plan;
}

function nameConflict(err: unknown): never {
  if (uniqueViolation(err) === "membership_plans_gym_name_key") {
    throw conflict("You already have a plan with this name.", { fieldErrors: { name: "Name already used" } });
  }
  throw err;
}

export async function createPlan(tx: Tx, ctx: GymContext, input: z.output<typeof planSchema>) {
  requirePermission(ctx, "plans.manage");
  try {
    const [plan] = await tx
      .insert(membershipPlans)
      .values({
        gymId: ctx.gym.id,
        name: input.name,
        description: input.description,
        durationUnit: input.durationUnit,
        durationValue: input.durationValue,
        pricePaise: input.price,
        admissionFeePaise: input.admissionFee,
        isActive: input.isActive,
      })
      .returning();
    await audit(tx, ctx, "plan.create", "membership_plan", plan!.id, { price: input.price });
    return plan!;
  } catch (err) {
    nameConflict(err);
  }
}

/**
 * Edits apply to future sales only: existing memberships keep the plan name,
 * duration and price they were sold with.
 */
export async function updatePlan(tx: Tx, ctx: GymContext, planId: string, input: z.output<typeof planSchema>) {
  requirePermission(ctx, "plans.manage");
  await getPlan(tx, ctx, planId);
  try {
    const [plan] = await tx
      .update(membershipPlans)
      .set({
        name: input.name,
        description: input.description,
        durationUnit: input.durationUnit,
        durationValue: input.durationValue,
        pricePaise: input.price,
        admissionFeePaise: input.admissionFee,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.gymId, ctx.gym.id)))
      .returning();
    await audit(tx, ctx, "plan.update", "membership_plan", planId, { price: input.price, isActive: input.isActive });
    return plan!;
  } catch (err) {
    nameConflict(err);
  }
}
