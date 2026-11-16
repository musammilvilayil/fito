import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-[linear-gradient(180deg,#168a6e,#10735c)] text-lime-ink hover:bg-[linear-gradient(180deg,#127c63,#0d6150)] active:brightness-95 " +
    "shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_10px_22px_-12px_rgb(16_115_92/0.75)]",
  secondary:
    "bg-white/70 text-ink border border-white/80 backdrop-blur-md shadow-[0_1px_2px_rgb(29_56_50/0.06),0_6px_16px_-10px_rgb(29_70_60/0.3)] hover:bg-white",
  soft: "bg-lime-soft text-lime hover:bg-[rgb(31_157_122/0.2)]",
  ghost: "text-ink-muted hover:text-ink hover:bg-white/60",
  outline: "border border-line-strong text-ink hover:bg-white/60",
  danger: "bg-danger/12 text-danger border border-danger/30 hover:bg-danger/20",
} as const;

const sizes = {
  sm: "h-8 px-3.5 text-[13px] gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-full",
  icon: "h-9 w-9 rounded-full",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  asChild,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,filter] duration-150 select-none",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
