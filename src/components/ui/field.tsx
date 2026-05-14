"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ id, label, error, hint, className, ...props }: FieldProps) {
  const hasFootnote = Boolean(hint) || Boolean(error);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-w-0 w-full rounded-xl border border-slate-300/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition duration-200 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-slate-300/90 dark:bg-white/95 dark:text-slate-900 dark:placeholder:text-slate-400",
          error
            ? "border-rose-500 ring-rose-500/40 focus:border-rose-500 focus:ring-2"
            : "",
          className,
        )}
        {...props}
      />
      {hasFootnote ? (
        <div className="min-h-[2.625rem] text-xs leading-snug text-slate-500 dark:text-slate-500">
          {error ? (
            <p id={`${id}-error`} role="alert" className="font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : hint ? (
            <p id={`${id}-hint`}>{hint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
