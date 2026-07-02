import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { REPORT_HUB_CARDS } from "@/components/reports/reports-page-shell";

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-brand-600">
          <BarChart3 className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-[0.14em]">FM Towers · Reports</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Management reports</h2>
        <p className="text-sm text-slate-600">
          Inventory, sales recovery, installment collections, and customer ledger statements — export to CSV or PDF.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORT_HUB_CARDS.map(({ href, title, description, tag }) => (
          <Link key={href} href={href} className="group block">
            <Card
              animate={false}
              className="h-full rounded-2xl border border-slate-200/90 p-5 shadow-sm transition group-hover:border-brand-300 group-hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{tag}</span>
              </div>
              <h3 className="font-semibold text-slate-900 group-hover:text-brand-800">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
              <p className="mt-3 text-sm font-medium text-brand-600">Open report →</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
