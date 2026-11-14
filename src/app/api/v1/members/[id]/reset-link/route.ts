import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createPasswordResetLink } from "@/server/modules/staff/service";

export const POST = route({ auth: "gym", permission: "members.manage" }, async ({ ctx, params }) =>
  inGym(ctx, (tx) => createPasswordResetLink(tx, ctx, { kind: "member", id: params.id! })),
);
