import { equipmentAddSchema } from "@/shared/schemas/equipment";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { addEquipment, listEquipment } from "@/server/modules/equipment/service";

/** The gym's equipment list (anyone in the gym). */
export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => listEquipment(tx, ctx)));

/** Add from the catalogue ({ catalogKey, quantity }) or a custom item ({ name, category, quantity }). */
export const POST = route({ auth: "gym", permission: "equipment.manage", body: equipmentAddSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => addEquipment(tx, ctx, body)),
);
