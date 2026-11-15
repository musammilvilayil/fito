import { ArrowRight, BarChart3, CalendarClock, CreditCard, Dumbbell, QrCode, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth/page";

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Memberships that renew themselves on time",
    body: "Monthly to annual plans, admission fees, discounts and freezes. FITO tracks every expiry and shows who to call this week.",
  },
  {
    icon: CreditCard,
    title: "Every rupee recorded",
    body: "Cash, UPI and card payments with numbered receipts, outstanding dues and daily collection reports.",
  },
  {
    icon: QrCode,
    title: "QR check-in in two seconds",
    body: "Each member gets a personal QR code. Scan it at the desk, and FITO blocks expired memberships and double check-ins.",
  },
  {
    icon: Sparkles,
    title: "AI workouts, trainer-approved",
    body: "AI drafts a plan from the member's goal, level and limitations. Nothing reaches the member until a trainer approves it.",
  },
  {
    icon: Smartphone,
    title: "A member app they'll actually open",
    body: "Members see their plan, today's workout, attendance streak, payments and progress, all on their phone.",
  },
  {
    icon: BarChart3,
    title: "Numbers that run the business",
    body: "Active members, renewals, revenue and attendance trends without spreadsheets.",
  },
];

export default async function LandingPage() {
  const session = await getSession();
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        style={{ background: "radial-gradient(760px 420px at 28% -60px, rgb(31 157 122 / 0.14), transparent 70%)" }}
        aria-hidden
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          {session ? (
            <Button asChild size="sm">
              <Link href="/go">Open FITO</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/register">Set up your gym</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:pb-24">
        <div className="relative max-w-3xl animate-rise">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-ink-muted">
            <span className="size-1.5 rounded-full bg-lime" aria-hidden /> Built for independent gyms in Kerala
          </div>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[60px]">
            Run your gym.
            <br />
            <span className="text-lime">Coach every member.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            FITO brings memberships, payments, QR attendance and trainer-approved AI workouts into one place for gym owners,
            trainers and members.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={session ? "/go" : "/register"}>
                {session ? "Open your dashboard" : "Set up your gym"} <ArrowRight />
              </Link>
            </Button>
            {!session && (
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">I&apos;m a member or trainer</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-canvas px-6 py-8 sm:px-8">
              <f.icon className="size-5 text-lime" aria-hidden />
              <h2 className="mt-4 text-[16px] font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <Dumbbell className="size-6 text-lime" aria-hidden />
          <h2 className="mt-4 text-[28px] font-semibold tracking-tight">Technology that supports trainers, not replaces them</h2>
          <p className="mt-4 leading-relaxed text-ink-muted">
            AI only drafts plans from your own exercise library, checks them against safety rules and the member&apos;s
            reported limitations, then hands them to a trainer. Every plan has a version history and a named approver.
          </p>
        </div>
        <div>
          <ShieldCheck className="size-6 text-lime" aria-hidden />
          <h2 className="mt-4 text-[28px] font-semibold tracking-tight">Each gym&apos;s data stays with that gym</h2>
          <p className="mt-4 leading-relaxed text-ink-muted">
            FITO is built for many gyms on one platform. Isolation is enforced by the database itself, so one gym can never
            see another gym&apos;s members, payments or workouts.
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-[13px] text-ink-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} FITO</span>
          <span>AI suggestions are not medical advice. Trainers approve every plan.</span>
        </div>
      </footer>
    </div>
  );
}
