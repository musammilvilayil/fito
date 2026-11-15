import { memberUpdateSchema } from "@/shared/schemas/member";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { getMember, updateMember } from "@/server/modules/members/service";
import { selfView } from "@/server/modules/portal/service";

/** Staff get the full record; a member reading their own gets the member-safe view (no staff notes). */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    const { qrToken: _qr, ...member } = await getMember(tx, ctx, params.id!);
    return ctx.role === "member" ? selfView({ ...member, qrToken: "" }) : member;
  }),
);

export const PATCH = route({ auth: "gym", permission: "members.manage", body: memberUpdateSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    const { qrToken: _qr, ...member } = await updateMember(tx, ctx, params.id!, body);
    return member;
  }),
);
