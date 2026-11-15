"use client";

import { Archive, ListChecks, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { durationLabel } from "@/shared/membership";
import { formatINR } from "@/shared/money";
import { PLAN_PRESETS, planSchema, type PlanInput } from "@/shared/schemas/billing";

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  durationUnit: "days" | "months";
  durationValue: number;
  pricePaise: number;
  admissionFeePaise: number;
  isActive: boolean;
  activeMemberships: number;
};

const rupees = (paise: number) => (paise / 100).toString();

function toInput(p: PlanRow): PlanInput {
  return {
    name: p.name,
    description: p.description ?? "",
    durationUnit: p.durationUnit,
    durationValue: p.durationValue,
    price: rupees(p.pricePaise),
    admissionFee: rupees(p.admissionFeePaise),
    isActive: p.isActive,
  };
}

export function PlansManager({ plans, canManage }: { plans: PlanRow[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; initial: PlanInput } | null>(null);
  const active = plans.filter((p) => p.isActive);
  const archived = plans.filter((p) => !p.isActive);

  async function toggleActive(p: PlanRow) {
    try {
      await api(`/plans/${p.id}`, { method: "PATCH", body: { ...toInput(p), isActive: !p.isActive } });
      toast.success(p.isActive ? `${p.name} archived` : `${p.name} restored`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const newPlan = (preset?: (typeof PLAN_PRESETS)[number]) =>
    setEditing({
      id: null,
      initial: {
        name: preset?.name ?? "",
        description: "",
        durationUnit: preset?.durationUnit ?? "months",
        durationValue: preset?.durationValue ?? 1,
        price: "",
        admissionFee: "0",
        isActive: true,
      },
    });

  return (
    <>
      {canManage && plans.length > 0 && (
        <div className="mb-5 flex justify-end">
          <Button onClick={() => newPlan()}>
            <Plus /> New plan
          </Button>
        </div>
      )}

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="Create your membership plans"
            description="Start from a common duration and set your price. You can add custom plans (e.g. 15 days, couple plans) too."
            action={
              canManage && (
                <div className="flex flex-wrap justify-center gap-2">
                  {PLAN_PRESETS.map((p) => (
                    <Button key={p.name} variant="secondary" onClick={() => newPlan(p)}>
                      <Plus /> {p.name}
                    </Button>
                  ))}
                  <Button onClick={() => newPlan()}>Custom plan</Button>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((p) => (
            <PlanCard key={p.id} plan={p} canManage={canManage} onEdit={() => setEditing({ id: p.id, initial: toInput(p) })} onToggle={() => void toggleActive(p)} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-[13px] font-medium uppercase tracking-[0.1em] text-ink-subtle">Archived</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((p) => (
              <PlanCard key={p.id} plan={p} canManage={canManage} onEdit={() => setEditing({ id: p.id, initial: toInput(p) })} onToggle={() => void toggleActive(p)} />
            ))}
          </div>
        </>
      )}

      {editing && (
        <PlanDialog
          planId={editing.id}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function PlanCard({ plan, canManage, onEdit, onToggle }: { plan: PlanRow; canManage: boolean; onEdit: () => void; onToggle: () => void }) {
  return (
    <div className={cn("flex flex-col glass rounded-[var(--radius-card)] border p-5", !plan.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold tracking-tight">{plan.name}</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">{durationLabel(plan.durationUnit, plan.durationValue)}</p>
        </div>
        {plan.activeMemberships > 0 && <Badge tone="lime">{plan.activeMemberships} active</Badge>}
      </div>
      <div className="tabular mt-5 text-[28px] font-semibold leading-none tracking-tight">{formatINR(plan.pricePaise)}</div>
      <p className="mt-2 text-[12.5px] text-ink-subtle">
        {plan.admissionFeePaise > 0 ? `+ ${formatINR(plan.admissionFeePaise)} admission for new members` : "No admission fee"}
      </p>
      {plan.description && <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{plan.description}</p>}
      {canManage && (
        <div className="mt-5 flex gap-2 border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {plan.isActive ? <Archive /> : <RotateCcw />} {plan.isActive ? "Archive" : "Restore"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanDialog({ planId, initial, onClose, onSaved }: { planId: string | null; initial: PlanInput; onClose: () => void; onSaved: () => void }) {
  const { form, formError, run, errors, submitting } = useApiForm(planSchema, initial);
  const reg = form.register;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={planId ? `Edit ${initial.name}` : "New plan"}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            if (planId) await api(`/plans/${planId}`, { method: "PATCH", body: values });
            else await api("/plans", { body: values });
            toast.success(planId ? "Plan saved" : "Plan created");
            onSaved();
          });
        }}
      >
        <Field label="Plan name" htmlFor="p-name" required error={fieldError(errors, "name")}>
          <Input id="p-name" placeholder="Monthly" {...reg("name")} aria-invalid={!!errors.name} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration" htmlFor="p-dv" required error={fieldError(errors, "durationValue")}>
            <Input id="p-dv" type="number" min={1} {...reg("durationValue")} />
          </Field>
          <Field label="Unit" htmlFor="p-du">
            <Select id="p-du" {...reg("durationUnit")}>
              <option value="months">Months</option>
              <option value="days">Days</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (₹)" htmlFor="p-price" required error={fieldError(errors, "price")}>
            <Input id="p-price" inputMode="decimal" placeholder="1500" {...reg("price")} aria-invalid={!!errors.price} />
          </Field>
          <Field label="Admission fee (₹)" htmlFor="p-adm" error={fieldError(errors, "admissionFee")} hint="Charged once, to new members">
            <Input id="p-adm" inputMode="decimal" {...reg("admissionFee")} aria-invalid={!!errors.admissionFee} />
          </Field>
        </div>
        <Field label="Description" htmlFor="p-desc" error={fieldError(errors, "description")} hint="Optional, e.g. includes cardio area and locker">
          <Textarea id="p-desc" rows={2} {...reg("description")} />
        </Field>
        <Checkbox label="Available for sale" {...reg("isActive")} />
        <FormError message={formError} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {planId ? "Save plan" : "Create plan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
