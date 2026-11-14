import { freezeSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { freezeMembership } from "@/server/modules/memberships/service";

export const POST = route({ auth: "gym", permission: "memberships.manage", body: freezeSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await freezeMembership(tx, ctx, params.id!, body);
    return { ok: true };
  }),
);
