import { staffInviteSchema } from "@/shared/schemas/gym";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { inviteStaff, listStaff } from "@/server/modules/staff/service";

export const GET = route({ auth: "gym", permission: "staff.manage" }, async ({ ctx }) =>
  inGym(ctx, (tx) => listStaff(tx, ctx)),
);

export const POST = route({ auth: "gym", permission: "staff.manage", body: staffInviteSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => inviteStaff(tx, ctx, body)),
);
