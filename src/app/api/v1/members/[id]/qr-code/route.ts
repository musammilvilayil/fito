import { hasPermission, inGym } from "@/server/auth/context";
import { forbidden } from "@/server/errors";
import { route } from "@/server/http/route";
import { getMember } from "@/server/modules/members/service";
import { memberQrSvg } from "@/server/modules/members/qr";

/** The member's check-in QR code as SVG. For the member themself and front-desk staff. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => {
  const isSelf = ctx.memberId === params.id;
  if (!isSelf && !hasPermission(ctx, "members.manage") && !hasPermission(ctx, "attendance.record")) throw forbidden();
  const member = await inGym(ctx, (tx) => getMember(tx, ctx, params.id!));
  return new Response(await memberQrSvg(member.qrToken), {
    headers: { "content-type": "image/svg+xml", "cache-control": "private, no-store" },
  });
});
