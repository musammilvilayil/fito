import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatPhone } from "@/shared/phone";
import { inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getGymProfile } from "@/server/modules/gyms/service";
import { getAiSettings } from "@/server/modules/assistant/settings";
import { listEquipment } from "@/server/modules/equipment/service";
import { batchHoursOf } from "@/shared/batches";
import { AiSettingsCard } from "./ai-settings";
import { GymProfileForm, GymSettingsForm } from "./gym-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireStaffContext();
  if (!ctx.permissions.has("gym.manage")) redirect("/settings/staff");
  const [gym, ai, equipment] = await inGym(
    ctx,
    async (tx) => [await getGymProfile(tx, ctx), await getAiSettings(tx, ctx), await listEquipment(tx, ctx)] as const,
  );
  const batches = batchHoursOf(gym.settings);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <GymProfileForm
          initial={{
            name: gym.name,
            phone: formatPhone(gym.phone),
            email: gym.email ?? "",
            addressLine: gym.addressLine ?? "",
            city: gym.city ?? "",
            state: gym.state,
            pincode: gym.pincode ?? "",
            gstin: gym.gstin ?? "",
            receiptPrefix: gym.receiptPrefix,
          }}
        />
        <GymSettingsForm
          initial={{
            expiringSoonDays: gym.settings.expiringSoonDays ?? 7,
            sessionMinutes: gym.settings.sessionMinutes ?? 90,
            openingHours: gym.settings.openingHours ?? "",
            allowMemberSignup: gym.settings.allowMemberSignup !== false,
            morningStart: batches.morning.start,
            morningEnd: batches.morning.end,
            eveningStart: batches.evening.start,
            eveningEnd: batches.evening.end,
            batchPolicy: gym.settings.batchPolicy ?? "warn",
            crowdCapacity: gym.settings.crowdCapacity ?? 40,
          }}
          equipment={{ items: equipment.items.length, categories: equipment.workoutEquipment }}
        />
      </div>
      <AiSettingsCard status={ai} initial={ai.settings} />
    </div>
  );
}
