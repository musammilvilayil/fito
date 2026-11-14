import { gymSettingsSchema } from "@/shared/schemas/gym";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { updateGymSettings } from "@/server/modules/gyms/service";

export const PATCH = route({ auth: "gym", permission: "gym.manage", body: gymSettingsSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => updateGymSettings(tx, ctx, body)),
);
