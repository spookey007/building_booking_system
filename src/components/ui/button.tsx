import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const base =
  "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "brand-gradient text-white shadow-sm hover:brightness-105 active:scale-[0.98]",
  secondary:
    "border border-slate-200/90 bg-white/95 text-slate-900 shadow-sm hover:bg-white hover:shadow dark:border-slate-200 dark:bg-white/95 dark:text-slate-900 dark:hover:bg-white",
  ghost: "text-slate-700 hover:bg-slate-100/90 dark:text-slate-700 dark:hover:bg-slate-100/90",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 hover:shadow-md",
};

export function Button({ children, variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}
