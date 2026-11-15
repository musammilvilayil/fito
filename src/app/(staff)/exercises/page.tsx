import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { equipmentList } from "@/server/modules/exercises/service";
import { ExerciseLibrary } from "./exercise-library";

export const metadata: Metadata = { title: "Exercise library" };

export default async function ExercisesPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "workouts.manage")) return <AccessDenied />;
  const equipment = await inGym(ctx, (tx) => equipmentList(tx, ctx));
  return (
    <>
      <PageHeader
        title="Exercise library"
        description="820+ exercises with instructions and images (public-domain free-exercise-db), plus your gym's own."
      />
      <ExerciseLibrary equipment={equipment} canCreate={hasPermission(ctx, "exercises.manage")} />
    </>
  );
}
