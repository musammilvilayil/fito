import { sellMembershipSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { sellMembership } from "@/server/modules/memberships/service";

/** Sells a new membership or renewal, optionally recording the payment. */
export const POST = route({ auth: "gym", permission: "memberships.manage", body: sellMembershipSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => sellMembership(tx, ctx, body)),
);
