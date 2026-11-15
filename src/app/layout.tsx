import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FITO — Gym management, connected", template: "%s · FITO" },
  description:
    "FITO connects gym owners, trainers and members: memberships, payments, QR attendance and trainer-approved AI workouts in one place.",
  applicationName: "FITO",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#14171b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!bg-raised !border-line !text-ink !rounded-xl",
              description: "!text-ink-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
