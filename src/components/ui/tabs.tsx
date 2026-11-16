"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Link-based tabs (each tab is its own URL, so it works with back/forward and sharing). */
export function LinkTabs({ tabs, className }: { tabs: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <div className={cn("mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-white/70 bg-white/45 p-1 backdrop-blur-md", className)} role="tablist">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
              active ? "bg-white text-ink shadow-[0_1px_2px_rgb(29_56_50/0.08),0_4px_12px_-6px_rgb(29_70_60/0.3)]" : "text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
