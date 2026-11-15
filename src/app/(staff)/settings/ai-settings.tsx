"use client";

import { CircleAlert, CircleCheck, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { aiSettingsSchema, type AiSettingsInput } from "@/shared/schemas/assistant";

export type AiStatus = {
  connected: boolean;
  provider: string | null;
  model: string;
  usage: {
    workouts: { calls: number; limit: number; costUsd: number };
    assistant: { turns: number; people: number; failed: number; costUsd: number };
  };
};

export function AiSettingsCard({ status, initial }: { status: AiStatus; initial: AiSettingsInput }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(aiSettingsSchema, initial);
  const reg = form.register;
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const cost = status.usage.workouts.costUsd + status.usage.assistant.costUsd;

  async function testConnection() {
    setTesting(true);
    setTest(null);
    try {
      const r = await api<{ ok: true; model: string; latencyMs: number } | { ok: false; message: string }>("/ai/test", { method: "POST" });
      setTest(r.ok ? { ok: true, message: `Connected to ${r.model} in ${(r.latencyMs / 1000).toFixed(1)}s.` } : { ok: false, message: r.message });
    } catch (err) {
      setTest({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="AI"
        description="Workout drafts for trainers and the in-app assistant for members and staff."
        action={status.connected ? <Badge tone="success" dot>Connected</Badge> : <Badge tone="warning">Not connected</Badge>}
      />
      <CardBody className="space-y-5">
        {status.connected ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink-muted">
              Model <span className="font-medium text-ink">{status.model}</span>
              {status.provider === "fake" && " (test stand-in)"}
            </span>
            <Button variant="secondary" size="sm" loading={testing} onClick={() => void testConnection()}>
              <PlugZap /> Test connection
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-[13px] text-ink-muted">
            <p className="font-medium text-ink">AI is off until the server has an Anthropic API key.</p>
            <p className="mt-1">
              Whoever runs your hosting adds <code className="rounded bg-raised px-1">ANTHROPIC_API_KEY</code> to the server&apos;s environment variables and
              redeploys (see the deployment guide). The key stays on the server; it is never shown here or sent to browsers. Until then, workout drafts come from
              FITO&apos;s templates and the assistant is hidden from members.
            </p>
          </div>
        )}
        {test && (
          <p role="status" className={`flex items-start gap-2 text-[13px] ${test.ok ? "text-success" : "text-danger"}`}>
            {test.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {test.message}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Assistant replies" value={String(status.usage.assistant.turns)} hint="this month" />
          <Stat label="People using it" value={String(status.usage.assistant.people)} hint="this month" />
          <Stat label="Workout drafts" value={`${status.usage.workouts.calls} / ${status.usage.workouts.limit}`} hint="this month" />
          <Stat label="Estimated AI cost" value={`$${cost.toFixed(2)}`} hint="this month, USD" />
        </dl>

        <form
          noValidate
          className="space-y-4 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/gym/ai", { method: "PATCH", body: values });
              toast.success("AI settings saved");
              router.refresh();
            });
          }}
        >
          <fieldset className="space-y-2.5">
            <legend className="mb-1 text-[13px] font-medium text-ink-muted">Who can use the assistant</legend>
            <Checkbox label="Members (in their app)" {...reg("assistantMembers")} />
            <Checkbox label="Staff (owners, managers, trainers, front desk)" {...reg("assistantStaff")} />
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Assistant messages per person each month"
              htmlFor="assistantMonthlyMessagesPerUser"
              error={fieldError(errors, "assistantMonthlyMessagesPerUser")}
              hint="Keeps costs predictable. Resets on the 1st."
            >
              <Input id="assistantMonthlyMessagesPerUser" type="number" min={1} max={5000} {...reg("assistantMonthlyMessagesPerUser")} />
            </Field>
            <Field label="AI workout drafts per month (whole gym)" htmlFor="aiMonthlyLimit" error={fieldError(errors, "aiMonthlyLimit")} hint="After this, drafts use templates.">
              <Input id="aiMonthlyLimit" type="number" min={0} max={5000} {...reg("aiMonthlyLimit")} />
            </Field>
          </div>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              Save AI settings
            </Button>
          </div>
        </form>
        <p className="text-[12px] text-ink-subtle">
          Conversations are private to each person; owners see only these totals. The assistant reads data through the same permissions as the person asking and can&apos;t
          change anything without their confirmation.
        </p>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-raised/40 p-3">
      <dt className="truncate text-[12px] text-ink-subtle">{label}</dt>
      <dd className="tabular mt-1 text-[18px] font-semibold">{value}</dd>
      <dd className="text-[11.5px] text-ink-subtle">{hint}</dd>
    </div>
  );
}
