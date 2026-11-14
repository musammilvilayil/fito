import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { regenerateQr } from "@/server/modules/members/service";

/** Issues a new check-in QR code; the old one stops working immediately. */
export const POST = route({ auth: "gym", permission: "members.manage" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await regenerateQr(tx, ctx, params.id!);
    return { ok: true };
  }),
);
