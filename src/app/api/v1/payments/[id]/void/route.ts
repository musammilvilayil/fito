import { voidSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { voidPayment } from "@/server/modules/payments/service";

export const POST = route({ auth: "gym", permission: "payments.void", body: voidSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await voidPayment(tx, ctx, params.id!, body.reason);
    return { ok: true };
  }),
);
