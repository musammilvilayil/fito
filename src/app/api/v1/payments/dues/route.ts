import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listDues } from "@/server/modules/payments/service";

export const GET = route({ auth: "gym", permission: "payments.view" }, async ({ ctx }) => inGym(ctx, (tx) => listDues(tx, ctx)));
