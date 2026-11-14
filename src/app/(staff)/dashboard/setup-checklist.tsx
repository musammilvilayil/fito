import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import type { SetupStatus } from "@/server/modules/gyms/setup";

type Step = { done: boolean; title: string; description: string; href: string; cta: string; show: boolean };

export function SetupChecklist({
  status,
  canManageGym,
  canManageStaff,
}: {
  status: SetupStatus;
  canManageGym: boolean;
  canManageStaff: boolean;
}) {
  const steps: Step[] = [
    {
      done: status.profileComplete,
      title: "Complete your gym profile",
      description: "Address and phone appear on receipts and the member app.",
      href: "/settings",
      cta: "Edit profile",
      show: canManageGym,
    },
    {
      done: status.staff > 0,
      title: "Invite your team",
      description: "Add trainers and front-desk staff. Each gets their own login and role.",
      href: "/settings/staff",
      cta: "Invite staff",
      show: canManageStaff,
    },
  ].filter((s) => s.show);

  if (steps.length === 0 || steps.every((s) => s.done)) return null;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader
        title="Get your gym ready"
        description={`${doneCount} of ${steps.length} steps done`}
        action={
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-overlay" aria-hidden>
            <div className="h-full rounded-full bg-lime" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        }
      />
      <ul className="divide-y divide-line">
        {steps.map((step) => (
          <li key={step.title} className="flex items-center gap-4 px-5 py-4">
            {step.done ? (
              <CheckCircle2 className="size-5 shrink-0 text-lime" aria-label="Done" />
            ) : (
              <Circle className="size-5 shrink-0 text-ink-subtle" aria-label="Not done" />
            )}
            <div className="min-w-0 flex-1">
              <div className={step.done ? "text-sm text-ink-muted line-through decoration-ink-subtle" : "text-sm font-medium"}>
                {step.title}
              </div>
              {!step.done && <div className="mt-0.5 text-[12.5px] text-ink-muted">{step.description}</div>}
            </div>
            {!step.done && (
              <Link href={step.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-lime hover:underline">
                {step.cta} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
