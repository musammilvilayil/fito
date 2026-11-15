"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/shared/dates";

type Item = { id: string; title: string; body: string | null; link: string | null; read: boolean; at: string };

export function Updates({ items, unread, timezone }: { items: Item[]; unread: number; timezone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markRead(ids: string[] | "all") {
    setBusy(true);
    try {
      await api("/notifications", { body: { ids } });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function open(item: Item) {
    if (!item.read) await api("/notifications", { body: { ids: [item.id] } }).catch(() => undefined);
    if (item.link) router.push(item.link);
    router.refresh();
  }

  return (
    <Card id="updates" className="scroll-mt-20">
      <CardHeader
        title="Updates"
        description={unread ? `${unread} new` : undefined}
        action={
          unread > 0 && (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => void markRead("all")}>
              Mark all read
            </Button>
          )
        }
      />
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-muted">
          <Bell className="size-4 text-ink-subtle" /> Nothing new. Your gym&apos;s updates show up here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => void open(n)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-raised/50">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-lime")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.read && "font-medium")}>
                    {n.title}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="block text-[13px] text-ink-muted">{n.body}</span>}
                  <span className="block text-[12px] text-ink-subtle">{formatDateTime(n.at, timezone)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
