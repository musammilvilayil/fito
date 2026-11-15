import { paymentListQuery, METHOD_LABELS } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listPayments } from "@/server/modules/payments/service";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Prevent spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV of payments in a date range (for the gym's accountant). */
export const GET = route({ auth: "gym", permission: "payments.view", query: paymentListQuery }, async ({ ctx, query }) => {
  const data = await inGym(ctx, (tx) => listPayments(tx, ctx, { ...query, page: 1, pageSize: 200 }));
  const all = [...data.items];
  for (let page = 2; all.length < data.total; page++) {
    const more = await inGym(ctx, (tx) => listPayments(tx, ctx, { ...query, page, pageSize: 200 }));
    if (more.items.length === 0) break;
    all.push(...more.items);
  }
  const header = ["Date", "Receipt", "Type", "Member", "Member ID", "Plan", "Method", "Amount (INR)", "Status", "Reference", "Notes", "Recorded by"];
  const lines = all.map((p) =>
    [
      p.paidAt.toLocaleString("en-IN", { timeZone: ctx.gym.timezone }),
      p.receiptNumber,
      p.kind,
      p.memberName,
      p.memberCode,
      p.planName,
      METHOD_LABELS[p.method],
      ((p.kind === "refund" ? -1 : 1) * p.amountPaise / 100).toFixed(2),
      p.status,
      p.reference,
      p.notes,
      p.recordedBy,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  return new Response(`﻿${csv}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payments-${data.from}-to-${data.to}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});
