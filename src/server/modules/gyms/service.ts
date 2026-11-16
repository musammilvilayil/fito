import "server-only";
import { DEFAULT_BATCH_HOURS } from "@/shared/batches";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { gymProfileSchema, gymSettingsSchema } from "@/shared/schemas/gym";
import { requirePermission, type GymContext } from "../../auth/context";
import { gyms, type GymSettings } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { notFound } from "../../errors";
import { audit } from "../audit";

export async function getGymProfile(tx: Tx, ctx: GymContext) {
  const [gym] = await tx.select().from(gyms).where(eq(gyms.id, ctx.gym.id));
  if (!gym) throw notFound("Gym not found.");
  return gym;
}

export async function updateGymProfile(tx: Tx, ctx: GymContext, input: z.output<typeof gymProfileSchema>) {
  requirePermission(ctx, "gym.manage");
  const [gym] = await tx
    .update(gyms)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(gyms.id, ctx.gym.id))
    .returning();
  await audit(tx, ctx, "gym.update", "gym", ctx.gym.id, { fields: Object.keys(input) });
  return gym;
}

export async function updateGymSettings(tx: Tx, ctx: GymContext, input: z.output<typeof gymSettingsSchema>) {
  requirePermission(ctx, "gym.manage");
  const current = await getGymProfile(tx, ctx);
  const settings: GymSettings = {
    ...current.settings,
    expiringSoonDays: input.expiringSoonDays,
    sessionMinutes: input.sessionMinutes,
    openingHours: input.openingHours,
    allowMemberSignup: input.allowMemberSignup,
    batches: {
      morning: { start: input.morningStart ?? DEFAULT_BATCH_HOURS.morning.start, end: input.morningEnd ?? DEFAULT_BATCH_HOURS.morning.end },
      evening: { start: input.eveningStart ?? DEFAULT_BATCH_HOURS.evening.start, end: input.eveningEnd ?? DEFAULT_BATCH_HOURS.evening.end },
    },
    batchPolicy: input.batchPolicy ?? "warn",
    crowdCapacity: input.crowdCapacity ?? 40,
    // The Equipment page keeps this in step with the equipment list.
    ...(input.availableEquipment ? { availableEquipment: input.availableEquipment } : {}),
  };
  const [gym] = await tx
    .update(gyms)
    .set({ settings, updatedAt: new Date() })
    .where(eq(gyms.id, ctx.gym.id))
    .returning();
  await audit(tx, ctx, "gym.settings", "gym", ctx.gym.id, input);
  return gym;
}
