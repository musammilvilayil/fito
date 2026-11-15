import { Sparkles } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export const PLAN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Needs review", tone: "warning" },
  active: { label: "Active", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
};

export function PlanStatusBadge({ status }: { status: string }) {
  const s = PLAN_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PlanSourceBadge({ source }: { source: string }) {
  if (source === "ai")
    return (
      <Badge tone="lime">
        <Sparkles className="size-3" /> AI draft
      </Badge>
    );
  return <Badge tone="neutral">{source === "template" ? "Template" : "Built by trainer"}</Badge>;
}
