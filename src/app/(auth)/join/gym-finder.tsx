"use client";

import { Check, Loader2, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

type Gym = { id: string; name: string; city: string | null; state: string; joined: boolean };

export function GymFinder({ backHref }: { backHref: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  // The query the shown gyms answer; while a newer search runs they're dimmed and can't be tapped.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ gyms: Gym[] }>(`/gyms/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((d) => {
          setGyms(d.gyms);
          setShownFor(q);
          setError(null);
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setError(errorMessage(err));
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  async function join(g: Gym) {
    setJoining(g.id);
    try {
      await api("/gyms/join", { body: { gymId: g.id } });
      toast.success(g.joined ? `Switched to ${g.name}` : `You've joined ${g.name}`);
      router.replace("/go");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setJoining(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input aria-label="Search gyms" className="pl-9" placeholder="Gym name or city" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {gyms === null ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-5 animate-spin text-lime" />
        </div>
      ) : gyms.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No gyms found. Check the spelling, or ask your gym for an invite link.</p>
      ) : (
        <ul
          className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white/60 transition-opacity", shownFor !== q && "pointer-events-none opacity-50")}
          aria-busy={shownFor !== q}
        >
          {gyms.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-[15px] font-bold text-lime">{g.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.name}</span>
                <span className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                  <MapPin className="size-3" /> {[g.city, g.state].filter(Boolean).join(", ")}
                </span>
              </span>
              <Button size="sm" variant={g.joined ? "secondary" : "primary"} loading={joining === g.id} disabled={joining !== null} onClick={() => void join(g)} aria-label={`${g.joined ? "Open" : "Join"} ${g.name}`}>
                {g.joined ? (
                  <>
                    <Check /> Open
                  </>
                ) : (
                  "Join"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {backHref && (
        <p className="text-center text-sm">
          <Link href={backHref} className="text-ink-muted hover:text-ink">
            Back to my gym
          </Link>
        </p>
      )}
    </div>
  );
}
