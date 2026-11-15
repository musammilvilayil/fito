import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { LinkTabs } from "@/components/ui/tabs";
import { requireStaffContext } from "@/server/auth/page";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaffContext();
  const tabs = [
    ...(ctx.permissions.has("gym.manage") ? [{ href: "/settings", label: "Gym profile", exact: true }] : []),
    ...(ctx.permissions.has("staff.manage") ? [{ href: "/settings/staff", label: "Staff & roles" }] : []),
  ];
  if (tabs.length === 0) return <AccessDenied />;
  return (
    <>
      <PageHeader title="Settings" description="Your gym's profile, operating rules and team." />
      <LinkTabs tabs={tabs} />
      {children}
    </>
  );
}
