import { Check, Minus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Permission } from "@/shared/permissions";

export function RoleMatrix({
  roles,
  permissionLabels,
}: {
  roles: { role: string; label: string; description: string; permissions: Permission[] }[];
  permissionLabels: Record<Permission, string>;
}) {
  const all = Object.keys(permissionLabels) as Permission[];
  return (
    <Card>
      <CardHeader
        title="What each role can do"
        description="Roles are fixed during the pilot. Change a person's role from the staff list above."
      />
      <div className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((r) => (
          <div key={r.role} className="bg-surface px-5 py-4">
            <div className="text-sm font-semibold">{r.label}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{r.description}</p>
          </div>
        ))}
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Permission</TH>
            {roles.map((r) => (
              <TH key={r.role} className="text-center">
                {r.label}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {all.map((p) => (
            <TR key={p}>
              <TD className="text-[13px] text-ink-muted">{permissionLabels[p]}</TD>
              {roles.map((r) => (
                <TD key={r.role} className="text-center">
                  {r.permissions.includes(p) ? (
                    <Check className="mx-auto size-4 text-lime" aria-label="Allowed" />
                  ) : (
                    <Minus className="mx-auto size-4 text-ink-subtle/50" aria-label="Not allowed" />
                  )}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
