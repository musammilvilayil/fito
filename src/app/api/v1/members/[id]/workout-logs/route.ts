import { workoutLogSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listWorkoutLogs, logWorkout } from "@/server/modules/workouts/tracking";

/** Recent workout logs. The member, or staff coaching them. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => inGym(ctx, (tx) => listWorkoutLogs(tx, ctx, params.id!)));

/** Log (or update) a workout day from the member's active plan. */
export const POST = route({ auth: "gym", body: workoutLogSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => logWorkout(tx, ctx, params.id!, body)),
);
