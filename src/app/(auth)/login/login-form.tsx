"use client";

import { useActionState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { loginAction, type LoginActionState } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

const initialState: LoginActionState = { ok: true, message: "" };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[420px]"
    >
      <Card
        animate={false}
        className="relative overflow-hidden !border-slate-200 !bg-white p-8 text-slate-900 shadow-xl shadow-slate-200/60 sm:p-9 dark:!border-slate-200 dark:!bg-white dark:text-slate-900"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-600/20 blur-2xl"
          aria-hidden
        />
        <div className="relative">

          <form action={formAction} className="space-y-5">
            <Field
              id="email"
              name="email"
              type="email"
              label="Email"
              className="!border-slate-300 !bg-white !text-slate-900 placeholder:!text-slate-400 dark:!border-slate-300 dark:!bg-white dark:!text-slate-900"
              placeholder="you@company.com"
              hint="Use your work email on file"
              autoComplete="email"
              required
              error={!state.ok ? state.fieldErrors?.email?.[0] : undefined}
            />
            <Field
              id="password"
              name="password"
              type="password"
              label="Password"
              className="!border-slate-300 !bg-white !text-slate-900 placeholder:!text-slate-400 dark:!border-slate-300 dark:!bg-white dark:!text-slate-900"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              error={!state.ok ? state.fieldErrors?.password?.[0] : undefined}
            />
            <AnimatePresence>
              {!state.ok && state.message ? (
                <motion.p
                  key="login-error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300"
                >
                  {state.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <Button className="w-full shadow-lg shadow-blue-600/20" type="submit" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 rounded-xl bg-slate-500/5 px-3 py-2.5 text-center text-xs text-slate-600 dark:text-slate-400">
            Demo account:{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">admin@builder.local</span>
            <span className="mx-1 text-slate-400">·</span>
            <span className="font-mono text-[0.7rem] text-slate-700 dark:text-slate-300">admin123</span>
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
