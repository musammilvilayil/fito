import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/shared/permissions";
import { resolveGymContext } from "@/server/auth/context";
import { getSession } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { GymPicker } from "./gym-picker";

export const metadata: Metadata = { title: "Choose a gym" };

export default async function SelectGymPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const resolution = await resolveGymContext({ ...session, activeGymId: null });
  if (resolution.kind === "none") redirect("/welcome");
  const memberships = resolution.kind === "ok" ? resolution.ctx.memberships : resolution.memberships;
  return (
    <AuthCard title="Choose a gym" subtitle="You belong to more than one gym. You can switch any time from the menu.">
      <GymPicker gyms={memberships.map((m) => ({ id: m.gymId, name: m.gymName, role: ROLE_LABELS[m.role] }))} />
    </AuthCard>
  );
}
