import { importRequestSchema } from "@/shared/schemas/member";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { importMembers } from "@/server/modules/members/import";

export const POST = route({ auth: "gym", permission: "members.manage", body: importRequestSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => importMembers(tx, ctx, body.rows, body.dryRun)),
);
