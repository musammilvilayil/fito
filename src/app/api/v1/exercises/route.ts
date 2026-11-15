import { customExerciseSchema, exerciseQuery } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createCustomExercise, searchExercises } from "@/server/modules/exercises/service";

/** The exercise library: FITO's global library plus the gym's own exercises. */
export const GET = route({ auth: "gym", query: exerciseQuery }, async ({ ctx, query }) => inGym(ctx, (tx) => searchExercises(tx, ctx, query)));

export const POST = route({ auth: "gym", permission: "exercises.manage", body: customExerciseSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => createCustomExercise(tx, ctx, body)),
);
