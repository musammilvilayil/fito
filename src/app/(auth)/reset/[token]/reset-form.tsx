"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { resetPasswordSchema } from "@/shared/schemas/auth";

export function ResetForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const { form, formError, run, errors, submitting } = useApiForm(resetPasswordSchema, { token, password: "" });

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Your password has been changed.</p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async (values) => {
          await api("/auth/reset-password", { body: values });
          setDone(true);
        });
      }}
    >
      <Field label="New password" htmlFor="password" error={fieldError(errors, "password")} hint="At least 8 characters">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Save new password
      </Button>
    </form>
  );
}
