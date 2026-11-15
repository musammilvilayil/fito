import { notFound } from "@/server/errors";
import { route } from "@/server/http/route";
import { lookupInvite } from "@/server/modules/auth/service";

export const GET = route({ auth: "public" }, async ({ params }) => {
  const invite = await lookupInvite(params.token ?? "");
  if (!invite) throw notFound("This invite link is not valid.");
  // Only what the invite page needs to display.
  return {
    kind: invite.kind,
    gymName: invite.gymName,
    fullName: invite.fullName,
    role: invite.role,
    hasEmail: Boolean(invite.email),
    hasPhone: Boolean(invite.phone),
    expired: invite.expired,
    accepted: invite.accepted,
  };
});
