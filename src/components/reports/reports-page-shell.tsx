import Link from "next/link";
import { BarChart3, BookOpen } from "lucide-react";

export function ReportsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-600">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">FM Towers · Reports</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>
        <Link
          href="/dashboard/reports"
          className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          ← All reports
        </Link>
      </div>
      {children}
    </div>
  );
}

export const REPORT_HUB_CARDS = [
  {
    href: "/dashboard/reports/stock-report",
    title: "Stock / inventory report",
    description: "All units by tower: availability, area, pricing, sold vs available (shops & flats).",
    tag: "Inventory",
  },
  {
    href: "/dashboard/reports/sales-bookings",
    title: "Sales & recovery report",
    description: "Sold and booked units with customer detail, installment progress, and recovery status.",
    tag: "Sales",
  },
  {
    href: "/dashboard/reports/payment-schedule",
    title: "Installment schedule report",
    description: "Due-date filtered installment lines — detailed or by customer — with CSV/PDF export.",
    tag: "Collections",
  },
  {
    href: "/dashboard/ledger",
    title: "Customer ledger statement",
    description: "Official, unofficial, utility & parking ledgers — single or all bookings, CSV/PDF export.",
    tag: "Accounting",
    icon: BookOpen,
  },
] as const;
