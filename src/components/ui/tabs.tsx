"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Link-based tabs (each tab is its own URL, so it works with back/forward and sharing). */
export function LinkTabs({ tabs, className }: { tabs: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <div className={cn("mb-6 flex gap-1 overflow-x-auto border-b border-line", className)} role="tablist">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative whitespace-nowrap px-3.5 pb-3 pt-1 text-[13.5px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-lime" aria-hidden />}
          </Link>
        );
      })}
    </div>
  );
}
