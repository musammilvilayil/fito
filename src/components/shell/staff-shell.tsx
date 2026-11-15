"use client";

import {
  BarChart3,
  Check,
  ChevronsUpDown,
  CreditCard,
  Dumbbell,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  ScanLine,
  Settings,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/page";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { NavItem, NavKey } from "./nav";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  assistant: Sparkles,
  members: Users,
  attendance: ScanLine,
  payments: CreditCard,
  plans: ListChecks,
  workouts: Dumbbell,
  exercises: Dumbbell,
  reports: BarChart3,
  settings: Settings,
};

const SECTION_LABELS = { main: null, training: "Training", admin: "Manage" } as const;

export type ShellGym = { gymId: string; gymName: string; roleLabel: string };

/** Small marker on gyms filled with sample data (scripts/seed-demo.ts). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-warning", className)}>
      Demo data
    </span>
  );
}

export function StaffShell({
  demo = false,
  nav,
  gymName,
  gymId,
  roleLabel,
  userName,
  gyms,
  children,
}: {
  nav: NavItem[];
  gymName: string;
  gymId: string;
  roleLabel: string;
  userName: string;
  gyms: ShellGym[];
  demo?: boolean;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <SidebarContent
      demo={demo}
      nav={nav}
      gymName={gymName}
      gymId={gymId}
      roleLabel={roleLabel}
      userName={userName}
      gyms={gyms}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="min-h-dvh lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-line bg-surface/60 lg:flex lg:flex-col">
        {sidebar}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" size="sm" />
        {demo && <DemoBadge className="ml-auto mr-2" />}
        <button
          className="rounded-lg p-2 text-ink-muted hover:bg-raised hover:text-ink"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <MenuIcon className="size-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-[300px] flex-col border-r border-line bg-surface animate-rise">
            <button
              className="absolute right-3 top-3 rounded-lg p-2 text-ink-muted hover:bg-raised"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}

function SidebarContent({
  demo,
  nav,
  gymName,
  gymId,
  roleLabel,
  userName,
  gyms,
  onNavigate,
}: {
  nav: NavItem[];
  gymName: string;
  gymId: string;
  roleLabel: string;
  userName: string;
  gyms: ShellGym[];
  demo: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = (["main", "training", "admin"] as const).map((s) => ({
    key: s,
    label: SECTION_LABELS[s],
    items: nav.filter((n) => n.section === s),
  }));

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
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo href="/dashboard" size="sm" />
      </div>

      <div className="px-3">
        <Menu
          align="start"
          trigger={
            <button className="flex w-full items-center gap-3 rounded-xl border border-line bg-raised/70 px-3 py-2.5 text-left hover:border-line-strong">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-[13px] font-bold text-lime-ink">
                {gymName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{gymName}</span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
                  {roleLabel}
                  {demo && <DemoBadge />}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" />
            </button>
          }
        >
          <MenuLabel>Your gyms</MenuLabel>
          {gyms.map((g) => (
            <MenuItem key={g.gymId} onSelect={() => g.gymId !== gymId && void switchGym(g.gymId)}>
              <span className="flex-1 truncate">{g.gymName}</span>
              <span className="text-[11px] text-ink-subtle">{g.roleLabel}</span>
              {g.gymId === gymId && <Check className="text-lime" />}
            </MenuItem>
          ))}
        </Menu>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {sections.map((section) =>
          section.items.length === 0 ? null : (
            <div key={section.key} className="mb-4">
              {section.label && (
                <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-subtle">{section.label}</div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                          active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink",
                        )}
                      >
                        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-lime" aria-hidden />}
                        <Icon className={cn("size-[17px]", active ? "text-lime" : "text-ink-subtle group-hover:text-ink-muted")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-line p-3">
        <Menu
          align="start"
          trigger={
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-raised">
              <Avatar name={userName} size={32} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{userName}</span>
              <ChevronsUpDown className="size-4 text-ink-subtle" />
            </button>
          }
        >
          <MenuItem onSelect={() => router.push("/account")}>
            <KeyRound /> Account &amp; password
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void signOut()} danger>
            <LogOut /> Sign out
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
