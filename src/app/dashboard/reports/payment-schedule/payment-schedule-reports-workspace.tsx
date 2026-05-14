"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, RefreshCcw, Trash2 } from "lucide-react";
import { demoBookingLabel } from "@/lib/payment-schedule-demo-bookings";
import {
  clearPaymentScheduleDemos,
  loadPaymentScheduleDemos,
} from "@/lib/payment-schedule-demo-storage";
import { showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatMoney(amount: number, currency: "PKR" | "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(amount);
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

function rowPaidSnapshot(row: { amount?: unknown; paidAmount?: unknown }) {
  const amt = Number(row.amount) || 0;
  const p = Number(row.paidAmount) || 0;
  return Math.min(Math.max(0, p), amt);
}

export function PaymentScheduleReportsWorkspace() {
  const router = useRouter();
  const [listVersion, setListVersion] = useState(0);

  const entries = useMemo(() => loadPaymentScheduleDemos(), [listVersion]);

  const refresh = useCallback(() => {
    setListVersion((value) => value + 1);
  }, []);

  const stats = useMemo(() => {
    const count = entries.length;
    const totalsByCurrency = entries.reduce(
      (acc, entry) => {
        const code = entry.payload.currency;
        acc[code] = (acc[code] ?? 0) + entry.payload.totalAmount;
        return acc;
      },
      {} as Partial<Record<"PKR" | "USD", number>>,
    );
    const totalInstallments = entries.reduce((acc, entry) => acc + entry.payload.rows.length, 0);
    const avgInstallments = count ? totalInstallments / count : 0;
    const bookingIds = new Set(entries.map((entry) => entry.payload.bookingId));
    return { count, totalsByCurrency, totalInstallments, avgInstallments, uniqueBookings: bookingIds.size };
  }, [entries]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Reports · demo analytics</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Payment schedule (demo)</h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Every time you tap <span className="font-semibold text-slate-800">Save for reports</span> on the payment
            schedule workspace, a snapshot is stored in session storage for this tab. Review coverage across demo bookings
            here before wiring to the database.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/reports")}>
            All reports
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/payment-schedule")}>
            Define schedule
          </Button>
          <Button type="button" variant="secondary" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-rose-700"
            onClick={() => {
              clearPaymentScheduleDemos();
              refresh();
              showSuccess("Cleared demo snapshots from this tab.");
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear demo data
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved schedules</p>
          <p className="text-3xl font-bold text-slate-900">{stats.count}</p>
          <p className="text-xs text-slate-500">Snapshots in session storage</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique bookings</p>
          <p className="text-3xl font-bold text-slate-900">{stats.uniqueBookings}</p>
          <p className="text-xs text-slate-500">Distinct booking references</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contract totals</p>
          <div className="space-y-1 text-lg font-bold text-slate-900">
            <p>{formatMoney(stats.totalsByCurrency.PKR ?? 0, "PKR")}</p>
            <p className="text-base text-slate-700">{formatMoney(stats.totalsByCurrency.USD ?? 0, "USD")}</p>
          </div>
          <p className="text-xs text-slate-500">Summed separately by currency</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg installments / plan</p>
          <p className="text-3xl font-bold text-slate-900">{stats.avgInstallments ? stats.avgInstallments.toFixed(1) : "—"}</p>
          <p className="text-xs text-slate-500">{stats.totalInstallments} rows across all plans</p>
        </Card>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <BarChart3 className="h-5 w-5 text-brand-600" />
          <h3 className="text-lg font-semibold">Recent snapshots</h3>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-600">
            Nothing saved yet. Open <span className="font-semibold text-slate-900">Define schedule</span>, balance the
            totals, then choose <span className="font-semibold text-slate-900">Save for reports</span> to populate this
            list.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Saved at</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Plan note</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2 text-right">Contract</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/90">
                {entries.map((entry) => {
                  const cur = entry.payload.currency;
                  const totalDue = entry.payload.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
                  const totalPaid = entry.payload.rows.reduce((a, r) => a + rowPaidSnapshot(r), 0);
                  const pending = Math.max(0, totalDue - totalPaid);
                  const plan = entry.payload.planTitle?.trim();
                  return (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(entry.savedAt)}</td>
                    <td className="px-3 py-2 text-slate-900">
                      <div className="font-semibold">
                        {entry.payload.bookingDisplayLabel?.trim() || demoBookingLabel(entry.payload.bookingId)}
                      </div>
                      <div className="text-xs text-slate-500">{entry.payload.bookingId}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-800">{plan ? plan : "—"}</td>
                    <td className="px-3 py-2">{cur}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {formatMoney(entry.payload.totalAmount, cur)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{entry.payload.rows.length}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(totalPaid, cur)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(pending, cur)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
