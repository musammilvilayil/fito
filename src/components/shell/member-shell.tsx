"use client";

import { Bell, Check, Dumbbell, Home, KeyRound, LineChart, LogOut, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/page";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/me", label: "Home", icon: Home, exact: true },
  { href: "/me/workouts", label: "Workout", icon: Dumbbell },
  { href: "/me/progress", label: "Progress", icon: LineChart },
  { href: "/me/assistant", label: "Ask", icon: Sparkles },
  { href: "/me/profile", label: "Profile", icon: UserRound },
];

export type MemberShellGym = { gymId: string; gymName: string; roleLabel: string };

export function MemberShell({
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
    <div className="min-h-dvh pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Logo href="/me" size="sm" />
          <span className="min-w-0 flex-1 truncate border-l border-line pl-3 text-[13px] text-ink-muted">{gymName}</span>
          <Link
            href="/me#updates"
            aria-label={unread ? `Updates (${unread} unread)` : "Updates"}
            className="relative grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-raised hover:text-ink"
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
            {gyms.length > 1 &&
              gyms.map((g) => (
                <MenuItem key={g.gymId} onSelect={() => g.gymId !== gymId && void switchGym(g.gymId)}>
                  <span className="flex-1 truncate">{g.gymName}</span>
                  <span className="text-[11px] text-ink-subtle">{g.roleLabel}</span>
                  {g.gymId === gymId && <Check className="text-lime" />}
                </MenuItem>
              ))}
            {gyms.length > 1 && <MenuSeparator />}
            <MenuItem onSelect={() => router.push("/account")}>
              <KeyRound /> Account &amp; password
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => void signOut()} danger>
              <LogOut /> Sign out
            </MenuItem>
          </Menu>
        </div>
        <nav aria-label="Member" className="mx-auto hidden max-w-3xl gap-1 px-3 md:flex">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isActive(t) ? "page" : undefined}
              className={cn(
                "relative px-3.5 pb-3 pt-1 text-[13.5px] font-medium transition-colors",
                isActive(t) ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
              {isActive(t) && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-lime" aria-hidden />}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-7">{children}</main>

      <nav
        aria-label="Member tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(t);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-ink-subtle")}
                >
                  <t.icon className={cn("size-5", active && "text-lime")} aria-hidden />
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
