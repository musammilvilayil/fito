import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createMemberInvite } from "@/server/modules/members/service";

export const POST = route({ auth: "gym", permission: "members.manage" }, async ({ ctx, params }) =>
  inGym(ctx, (tx) => createMemberInvite(tx, ctx, params.id!)),
);
