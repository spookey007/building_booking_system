import Link from "next/link";
import { BarChart3, Package, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

const reportCards = [
  {
    href: "/dashboard/reports/stock-report",
    title: "Stock report",
    description: "All units by project and tower: availability, area, pricing, and listing status.",
    icon: Package,
  },
  {
    href: "/dashboard/reports/sales-bookings",
    title: "Sales & installments",
    description: "Sold and booked stock, installment completion, and bookings on committed units.",
    icon: TrendingUp,
  },
];

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-slate-500">
          <BarChart3 className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">Reports</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Choose a report</h2>
        <p className="text-sm text-slate-500">Inventory, sales, and collection insights.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {reportCards.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group block">
            <Card
              animate={false}
              className="h-full rounded-2xl border border-slate-200/90 p-5 shadow-sm transition group-hover:border-brand-300 group-hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 group-hover:text-brand-800">{title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                  <p className="mt-3 text-sm font-medium text-brand-600">Open report →</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
