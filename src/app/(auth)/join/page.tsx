import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { GymFinder } from "./gym-finder";

export const metadata: Metadata = { title: "Find your gym" };

/** Signed-in people pick a gym to join, or switch to one they've joined. */
export default async function JoinPage() {
  const session = await getSession();
  if (!session) redirect("/signup");
  const home = await homePathFor();
  return (
    <AuthCard
      title="Find your gym"
      subtitle="Search by gym name or city. Joining adds you to the gym's register; the front desk then sets up your membership."
    >
      <GymFinder backHref={home === "/welcome" ? null : home} />
    </AuthCard>
  );
}
