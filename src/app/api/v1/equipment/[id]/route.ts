import { equipmentUpdateSchema } from "@/shared/schemas/equipment";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { removeEquipment, updateEquipment } from "@/server/modules/equipment/service";

export const PATCH = route({ auth: "gym", permission: "equipment.manage", body: equipmentUpdateSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => updateEquipment(tx, ctx, params.id!, body)),
);

export const DELETE = route({ auth: "gym", permission: "equipment.manage" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await removeEquipment(tx, ctx, params.id!);
    return { ok: true };
  }),
);
