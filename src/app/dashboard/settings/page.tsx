"use client";

import { motion } from "framer-motion";
import { Shield, Users, Menu as MenuIcon, FileSpreadsheet, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";

const sections = [
  {
    icon: Shield,
    title: "Roles & permissions",
    body: "Map each role to dashboard, units, bookings, payments, and admin capabilities. Use the database seed or an admin UI when you add the permissions matrix.",
  },
  {
    icon: MenuIcon,
    title: "Sidebar & menu",
    body: "Role–menu rows in MenuItem and RoleMenuItem control which links appear per role. Fallback menus in code apply when no DB rows exist.",
  },
  {
    icon: Users,
    title: "Users",
    body: "Create staff accounts with hashed passwords and assign one or more roles. Inactive users cannot sign in.",
  },
  {
    icon: FileSpreadsheet,
    title: "Booking & documents",
    body: "Configure booking number rules, document templates, and any PDF exports your process requires.",
  },
  {
    icon: CreditCard,
    title: "Payment plans",
    body: "Payment plans attach to bookings; installment schedules drive the payments and sales reports.",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Reference for how this suite is configured. Operational changes are mostly data-driven (Prisma / admin tools).
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.04 * i }}
          >
            <Card
              animate={false}
              className="h-full rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-sm dark:border-slate-200 dark:bg-white/95"
            >
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <section.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-900">{section.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-600">{section.body}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.2 }}>
        <Card
          animate={false}
          className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 dark:border-slate-300 dark:bg-slate-50/80"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quick checklist</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li className="flex gap-2">
              <span className="text-brand-600">1.</span>
              Run <code className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">npx prisma migrate deploy</code> on new environments.
            </li>
            <li className="flex gap-2">
              <span className="text-brand-600">2.</span>
              Seed roles, menu, and admin via <code className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">npm run prisma:seed</code>.
            </li>
            <li className="flex gap-2">
              <span className="text-brand-600">3.</span>
              Set <code className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">JWT_SECRET</code> and{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">DATABASE_URL</code> in <code className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">.env</code>.
            </li>
          </ul>
        </Card>
      </motion.div>
    </div>
  );
}
