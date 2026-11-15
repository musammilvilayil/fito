import { gymProfileSchema } from "@/shared/schemas/gym";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { getGymProfile, updateGymProfile } from "@/server/modules/gyms/service";

export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => getGymProfile(tx, ctx)));

export const PATCH = route({ auth: "gym", permission: "gym.manage", body: gymProfileSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => updateGymProfile(tx, ctx, body)),
);
