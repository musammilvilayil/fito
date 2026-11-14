import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createPasswordResetLink } from "@/server/modules/staff/service";

export const POST = route({ auth: "gym", permission: "staff.manage" }, async ({ ctx, params }) =>
  inGym(ctx, (tx) => createPasswordResetLink(tx, ctx, { kind: "staff", id: params.id! })),
);
