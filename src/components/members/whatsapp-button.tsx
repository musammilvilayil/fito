import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/shared/phone";

/** Opens the gym's own WhatsApp with a pre-filled message (no API cost). */
export function WhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  compact,
  className,
}: {
  phone: string | null;
  message: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  if (!phone) return null;
  return (
    <a
      href={whatsappLink(phone, message)}
      target="_blank"
      rel="noreferrer"
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-success/40 hover:text-success",
        compact && "px-2",
        className,
      )}
    >
      <MessageCircle className="size-3.5" aria-hidden />
      {!compact && label}
    </a>
  );
}

export function renewalReminder(memberName: string, gymName: string, validUntil: string | null) {
  const first = memberName.split(" ")[0];
  if (!validUntil) return `Hi ${first}, this is ${gymName}. Please visit the front desk to renew your membership.`;
  const date = new Date(`${validUntil}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Hi ${first}, your ${gymName} membership is valid till ${date}. Renew at the front desk to keep training without a break.`;
}
