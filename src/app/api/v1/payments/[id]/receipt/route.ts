import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { renderReceiptPdf } from "@/server/modules/payments/receipt-pdf";
import { getReceipt } from "@/server/modules/payments/service";

/** PDF receipt. Staff with payments.view, or the member the payment belongs to. */
export const GET = route({ auth: "gym" }, async ({ ctx, params, req }) => {
  const data = await inGym(ctx, (tx) => getReceipt(tx, ctx, params.id!));
  const pdf = await renderReceiptPdf(data, ctx.gym.timezone);
  const name = `receipt-${(data.payment.receiptNumber ?? data.payment.id).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  const inline = req.nextUrl.searchParams.get("download") !== "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
});
