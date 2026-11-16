import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full min-w-0 rounded-xl border border-[rgb(29_56_50/0.14)] bg-white/75 px-3.5 text-sm text-ink placeholder:text-ink-subtle transition-[border-color,box-shadow,background-color] " +
  "hover:border-line-strong focus:border-lime/60 focus:bg-white focus:outline-none focus:ring-4 focus:ring-lime/12 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:focus:ring-danger/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-[88px] py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        control,
        "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23576465' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-muted">
        {label}
        {required && <span className="ml-0.5 text-lime">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const CHECKBOX_CLASS =
  "size-4 shrink-0 cursor-pointer appearance-none rounded border border-line-strong bg-raised bg-center bg-no-repeat " +
  "checked:border-lime checked:bg-lime " +
  "checked:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3.5'%3E%3Cpath d='m5 12 5 5 9-10'/%3E%3C/svg%3E\")]";

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-ink", className)}>
      <input
        type="checkbox"
        className={CHECKBOX_CLASS}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}
