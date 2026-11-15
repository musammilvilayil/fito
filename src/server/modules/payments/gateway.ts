import "server-only";

/**
 * Online payment gateway boundary (not connected yet).
 *
 * The pilot records payments by hand (cash, UPI to the gym's own account,
 * card). When a gym connects its own gateway account (e.g. Razorpay, with
 * the gym as the merchant), implement this interface and wire it in:
 *
 *  1. `createPaymentLink` when staff (or a member) choose "Pay online".
 *  2. A webhook route that calls `verifyWebhook`, then records the payment
 *     with `gateway` + `gatewayPaymentId` set. The unique index on
 *     (gateway, gateway_payment_id) makes repeated webhooks harmless.
 *
 * Split settlements / marketplace features are deliberately not assumed:
 * they need separate approval from the payment provider.
 */
export interface PaymentGateway {
  readonly name: string;
  createPaymentLink(input: {
    gymId: string;
    membershipId: string;
    amountPaise: number;
    description: string;
    customer: { name: string; phone: string | null; email: string | null };
    callbackUrl: string;
  }): Promise<{ id: string; url: string }>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<
    | { valid: false }
    | { valid: true; event: "payment.captured" | "payment.failed" | "other"; gatewayPaymentId: string; membershipId: string | null; amountPaise: number }
  >;
}

/** Returns the configured gateway for a gym, or null while none is connected. */
export function gatewayForGym(_gymId: string): PaymentGateway | null {
  return null;
}
