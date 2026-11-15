import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { checkOut } from "@/server/modules/attendance/service";

export const POST = route({ auth: "gym", permission: "attendance.record" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await checkOut(tx, ctx, params.id!);
    return { ok: true };
  }),
);
