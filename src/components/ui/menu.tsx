"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[200px] rounded-xl border border-line bg-panel p-1 shadow-[0_16px_40px_-16px_rgb(29_70_60/0.35)] data-[state=open]:animate-fade-in"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none [&_svg]:size-4",
        danger ? "text-danger data-[highlighted]:bg-danger/10" : "text-ink data-[highlighted]:bg-overlay",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      )}
    >
      {children}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
