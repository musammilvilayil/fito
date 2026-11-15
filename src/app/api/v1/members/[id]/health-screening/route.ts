import { healthScreeningSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { saveHealthScreening } from "@/server/modules/workouts/service";

export const PUT = route({ auth: "gym", body: healthScreeningSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await saveHealthScreening(tx, ctx, params.id!, body);
    return { ok: true };
  }),
);
