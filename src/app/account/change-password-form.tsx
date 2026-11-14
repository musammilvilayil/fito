"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { changePasswordSchema } from "@/shared/schemas/auth";

export function ChangePasswordForm() {
  const { form, formError, run, errors, submitting } = useApiForm(changePasswordSchema, {
    currentPassword: "",
    newPassword: "",
  });
  return (
    <Card>
      <CardHeader title="Change password" />
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/auth/change-password", { body: values });
              toast.success("Password changed");
              form.reset();
            });
          }}
        >
          <Field label="Current password" htmlFor="currentPassword" error={fieldError(errors, "currentPassword")}>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={fieldError(errors, "newPassword")} hint="At least 8 characters">
            <Input id="newPassword" type="password" autoComplete="new-password" {...form.register("newPassword")} />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
