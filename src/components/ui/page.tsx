import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-lime">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14.5px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "lime" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 overflow-hidden glass rounded-[var(--radius-card)] border p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-muted">{label}</span>
        {Icon && (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full",
              tone === "lime" && "bg-lime-soft text-lime",
              tone === "warning" && "bg-warning/12 text-warning",
              tone === "danger" && "bg-danger/10 text-danger",
              tone === "default" && "bg-[rgb(29_56_50/0.06)] text-ink-subtle",
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="tabular mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[32px]">{value}</div>
      {hint && <div className="mt-2 truncate text-[12px] text-ink-subtle">{hint}</div>}
    </div>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const letters = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
  // Stable hue from the name so avatars are easy to tell apart.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["#d3eee2", "#d9e7f7", "#e7def6", "#fbe1cf", "#f4e6c4", "#f6d9e1"];
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full border border-white font-semibold text-ink", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: hues[hash % hues.length] }}
      aria-hidden
    >
      {letters}
    </span>
  );
}
