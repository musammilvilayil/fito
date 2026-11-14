import { paymentListQuery, recordPaymentSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listPayments, recordPayment } from "@/server/modules/payments/service";

export const GET = route({ auth: "gym", permission: "payments.view", query: paymentListQuery }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => listPayments(tx, ctx, query)),
);

export const POST = route({ auth: "gym", permission: "payments.record", body: recordPaymentSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => recordPayment(tx, ctx, body)),
);
