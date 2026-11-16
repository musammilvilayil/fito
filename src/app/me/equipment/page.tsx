import { ArrowLeft, PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { EQUIPMENT_GROUPS } from "@/shared/equipment-catalog";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { listEquipment } from "@/server/modules/equipment/service";

export const metadata: Metadata = { title: "Gym equipment" };

export default async function MemberEquipmentPage() {
  const ctx = await requireMemberContext();
  const { items, totalPieces } = await inGym(ctx, (tx) => listEquipment(tx, ctx));
  const groups = EQUIPMENT_GROUPS.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      <Link href="/me" className="inline-flex items-center gap-1.5 px-1 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <div className="px-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Equipment at {ctx.gym.name}</h1>
        <p className="text-sm text-ink-muted">{items.length ? `${items.length} kinds · ${totalPieces} pieces` : "The gym hasn't listed its equipment yet."}</p>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={PackageOpen} title="Nothing listed yet" description="Ask your trainer what's on the floor." />
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.group}>
            <h2 className="px-5 pt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">{g.group}</h2>
            <ul className="divide-y divide-line px-5 pb-2">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0 truncate">{i.name}</span>
                  <span className="tabular shrink-0 rounded-full bg-raised px-2.5 py-0.5 text-[12.5px] font-semibold">× {i.quantity}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
