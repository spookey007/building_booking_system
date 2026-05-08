"use client";

import type { SelectHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Option = { label: string; value: string };

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  options: Option[];
  error?: string;
  hint?: string;
};

export function SelectField({ id, label, options, error, hint, className, ...props }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-700">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "rounded-xl border border-slate-300/90 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition duration-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-slate-300/90 dark:bg-white/95 dark:text-slate-900",
          error
            ? "border-rose-500 ring-rose-500/40 focus:border-rose-500 focus:ring-2"
            : "",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
