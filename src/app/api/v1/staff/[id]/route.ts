import { staffUpdateSchema } from "@/shared/schemas/gym";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { updateStaff } from "@/server/modules/staff/service";

export const PATCH = route(
  { auth: "gym", permission: "staff.manage", body: staffUpdateSchema },
  async ({ ctx, body, params }) => inGym(ctx, (tx) => updateStaff(tx, ctx, params.id!, body)),
);
