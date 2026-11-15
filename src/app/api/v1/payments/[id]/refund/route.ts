import { refundSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { refundPayment } from "@/server/modules/payments/service";

export const POST = route({ auth: "gym", permission: "payments.void", body: refundSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => refundPayment(tx, ctx, params.id!, body)),
);
