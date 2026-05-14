"use client";

import { useEffect, useState, useTransition } from "react";
import { X, FileDown, FileText, Loader2 } from "lucide-react";
import { downloadInstallmentScheduleReportPdf } from "@/lib/installment-schedule-report-pdf";
import type { InstallmentScheduleRow } from "@/lib/reports/installment-schedule-row";
import { buildInstallmentScheduleCsv, downloadBlob } from "@/lib/reports/installment-csv-export";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ApiPayload = {
  booking: {
    id: string;
    bookingNo: string;
    status: string;
    customerName: string;
    customerCnic: string;
    projectCode: string;
    unitLabel: string;
    unitStatus: string;
  };
  planName: string | null;
  installments: {
    id: string;
    installmentNo: number;
    dueDate: string;
    dueAmount: string;
    paidAmount: string;
    remaining: string;
    status: string;
    displayStatus?: string;
  }[];
};

export function BookingScheduleModal({
  open,
  bookingId,
  onClose,
}: {
  open: boolean;
  bookingId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InstallmentScheduleRow[]>([]);
  const [meta, setMeta] = useState<ApiPayload["booking"] | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [isPdf, startPdf] = useTransition();

  useEffect(() => {
    if (!open || !bookingId) {
      setRows([]);
      setMeta(null);
      setPlanName(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/installments`);
        if (!res.ok) throw new Error("fetch");
        const data = (await res.json()) as ApiPayload;
        if (cancelled) return;
        setMeta(data.booking);
        setPlanName(data.planName);
        const mapped: InstallmentScheduleRow[] = data.installments.map((s) => ({
          installmentId: s.id,
          bookingId: data.booking.id,
          bookingNo: data.booking.bookingNo,
          bookingStatus: data.booking.status,
          unitStatus: data.booking.unitStatus,
          projectCode: data.booking.projectCode,
          unitLabel: data.booking.unitLabel,
          customerName: data.booking.customerName,
          customerCnic: data.booking.customerCnic,
          planName: data.planName ?? "—",
          installmentNo: s.installmentNo,
          dueDate: s.dueDate,
          dueAmount: Number(s.dueAmount),
          paidAmount: Number(s.paidAmount),
          balance: Number(s.remaining),
          status: s.displayStatus ?? s.status,
        }));
        setRows(mapped);
      } catch {
        if (!cancelled) {
          showError("Could not load this booking's schedule.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  if (!open || !bookingId) return null;

  const titleLabel = meta ? `${meta.bookingNo} · ${meta.customerName}` : "Schedule";

  const exportCsv = () => {
    if (rows.length === 0) return;
    const safe = meta?.bookingNo?.replace(/\W+/g, "-") ?? bookingId.slice(0, 8);
    downloadBlob(
      `installments-${safe}.csv`,
      new Blob([buildInstallmentScheduleCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    showSuccess("CSV downloaded.");
  };

  const exportPdf = () => {
    if (rows.length === 0) return;
    startPdf(async () => {
      try {
        await downloadInstallmentScheduleReportPdf(rows, {
          title: `Installment schedule — ${titleLabel}`,
          filterLabel: "Full plan for this booking (all due dates)",
        });
        showSuccess("PDF downloaded.");
      } catch {
        showError("Could not build PDF.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-schedule-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[100dvh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Booking schedule</p>
            <h3 id="booking-schedule-modal-title" className="truncate text-lg font-bold text-slate-900">
              {loading ? "Loading…" : titleLabel}
            </h3>
            {meta ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {meta.unitLabel} · Plan: {planName ?? "—"}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button type="button" variant="secondary" disabled={loading || rows.length === 0} onClick={exportCsv}>
              <FileDown className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
            <Button type="button" variant="secondary" disabled={loading || rows.length === 0 || isPdf} onClick={exportPdf}>
              <FileText className="mr-1.5 h-4 w-4" />
              {isPdf ? "…" : "PDF"}
            </Button>
            <Button type="button" variant="ghost" className="rounded-full p-2" aria-label="Close" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No payment plan for this booking.</p>
          ) : (
            <>
              <div className="hidden sm:block">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2 text-right">Due</th>
                        <th className="px-3 py-2 text-right">Paid</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.installmentId} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2 tabular-nums">{r.installmentNo}</td>
                          <td className="px-3 py-2">{r.dueDate}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtPkr(r.dueAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmtPkr(r.paidAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtPkr(r.balance)}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", badge(r.status))}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-2 sm:hidden">
                {rows.map((r) => (
                  <div key={r.installmentId} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">#{r.installmentNo}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge(r.status))}>{r.status}</span>
                    </div>
                    <p className="text-xs text-slate-500">Due {r.dueDate}</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <p className="text-slate-500">Due</p>
                        <p className="font-semibold tabular-nums">{fmtPkr(r.dueAmount)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Paid</p>
                        <p className="font-semibold tabular-nums">{fmtPkr(r.paidAmount)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Bal</p>
                        <p className="font-semibold tabular-nums">{fmtPkr(r.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtPkr(n: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);
}

function badge(s: string) {
  switch (s) {
    case "PAID":
      return "bg-emerald-100 text-emerald-900";
    case "PARTIAL":
      return "bg-sky-100 text-sky-900";
    case "OVERDUE":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-slate-100 text-slate-800";
  }
}
