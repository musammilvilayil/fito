import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { regenerateStaffInvite } from "@/server/modules/staff/service";

/** Issues a fresh invite link (the old one stops working). */
export const POST = route({ auth: "gym", permission: "staff.manage" }, async ({ ctx, params }) =>
  inGym(ctx, (tx) => regenerateStaffInvite(tx, ctx, params.id!)),
);
