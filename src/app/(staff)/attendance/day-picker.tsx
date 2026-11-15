"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/form";

export function DayPicker({ date, today, prev, next }: { date: string; today: string; prev: string; next: string | null }) {
  const router = useRouter();
  const btn = "grid size-9 place-items-center rounded-lg border border-line text-ink-muted hover:bg-raised hover:text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <Link href={`/attendance?date=${prev}`} className={btn} aria-label="Previous day">
        <ChevronLeft className="size-4" />
      </Link>
      <Input
        type="date"
        aria-label="Day"
        className="h-9 w-[150px]"
        value={date}
        max={today}
        onChange={(e) => e.target.value && router.push(`/attendance?date=${e.target.value}`)}
      />
      {next ? (
        <Link href={`/attendance?date=${next}`} className={btn} aria-label="Next day">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={`${btn} pointer-events-none opacity-40`} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
