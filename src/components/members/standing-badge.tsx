import { Badge } from "@/components/ui/badge";
import { STANDING_LABELS, STANDING_TONES, type MemberStanding } from "@/shared/membership";

export function StandingBadge({ standing }: { standing: MemberStanding }) {
  return (
    <Badge tone={STANDING_TONES[standing]} dot={standing === "active" || standing === "expiring"}>
      {STANDING_LABELS[standing]}
    </Badge>
  );
}
