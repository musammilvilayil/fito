import { unfreezeSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { unfreezeMembership } from "@/server/modules/memberships/service";

export const POST = route({ auth: "gym", permission: "memberships.manage", body: unfreezeSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => unfreezeMembership(tx, ctx, params.id!, body)),
);
