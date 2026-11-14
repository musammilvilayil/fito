import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** FITO logo lockup. Raster placeholder until the vector redraw is ready. */
export function Logo({ href = "/", size = "md", className }: { href?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const h = size === "sm" ? 22 : size === "lg" ? 34 : 26;
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="FITO home">
      <Image src="/brand/fito-mark.png" alt="" width={Math.round(h * 1.49)} height={h} priority />
      <Image src="/brand/fito-wordmark.png" alt="FITO" width={Math.round(h * 0.82 * 3.96)} height={Math.round(h * 0.82)} priority />
    </Link>
  );
}

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return <Image src="/brand/fito-mark.png" alt="FITO" width={Math.round(size * 1.49)} height={size} className={className} />;
}
