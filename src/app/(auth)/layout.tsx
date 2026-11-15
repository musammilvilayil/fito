import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{ background: "radial-gradient(600px 260px at 50% -40px, rgb(31 157 122 / 0.14), transparent 70%)" }}
        aria-hidden
      />
      <header className="relative px-5 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px] animate-rise">{children}</div>
      </main>
    </div>
  );
}
