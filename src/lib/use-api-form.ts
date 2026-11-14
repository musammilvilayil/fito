"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import type { z } from "zod";
import { ApiError, errorMessage } from "./api";

/**
 * react-hook-form + the shared Zod schema for instant validation. Forms
 * submit the raw (untransformed) values; the API validates them again with
 * the same schema, so business rules live in one place.
 */
export function useApiForm<S extends z.ZodType<unknown, FieldValues>>(
  schema: S,
  defaultValues: DefaultValues<z.input<S> & FieldValues>,
) {
  type Values = z.input<S> & FieldValues;
  const form = useForm<Values>({
    // raw: submit what the user typed; the server applies transforms.
    resolver: zodResolver(schema as never, undefined, { raw: true }) as never,
    defaultValues,
    mode: "onTouched",
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function run(action: (values: Values) => Promise<void>) {
    setFormError(null);
    await form.handleSubmit(async (values) => {
      try {
        await action(values);
      } catch (err) {
        if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
          let matched = false;
          for (const [field, message] of Object.entries(err.fieldErrors)) {
            if (field in (form.getValues() as object)) {
              form.setError(field as Path<Values>, { message });
              matched = true;
            }
          }
          if (!matched) setFormError(err.message);
        } else {
          setFormError(errorMessage(err));
        }
      }
    })();
  }

  return { form, formError, setFormError, run, errors: form.formState.errors, submitting: form.formState.isSubmitting };
}

export function fieldError(errors: Record<string, unknown>, name: string): string | undefined {
  const e = errors[name] as { message?: string } | undefined;
  return e?.message;
}
