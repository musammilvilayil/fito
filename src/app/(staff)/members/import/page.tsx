import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { hasPermission } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import members" };

export default async function ImportPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "members.manage")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import members"
        description="Bring in your existing register from Excel or CSV. Nothing is saved until you confirm."
      />
      <ImportWizard />
    </div>
  );
}
