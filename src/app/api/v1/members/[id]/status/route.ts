import { memberStatusSchema } from "@/shared/schemas/member";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { setMemberStatus } from "@/server/modules/members/service";

export const POST = route({ auth: "gym", permission: "members.manage", body: memberStatusSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await setMemberStatus(tx, ctx, params.id!, body.status);
    return { status: body.status };
  }),
);
