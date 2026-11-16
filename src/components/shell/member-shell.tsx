"use client";

import { Bell, Building2, Check, Dumbbell, Home, KeyRound, LineChart, LogOut, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/page";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DemoBadge } from "./staff-shell";

const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/me", label: "Home", icon: Home, exact: true },
  { href: "/me/workouts", label: "Workout", icon: Dumbbell },
  { href: "/me/progress", label: "Progress", icon: LineChart },
  { href: "/me/assistant", label: "Ask", icon: Sparkles },
  { href: "/me/profile", label: "Profile", icon: UserRound },
];

export type MemberShellGym = { gymId: string; gymName: string; roleLabel: string };

export function MemberShell({
  demo = false,
  gymName,
  gymId,
  userName,
  unread,
  gyms,
  children,
}: {
  gymName: string;
  gymId: string;
  userName: string;
  unread: number;
  gyms: MemberShellGym[];
  demo?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (t: (typeof TABS)[number]) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`));

  async function switchGym(id: string) {
    try {
      await api("/auth/switch-gym", { body: { gymId: id } });
      router.push("/go");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/50 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Logo href="/me" size="sm" />
          <span className="min-w-0 flex-1 truncate border-l border-line pl-3 text-[13px] text-ink-muted">{gymName}</span>
          {demo && <DemoBadge />}
          <Link
            href="/me#updates"
            aria-label={unread ? `Updates (${unread} unread)` : "Updates"}
            className="relative grid size-9 place-items-center rounded-full text-ink-muted hover:bg-white hover:text-ink"
          >
            <Bell className="size-[18px]" />
            {unread > 0 && (
              <span className="tabular absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-lime px-1 text-[10px] font-bold leading-4 text-lime-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Menu
            align="end"
            trigger={
              <button className="rounded-full" aria-label="Account menu">
                <Avatar name={userName} size={32} />
              </button>
            }
          >
            <MenuLabel>{userName}</MenuLabel>
            {gyms.length > 1 && <MenuLabel>Switch gym</MenuLabel>}
            {gyms.length > 1 &&
              gyms.map((g) => (
                <MenuItem key={g.gymId} onSelect={() => g.gymId !== gymId && void switchGym(g.gymId)}>
                  <span className="flex-1 truncate">{g.gymName}</span>
                  <span className="text-[11px] text-ink-subtle">{g.roleLabel}</span>
                  {g.gymId === gymId && <Check className="text-lime" />}
                </MenuItem>
              ))}
            <MenuItem onSelect={() => router.push("/join")}>
              <Building2 /> Join another gym
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => router.push("/account")}>
              <KeyRound /> Account &amp; password
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => void signOut()} danger>
              <LogOut /> Sign out
            </MenuItem>
          </Menu>
        </div>
        <nav aria-label="Member" className="mx-auto hidden max-w-3xl gap-1 px-4 pb-2.5 md:flex">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isActive(t) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
                isActive(t) ? "bg-white text-ink shadow-[0_1px_2px_rgb(29_56_50/0.08),0_4px_12px_-6px_rgb(29_70_60/0.3)]" : "text-ink-muted hover:bg-white/50 hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-7">{children}</main>

      <nav
        aria-label="Member tabs"
        className="glass-strong fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 rounded-[26px] border md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 p-1.5">
          {TABS.map((t) => {
            const active = isActive(t);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium transition-colors",
                    active ? "bg-lime-soft text-lime" : "text-ink-subtle",
                  )}
                >
                  <t.icon className="size-5" aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
