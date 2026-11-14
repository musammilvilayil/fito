import { cancelMembershipSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { cancelMembership } from "@/server/modules/memberships/service";

export const POST = route(
  { auth: "gym", permission: "memberships.manage", body: cancelMembershipSchema },
  async ({ ctx, body, params }) =>
    inGym(ctx, async (tx) => {
      await cancelMembership(tx, ctx, params.id!, body);
      return { ok: true };
    }),
);
