import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate } from "@/shared/dates";
import { durationLabel } from "@/shared/membership";
import { formatINR } from "@/shared/money";
import { formatPhone } from "@/shared/phone";
import { METHOD_LABELS } from "@/shared/schemas/billing";
import type { ReceiptData } from "./service";

let fonts: Promise<[Buffer, Buffer]> | undefined;
function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  return (fonts ??= Promise.all([readFile(path.join(dir, "Geist-Regular.ttf")), readFile(path.join(dir, "Geist-SemiBold.ttf"))]));
}

const INK = rgb(0.07, 0.08, 0.1);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.86, 0.87, 0.89);

/** A4 receipt as PDF bytes. Uses the gym's details; FITO is only credited in the footer. */
export async function renderReceiptPdf(data: ReceiptData, timeZone: string): Promise<Uint8Array> {
  const [regularBytes, boldBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  const left = 56;
  const right = width - 56;
  let y = 780;

  const text = (s: string, x: number, yy: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: opts.align === "right" ? x - w : x, y: yy, size, font, color: opts.color ?? INK });
  };
  const rule = (yy: number) => page.drawLine({ start: { x: left, y: yy }, end: { x: right, y: yy }, thickness: 0.8, color: LINE });

  const { payment: p, member, membership, gym } = data;
  const isRefund = p.kind === "refund";

  // Header: gym details
  text(gym.name, left, y, { font: bold, size: 18 });
  text(isRefund ? "REFUND RECEIPT" : "PAYMENT RECEIPT", right, y + 2, { font: bold, size: 11, color: MUTED, align: "right" });
  y -= 18;
  const address = [gym.addressLine, [gym.city, gym.state, gym.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  if (address) {
    text(address, left, y, { size: 9.5, color: MUTED });
    y -= 13;
  }
  const contact = [gym.phone ? formatPhone(gym.phone) : null, gym.email].filter(Boolean).join("  ·  ");
  if (contact) {
    text(contact, left, y, { size: 9.5, color: MUTED });
    y -= 13;
  }
  if (gym.gstin) {
    text(`GSTIN ${gym.gstin}`, left, y, { size: 9.5, color: MUTED });
    y -= 13;
  }
  y -= 10;
  rule(y);
  y -= 26;

  // Receipt meta
  const paidAt = p.paidAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone });
  const meta: [string, string][] = [
    ["Receipt no.", p.receiptNumber ?? "—"],
    ["Date", paidAt],
    ["Payment method", METHOD_LABELS[p.method]],
  ];
  if (p.reference) meta.push(["Reference", p.reference]);
  for (const [k, v] of meta) {
    text(k, left, y, { color: MUTED, size: 10 });
    text(v, left + 120, y, { font: bold, size: 10.5 });
    y -= 17;
  }
  y -= 8;
  text(isRefund ? "Refunded to" : "Received from", left, y, { color: MUTED, size: 10 });
  text(member.fullName, left + 120, y, { font: bold, size: 10.5 });
  y -= 15;
  text(`Member ID ${member.memberCode}${member.phone ? `  ·  ${formatPhone(member.phone)}` : ""}`, left + 120, y, { size: 9.5, color: MUTED });
  y -= 30;

  // Line items
  rule(y + 12);
  text("Description", left, y - 4, { color: MUTED, size: 9.5 });
  text("Amount", right, y - 4, { color: MUTED, size: 9.5, align: "right" });
  y -= 16;
  rule(y);
  y -= 22;
  const line = (label: string, amount: string, opts: { bold?: boolean; sub?: string } = {}) => {
    text(label, left, y, { font: opts.bold ? bold : regular });
    text(amount, right, y, { font: opts.bold ? bold : regular, align: "right" });
    if (opts.sub) {
      y -= 13;
      text(opts.sub, left, y, { size: 9, color: MUTED });
    }
    y -= 20;
  };
  if (isRefund) {
    line("Refund", formatINR(p.amountPaise, { alwaysPaise: true }), { sub: p.notes ?? undefined });
  } else if (membership) {
    line(`${membership.planName} membership (${durationLabel(membership.durationUnit, membership.durationValue)})`, formatINR(membership.pricePaise, { alwaysPaise: true }), {
      sub: `${formatDate(membership.startDate)} to ${formatDate(membership.endDate)}`,
    });
    if (membership.admissionFeePaise > 0) line("Admission fee", formatINR(membership.admissionFeePaise, { alwaysPaise: true }));
    if (membership.discountPaise > 0) {
      line(`Discount${membership.discountNote ? ` (${membership.discountNote})` : ""}`, `-${formatINR(membership.discountPaise, { alwaysPaise: true })}`);
    }
    rule(y + 10);
    y -= 6;
    line("Membership total", formatINR(membership.totalPaise, { alwaysPaise: true }), { bold: true });
  } else {
    line(p.notes ?? "Payment", formatINR(p.amountPaise, { alwaysPaise: true }));
  }

  // Amount box (leave a clear gap below the last line item)
  y -= 34;
  page.drawRectangle({ x: left, y: y - 18, width: right - left, height: 46, color: rgb(0.965, 0.97, 0.975) });
  text(isRefund ? "Amount refunded" : "Amount received", left + 14, y, { color: MUTED });
  text(formatINR(p.amountPaise, { alwaysPaise: true }), right - 14, y - 2, { font: bold, size: 16, align: "right" });
  y -= 52;
  if (!isRefund && data.balance) {
    const due = Math.max(0, data.balance.total - data.balance.paid);
    text(due > 0 ? `Balance due on this membership: ${formatINR(due, { alwaysPaise: true })}` : "This membership is fully paid.", left, y, {
      size: 10,
      color: MUTED,
    });
    y -= 16;
  }
  if (p.status === "void") {
    text(`VOID — ${p.voidReason ?? ""}`, left, y, { font: bold, color: rgb(0.8, 0.15, 0.15) });
    y -= 16;
  }
  if (data.recordedBy) text(`Recorded by ${data.recordedBy}`, left, y, { size: 9.5, color: MUTED });

  footer(page, regular, left, right);
  return doc.save();
}

function footer(page: PDFPage, font: PDFFont, left: number, right: number) {
  page.drawLine({ start: { x: left, y: 70 }, end: { x: right, y: 70 }, thickness: 0.8, color: LINE });
  page.drawText("This is a computer-generated receipt.", { x: left, y: 54, size: 8.5, font, color: MUTED });
  const s = "Generated with FITO";
  page.drawText(s, { x: right - font.widthOfTextAtSize(s, 8.5), y: 54, size: 8.5, font, color: MUTED });
}
