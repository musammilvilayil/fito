import { assignTrainerSchema } from "@/shared/schemas/member";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { assignTrainer } from "@/server/modules/members/service";
import { notifyTrainerAssigned } from "@/server/modules/notifications/service";

export const POST = route(
  { auth: "gym", permission: "members.assign_trainer", body: assignTrainerSchema },
  async ({ ctx, body, params }) =>
    inGym(ctx, async (tx) => {
      await assignTrainer(tx, ctx, params.id!, body.trainerId);
      if (body.trainerId) await notifyTrainerAssigned(tx, ctx, params.id!, body.trainerId);
      return { trainerId: body.trainerId };
    }),
);
