"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { financialYear } from "@/shared/dates";
import {
  gymProfileSchema,
  gymSettingsSchema,
  type GymProfileInput,
  type GymSettingsInput,
} from "@/shared/schemas/gym";

export function GymProfileForm({ initial }: { initial: GymProfileInput }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(gymProfileSchema, initial);
  const reg = form.register;
  const prefix = useWatch({ control: form.control, name: "receiptPrefix" }) as string | undefined;
  return (
    <Card>
      <CardHeader title="Gym profile" description="Shown on receipts, invites and the member app." />
      <CardBody>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/gym", { method: "PATCH", body: values });
              toast.success("Gym profile saved");
              router.refresh();
            });
          }}
        >
          <Field label="Gym name" htmlFor="name" required error={fieldError(errors, "name")} className="sm:col-span-2">
            <Input id="name" {...reg("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fieldError(errors, "phone")}>
            <Input id="phone" type="tel" {...reg("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldError(errors, "email")}>
            <Input id="email" type="email" {...reg("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Address" htmlFor="addressLine" error={fieldError(errors, "addressLine")} className="sm:col-span-2">
            <Input id="addressLine" placeholder="Building, street, area" {...reg("addressLine")} />
          </Field>
          <Field label="City" htmlFor="city" error={fieldError(errors, "city")}>
            <Input id="city" {...reg("city")} />
          </Field>
          <Field label="State" htmlFor="state" required error={fieldError(errors, "state")}>
            <Input id="state" {...reg("state")} />
          </Field>
          <Field label="PIN code" htmlFor="pincode" error={fieldError(errors, "pincode")}>
            <Input id="pincode" inputMode="numeric" maxLength={6} {...reg("pincode")} aria-invalid={!!errors.pincode} />
          </Field>
          <Field label="GSTIN" htmlFor="gstin" error={fieldError(errors, "gstin")} hint="Optional. Printed on receipts if set.">
            <Input id="gstin" maxLength={15} {...reg("gstin")} aria-invalid={!!errors.gstin} />
          </Field>
          <Field
            label="Receipt prefix"
            htmlFor="receiptPrefix"
            required
            error={fieldError(errors, "receiptPrefix")}
            hint={`Receipts are numbered like ${(prefix || "FITO").toUpperCase()}/${financialYear(new Date().toISOString().slice(0, 10))}/0001`}
          >
            <Input id="receiptPrefix" maxLength={6} {...reg("receiptPrefix")} aria-invalid={!!errors.receiptPrefix} />
          </Field>
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={submitting}>
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function GymSettingsForm({ initial, equipment }: { initial: GymSettingsInput; equipment: { items: number; categories: string[] } }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(gymSettingsSchema, initial);
  const reg = form.register;
  return (
    <Card>
      <CardHeader title="Operations" description="Rules FITO uses for reminders, check-ins and workouts." />
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/gym/settings", { method: "PATCH", body: values });
              toast.success("Settings saved");
              router.refresh();
            });
          }}
        >
          <Field
            label="Flag memberships as expiring (days before)"
            htmlFor="expiringSoonDays"
            error={fieldError(errors, "expiringSoonDays")}
          >
            <Input id="expiringSoonDays" type="number" min={1} max={60} {...reg("expiringSoonDays")} />
          </Field>
          <Field
            label="Typical visit length (minutes)"
            htmlFor="sessionMinutes"
            error={fieldError(errors, "sessionMinutes")}
            hint="Used to estimate how many people are inside right now."
          >
            <Input id="sessionMinutes" type="number" min={15} max={480} {...reg("sessionMinutes")} />
          </Field>
          <Field label="Opening hours" htmlFor="openingHours" error={fieldError(errors, "openingHours")}>
            <Input id="openingHours" placeholder="Mon–Sat 5:00–22:00, Sun 6:00–11:00" {...reg("openingHours")} />
          </Field>
          <Field
            label="Comfortable capacity (people at once)"
            htmlFor="crowdCapacity"
            error={fieldError(errors, "crowdCapacity")}
            hint="Members see how busy the gym is against this number."
          >
            <Input id="crowdCapacity" type="number" min={5} max={2000} {...reg("crowdCapacity")} />
          </Field>
          <Checkbox label="Let people find this gym in the FITO app and join it themselves" {...reg("allowMemberSignup")} />

          <fieldset className="space-y-3 rounded-2xl bg-raised/70 p-4">
            <legend className="sr-only">Batches</legend>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">Morning and evening batches</div>
              <p className="text-[12px] text-ink-subtle">Set each member&apos;s batch on their profile. &ldquo;Any time&rdquo; members can come whenever you&apos;re open.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Morning from" htmlFor="morningStart" error={fieldError(errors, "morningStart")}>
                <Input id="morningStart" type="time" {...reg("morningStart")} />
              </Field>
              <Field label="Morning until" htmlFor="morningEnd" error={fieldError(errors, "morningEnd")}>
                <Input id="morningEnd" type="time" {...reg("morningEnd")} />
              </Field>
              <Field label="Evening from" htmlFor="eveningStart" error={fieldError(errors, "eveningStart")}>
                <Input id="eveningStart" type="time" {...reg("eveningStart")} />
              </Field>
              <Field label="Evening until" htmlFor="eveningEnd" error={fieldError(errors, "eveningEnd")}>
                <Input id="eveningEnd" type="time" {...reg("eveningEnd")} />
              </Field>
            </div>
            <Field
              label="When someone comes outside their batch"
              htmlFor="batchPolicy"
              error={fieldError(errors, "batchPolicy")}
              hint="Applies to the front-desk scanner and the entrance QR. Members can't override."
            >
              <Select id="batchPolicy" {...reg("batchPolicy")}>
                <option value="warn">Allow, with a warning</option>
                <option value="enforce">Refuse (owner or manager can override)</option>
                <option value="off">Ignore batches</option>
              </Select>
            </Field>
          </fieldset>

          <div className="flex items-center gap-3 rounded-2xl bg-raised/70 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">Equipment</div>
              <p className="text-[12px] text-ink-subtle">
                {equipment.items
                  ? `${equipment.items} item${equipment.items === 1 ? "" : "s"} on your list. Workouts use exercises for: ${equipment.categories.join(", ")}.`
                  : "No equipment list yet. Add what you have so workout plans only use exercises your gym can do."}
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/equipment">{equipment.items ? "Manage" : "Add equipment"}</Link>
            </Button>
          </div>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              Save settings
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
