"use client";

import type { TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function TextareaField({ id, label, error, hint, className, ...props }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "min-h-[88px] resize-y rounded-xl border border-slate-300/90 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition duration-200 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-slate-300/90 dark:bg-white/95 dark:text-slate-900 dark:placeholder:text-slate-400",
          error
            ? "border-rose-500 ring-rose-500/40 focus:border-rose-500 focus:ring-2"
            : "",
          className,
        )}
        {...props}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-500">
          {hint}
        </p>
      ) : null}
      <AnimatePresence>
        {error ? (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
