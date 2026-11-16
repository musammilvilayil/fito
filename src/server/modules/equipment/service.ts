import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { CATALOG_BY_KEY, categoriesFrom, EQUIPMENT_GROUPS } from "@/shared/equipment-catalog";
import type { equipmentAddSchema, equipmentUpdateSchema } from "@/shared/schemas/equipment";
import { requirePermission, type GymContext } from "../../auth/context";
import { gymEquipment, gyms } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, conflict, notFound, uniqueViolation } from "../../errors";
import { audit } from "../audit";
import { getGymProfile } from "../gyms/service";

/** The gym's equipment, grouped like the catalogue. Anyone in the gym can see it. */
export async function listEquipment(tx: Tx, ctx: GymContext) {
  const rows = await tx.select().from(gymEquipment).where(eq(gymEquipment.gymId, ctx.gym.id)).orderBy(asc(gymEquipment.name));
  const order = new Map<string, number>(EQUIPMENT_GROUPS.map((g, i) => [g, i]));
  rows.sort((a, b) => (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) || a.name.localeCompare(b.name));
  return {
    items: rows.map((r) => ({ id: r.id, catalogKey: r.catalogKey, name: r.name, group: r.group, category: r.category, quantity: r.quantity, notes: r.notes })),
    totalPieces: rows.reduce((s, r) => s + r.quantity, 0),
    workoutEquipment: rows.length ? categoriesFrom(rows) : (ctx.gym.settings.availableEquipment ?? []),
  };
}

/** Workout plans only use exercises for equipment on the list (plus bodyweight). */
async function syncWorkoutEquipment(tx: Tx, ctx: GymContext) {
  const rows = await tx.select({ category: gymEquipment.category }).from(gymEquipment).where(eq(gymEquipment.gymId, ctx.gym.id));
  if (rows.length === 0) return;
  const gym = await getGymProfile(tx, ctx);
  await tx
    .update(gyms)
    .set({ settings: { ...gym.settings, availableEquipment: categoriesFrom(rows) }, updatedAt: new Date() })
    .where(eq(gyms.id, ctx.gym.id));
}

export async function addEquipment(tx: Tx, ctx: GymContext, input: z.output<typeof equipmentAddSchema>) {
  requirePermission(ctx, "equipment.manage");
  let values: { catalogKey: string | null; name: string; category: string; group: string };
  if (input.catalogKey) {
    const c = CATALOG_BY_KEY.get(input.catalogKey);
    if (!c) throw badRequest("That isn't in the equipment catalogue.");
    values = { catalogKey: c.key, name: c.name, category: c.category, group: c.group };
  } else {
    values = { catalogKey: null, name: input.name!, category: input.category!, group: "Other" };
  }
  const [existing] = await tx
    .select({ id: gymEquipment.id })
    .from(gymEquipment)
    .where(and(eq(gymEquipment.gymId, ctx.gym.id), eq(gymEquipment.name, values.name)));
  if (existing) throw conflict(`${values.name} is already on your list. Change its quantity instead.`);
  try {
    const [row] = await tx
      .insert(gymEquipment)
      .values({ gymId: ctx.gym.id, ...values, quantity: input.quantity, notes: input.notes })
      .returning();
    await syncWorkoutEquipment(tx, ctx);
    await audit(tx, ctx, "equipment.add", "equipment", row!.id, { name: values.name, quantity: input.quantity });
    return row!;
  } catch (err) {
    if (uniqueViolation(err)) throw conflict(`${values.name} is already on your list.`);
    throw err;
  }
}

export async function updateEquipment(tx: Tx, ctx: GymContext, id: string, input: z.output<typeof equipmentUpdateSchema>) {
  requirePermission(ctx, "equipment.manage");
  const [row] = await tx
    .update(gymEquipment)
    .set({ quantity: input.quantity, notes: input.notes, updatedAt: new Date() })
    .where(and(eq(gymEquipment.id, id), eq(gymEquipment.gymId, ctx.gym.id)))
    .returning();
  if (!row) throw notFound("Equipment not found.");
  await audit(tx, ctx, "equipment.update", "equipment", id, { quantity: input.quantity });
  return row;
}

export async function removeEquipment(tx: Tx, ctx: GymContext, id: string) {
  requirePermission(ctx, "equipment.manage");
  const [row] = await tx.delete(gymEquipment).where(and(eq(gymEquipment.id, id), eq(gymEquipment.gymId, ctx.gym.id))).returning();
  if (!row) throw notFound("Equipment not found.");
  await syncWorkoutEquipment(tx, ctx);
  await audit(tx, ctx, "equipment.remove", "equipment", id, { name: row.name });
}
