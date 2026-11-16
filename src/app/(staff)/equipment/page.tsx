import { Boxes, Dumbbell, Layers } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader, StatCard } from "@/components/ui/page";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { listEquipment } from "@/server/modules/equipment/service";
import { EquipmentManager } from "./equipment-manager";

export const metadata: Metadata = { title: "Equipment" };

export default async function EquipmentPage() {
  const ctx = await requireStaffContext();
  const list = await inGym(ctx, (tx) => listEquipment(tx, ctx));
  const canManage = hasPermission(ctx, "equipment.manage");
  return (
    <>
      <PageHeader
        title="Equipment"
        description={
          canManage
            ? "Everything on your gym floor. Search the catalogue, add what you have and set how many."
            : "Everything on the gym floor. Owners, managers and trainers keep this list up to date."
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard label="Items on the list" value={list.items.length} icon={Layers} tone="lime" />
        <StatCard label="Pieces in total" value={list.totalPieces} icon={Boxes} />
        <StatCard
          label="Workouts can use"
          value={list.workoutEquipment.length}
          icon={Dumbbell}
          hint={list.workoutEquipment.length ? list.workoutEquipment.join(", ") : "Add equipment to choose"}
          className="col-span-2 xl:col-span-1"
        />
      </div>
      <EquipmentManager initial={list.items} canManage={canManage} />
    </>
  );
}
