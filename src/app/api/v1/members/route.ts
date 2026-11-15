import { memberCreateSchema, memberListQuery } from "@/shared/schemas/member";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createMember, listMembers } from "@/server/modules/members/service";

export const GET = route({ auth: "gym", query: memberListQuery }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => listMembers(tx, ctx, query)),
);

export const POST = route({ auth: "gym", permission: "members.manage", body: memberCreateSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => createMember(tx, ctx, body)),
);
