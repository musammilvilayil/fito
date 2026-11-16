"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[rgb(20_40_35/0.22)] backdrop-blur-[6px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            "glass-strong fixed z-50 flex max-h-[92dvh] w-full flex-col border focus:outline-none",
            "bottom-0 left-0 rounded-t-[28px] data-[state=open]:animate-rise",
            "sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-lg",
            size === "lg" && "sm:max-w-2xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
            <div>
              <D.Title className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-[13px] text-ink-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
              )}
            </div>
            <D.Close className="-mr-1 rounded-full p-1.5 text-ink-subtle hover:bg-white hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-6 pb-6 pt-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
