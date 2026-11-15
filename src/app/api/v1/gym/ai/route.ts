import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { getAiSettings, updateAiSettings } from "@/server/modules/assistant/settings";
import { aiSettingsSchema } from "@/shared/schemas/assistant";

/** AI status, usage this month and limits (owners and managers with gym.manage). */
export const GET = route({ auth: "gym", permission: "gym.manage" }, async ({ ctx }) => inGym(ctx, (tx) => getAiSettings(tx, ctx)));

export const PATCH = route({ auth: "gym", permission: "gym.manage", body: aiSettingsSchema }, async ({ ctx, body }) =>
  inGym(ctx, async (tx) => {
    await updateAiSettings(tx, ctx, body);
    return { ok: true };
  }),
);
