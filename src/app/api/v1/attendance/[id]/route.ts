import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { deleteCheckIn } from "@/server/modules/attendance/service";

/** Removes a check-in recorded by mistake (owner/manager only; audited). */
export const DELETE = route({ auth: "gym", permission: "attendance.override" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await deleteCheckIn(tx, ctx, params.id!);
    return { ok: true };
  }),
);
