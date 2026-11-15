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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-lime">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
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
    <div className={cn("relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-muted">{label}</span>
        {Icon && (
          <Icon
            className={cn(
              "size-4",
              tone === "lime" && "text-lime",
              tone === "warning" && "text-warning",
              tone === "danger" && "text-danger",
              tone === "default" && "text-ink-subtle",
            )}
            aria-hidden
          />
        )}
      </div>
      <div className="tabular mt-2.5 text-[26px] font-semibold leading-none tracking-tight text-ink sm:text-[28px]">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-ink-subtle">{hint}</div>}
      {tone === "lime" && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime/60 to-transparent" aria-hidden />}
    </div>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const letters = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
  // Stable hue from the name so avatars are easy to tell apart.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["#3b4a2a", "#24414a", "#3d3350", "#4a3a26", "#2b3f52", "#4a2f37"];
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full border border-white/10 font-semibold text-ink", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: hues[hash % hues.length] }}
      aria-hidden
    >
      {letters}
    </span>
  );
}
