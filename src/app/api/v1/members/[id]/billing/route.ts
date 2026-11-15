import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listMemberMemberships, listMemberPayments } from "@/server/modules/memberships/service";
import { sequential } from "@/server/db/tx";

/** A member's memberships (with paid/outstanding) and payments. Members can read their own. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    const [memberships, payments] = await sequential(
      () => listMemberMemberships(tx, ctx, params.id!),
      () => listMemberPayments(tx, ctx, params.id!),
    );
    return { memberships, payments };
  }),
);
