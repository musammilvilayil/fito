import { progressEntrySchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { addProgressEntry, listProgress } from "@/server/modules/workouts/tracking";

/** Weight, body fat and measurements over the last year. The member, or staff coaching them. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => inGym(ctx, (tx) => listProgress(tx, ctx, params.id!)));

export const POST = route({ auth: "gym", body: progressEntrySchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => addProgressEntry(tx, ctx, params.id!, body)),
);
