"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function StaffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <EmptyState
        icon={AlertTriangle}
        title="This page couldn't load"
        description={
          <>
            Something went wrong on our side. Try again; if it keeps happening, share this code with support:{" "}
            <code className="text-ink">{error.digest ?? "n/a"}</code>
          </>
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
