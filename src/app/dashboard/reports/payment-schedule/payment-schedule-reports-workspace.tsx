"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type Table,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { BarChart3, CalendarRange, ChevronDown, Eye, FileDown, FileText, RefreshCcw, Trash2 } from "lucide-react";
import { BookingScheduleModal } from "@/components/reports/booking-schedule-modal";
import { demoBookingLabel } from "@/lib/payment-schedule-demo-bookings";
import {
  downloadCustomerSummaryReportPdf,
  downloadInstallmentScheduleReportPdf,
} from "@/lib/installment-schedule-report-pdf";
import {
  buildCustomerSummaryCsv,
  buildInstallmentScheduleCsv,
  downloadBlob,
} from "@/lib/reports/installment-csv-export";
import {
  dueDateBounds,
  filterInstallmentsByDueDateRange,
  sortDetailedByCustomerThenDue,
  summarizeInstallmentsByCustomer,
  type CustomerInstallmentSummaryRow,
} from "@/lib/reports/installment-report-filters";
import {
  buildInstallmentScheduleSummary,
  type InstallmentScheduleRow,
} from "@/lib/reports/installment-schedule-row";
import {
  clearPaymentScheduleDemos,
  loadPaymentScheduleDemos,
} from "@/lib/payment-schedule-demo-storage";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

function formatMoneyPkr(amount: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateDisplay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
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

function statusBadgeClass(status: string) {
  switch (status) {
    case "PAID":
      return "bg-emerald-100 text-emerald-900 ring-emerald-600/15";
    case "PARTIAL":
      return "bg-sky-100 text-sky-900 ring-sky-600/15";
    case "OVERDUE":
      return "bg-rose-100 text-rose-900 ring-rose-600/15";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-600/12";
  }
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PENDING", label: "Pending" },
  { value: "OVERDUE", label: "Overdue" },
];

const REPORT_MODE_OPTIONS = [
  { value: "detailed", label: "Detailed (per installment)" },
  { value: "summary", label: "Summary (by customer)" },
];

function startOfMonthISO(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

function endOfMonthISO(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
}

function ytdStartISO(d: Date) {
  return `${d.getFullYear()}-01-01`;
}

export function PaymentScheduleReportsWorkspace({
  installmentRows,
  defaultDueDateFrom,
  defaultDueDateTo,
}: {
  installmentRows: InstallmentScheduleRow[];
  defaultDueDateFrom: string;
  defaultDueDateTo: string;
}) {
  const router = useRouter();
  const bounds = useMemo(() => dueDateBounds(installmentRows), [installmentRows]);

  const [dateFrom, setDateFrom] = useState(defaultDueDateFrom);
  const [dateTo, setDateTo] = useState(defaultDueDateTo);
  useEffect(() => {
    setDateFrom(defaultDueDateFrom);
    setDateTo(defaultDueDateTo);
  }, [defaultDueDateFrom, defaultDueDateTo]);

  const [reportMode, setReportMode] = useState<"detailed" | "summary">("detailed");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalBookingId, setModalBookingId] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [isPdfPending, startPdf] = useTransition();

  const demoEntries = useMemo(() => loadPaymentScheduleDemos(), [listVersion]);
  const refresh = useCallback(() => setListVersion((v) => v + 1), []);

  const dateFiltered = useMemo(
    () => filterInstallmentsByDueDateRange(installmentRows, dateFrom, dateTo),
    [installmentRows, dateFrom, dateTo],
  );

  const filteredInstallments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dateFiltered.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        r.bookingNo,
        r.bookingStatus,
        r.unitStatus,
        r.projectCode,
        r.unitLabel,
        r.customerName,
        r.customerCnic,
        r.planName,
        r.dueDate,
        r.status,
        String(r.installmentNo),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [dateFiltered, query, statusFilter]);

  const detailedRows = useMemo(() => sortDetailedByCustomerThenDue(filteredInstallments), [filteredInstallments]);
  const summaryRows = useMemo(() => summarizeInstallmentsByCustomer(filteredInstallments), [filteredInstallments]);

  const viewSummary = useMemo(() => buildInstallmentScheduleSummary(filteredInstallments), [filteredInstallments]);

  const filterDescription = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Mode: ${reportMode === "summary" ? "Summary (customer)" : "Detailed (installment)"}`);
    if (dateFrom || dateTo) {
      parts.push(`Due ${dateFrom || "…"} → ${dateTo || "…"}`);
    }
    if (statusFilter) parts.push(`Status: ${statusFilter}`);
    if (query.trim()) parts.push(`Search: ${query.trim()}`);
    return parts.join(" · ");
  }, [reportMode, dateFrom, dateTo, statusFilter, query]);

  const applyPreset = (key: string) => {
    const now = new Date();
    if (key === "all") {
      setDateFrom(bounds.min);
      setDateTo(bounds.max);
      return;
    }
    if (key === "month") {
      setDateFrom(startOfMonthISO(now));
      setDateTo(endOfMonthISO(now));
      return;
    }
    if (key === "ytd") {
      setDateFrom(ytdStartISO(now));
      setDateTo(now.toISOString().slice(0, 10));
      return;
    }
    if (key === "quarter") {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      setDateFrom(start.toISOString().slice(0, 10));
      setDateTo(endOfMonthISO(now));
    }
  };

  const detailedColumns = useMemo<ColumnDef<InstallmentScheduleRow>[]>(
    () => [
      {
        id: "view",
        header: "",
        cell: ({ row }) => (
          <Button type="button" variant="ghost" className="h-8 px-2 text-brand-700" onClick={() => setModalBookingId(row.original.bookingId)}>
            <Eye className="h-4 w-4" />
            <span className="sr-only">View schedule</span>
          </Button>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.customerName}</span>,
      },
      {
        accessorKey: "customerCnic",
        header: "CNIC",
        cell: ({ getValue }) => <span className="font-mono text-xs text-slate-700">{(getValue() as string) || "—"}</span>,
      },
      {
        accessorKey: "bookingNo",
        header: "Booking",
        cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.bookingNo}</span>,
      },
      { accessorKey: "bookingStatus", header: "Bk." },
      { accessorKey: "unitLabel", header: "Unit" },
      { accessorKey: "planName", header: "Plan" },
      {
        accessorKey: "installmentNo",
        header: "#",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ getValue }) => formatDateDisplay(getValue() as string),
      },
      {
        accessorKey: "dueAmount",
        header: () => <span className="block text-right">Due</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "paidAmount",
        header: () => <span className="block text-right">Paid</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "balance",
        header: () => <span className="block text-right">Bal.</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums font-medium text-slate-900">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Inst.",
        cell: ({ getValue }) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
              statusBadgeClass(String(getValue())),
            )}
          >
            {getValue() as string}
          </span>
        ),
      },
    ],
    [],
  );

  const summaryColumns = useMemo<ColumnDef<CustomerInstallmentSummaryRow>[]>(
    () => [
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.customerName}</span>,
      },
      {
        accessorKey: "customerCnic",
        header: "CNIC",
        cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) || "—"}</span>,
      },
      {
        accessorKey: "bookingCount",
        header: () => <span className="block text-center">Bkgs</span>,
        cell: ({ getValue }) => <span className="block text-center tabular-nums">{getValue() as number}</span>,
      },
      {
        accessorKey: "installmentCount",
        header: () => <span className="block text-center">Lines</span>,
        cell: ({ getValue }) => <span className="block text-center tabular-nums">{getValue() as number}</span>,
      },
      {
        accessorKey: "totalDue",
        header: () => <span className="block text-right">Due</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "totalPaid",
        header: () => <span className="block text-right">Paid</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums text-emerald-800">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "totalBalance",
        header: () => <span className="block text-right">Balance</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums font-medium">{formatMoneyPkr(getValue() as number)}</span>
        ),
      },
    ],
    [],
  );

  const detailedTable = useReactTable({
    data: detailedRows,
    columns: detailedColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 }, sorting: [{ id: "customerName", desc: false }] },
  });

  const summaryTable = useReactTable({
    data: summaryRows,
    columns: summaryColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 }, sorting: [{ id: "customerName", desc: false }] },
  });

  const activeRowCount = reportMode === "summary" ? summaryRows.length : detailedRows.length;

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (reportMode === "summary") {
      if (summaryRows.length === 0) {
        showError("Nothing to export.");
        return;
      }
      downloadBlob(`installment-summary-customers-${stamp}.csv`, new Blob([buildCustomerSummaryCsv(summaryRows)], { type: "text/csv;charset=utf-8" }));
    } else {
      if (detailedRows.length === 0) {
        showError("Nothing to export.");
        return;
      }
      downloadBlob(`installment-schedule-detailed-${stamp}.csv`, new Blob([buildInstallmentScheduleCsv(detailedRows)], { type: "text/csv;charset=utf-8" }));
    }
    showSuccess(`Exported ${activeRowCount} row(s).`);
  };

  const exportPdf = () => {
    if (activeRowCount === 0) {
      showError("Nothing to export — adjust filters.");
      return;
    }
    startPdf(async () => {
      try {
        if (reportMode === "summary") {
          await downloadCustomerSummaryReportPdf(summaryRows, {
            title: "Installment summary — by customer",
            filterLabel: filterDescription,
          });
        } else {
          await downloadInstallmentScheduleReportPdf(detailedRows, {
            title: "Installment schedule — detailed",
            filterLabel: filterDescription,
          });
        }
        showSuccess("PDF downloaded.");
      } catch {
        showError("Could not generate PDF.");
      }
    });
  };

  const demoStats = useMemo(() => {
    const count = demoEntries.length;
    const totalsByCurrency = demoEntries.reduce(
      (acc, entry) => {
        const code = entry.payload.currency;
        acc[code] = (acc[code] ?? 0) + entry.payload.totalAmount;
        return acc;
      },
      {} as Partial<Record<"PKR" | "USD", number>>,
    );
    const totalInstallments = demoEntries.reduce((acc, entry) => acc + entry.payload.rows.length, 0);
    const avgInstallments = count ? totalInstallments / count : 0;
    const bookingIds = new Set(demoEntries.map((entry) => entry.payload.bookingId));
    return { count, totalsByCurrency, totalInstallments, avgInstallments, uniqueBookings: bookingIds.size };
  }, [demoEntries]);

  return (
    <div className="space-y-6">
      <BookingScheduleModal open={modalBookingId != null} bookingId={modalBookingId} onClose={() => setModalBookingId(null)} />

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Reports · collections</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Installment schedule</h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Filter by <strong>due date</strong>, switch between a <strong>customer summary</strong> and a <strong>detailed</strong> line list
            (sorted by customer). Open any booking in a modal for the full plan and print CSV/PDF for that booking only.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/reports")}>
            All reports
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/payment-schedule")}>
            Planner
          </Button>
        </div>
      </header>

      <Card className="space-y-4 border border-slate-200/90 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-slate-900">
          <CalendarRange className="h-5 w-5 shrink-0 text-brand-600" />
          <h3 className="text-base font-semibold sm:text-lg">Filters &amp; report type</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <Field
            id="due-from"
            label="Due from"
            type="date"
            className="lg:col-span-3"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Field
            id="due-to"
            label="Due to"
            type="date"
            className="lg:col-span-3"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 lg:col-span-6">
            <Button type="button" variant="secondary" className="text-xs sm:text-sm" onClick={() => applyPreset("month")}>
              This month
            </Button>
            <Button type="button" variant="secondary" className="text-xs sm:text-sm" onClick={() => applyPreset("quarter")}>
              Last 3 mo
            </Button>
            <Button type="button" variant="secondary" className="text-xs sm:text-sm" onClick={() => applyPreset("ytd")}>
              YTD
            </Button>
            <Button type="button" variant="secondary" className="text-xs sm:text-sm" onClick={() => applyPreset("all")} disabled={!bounds.min}>
              Full range
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-4">
            <SelectField
              id="report-mode"
              label="Report"
              value={reportMode}
              onChange={(e) => setReportMode(e.target.value as "detailed" | "summary")}
              options={REPORT_MODE_OPTIONS}
            />
          </div>
          <Field
            id="installment-report-search"
            label="Search"
            placeholder="Booking, customer, CNIC, unit, plan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="lg:col-span-5"
          />
          <div className="lg:col-span-3">
            <SelectField
              id="installment-status-filter"
              label="Installment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">Active filters:</span> {filterDescription}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines in view</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{viewSummary.rowCount}</p>
          <p className="text-xs text-slate-500">
            {reportMode === "summary" ? `${summaryRows.length} customers` : `${detailedRows.length} installments`} ·{" "}
            {installmentRows.length} loaded
            {installmentRows.length === 0 ? " — run prisma db seed" : ""}
          </p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding (view)</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatMoneyPkr(viewSummary.totalBalance)}</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Collected (view)</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-800">{formatMoneyPkr(viewSummary.totalPaid)}</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status mix</p>
          <p className="text-sm font-medium leading-relaxed text-slate-800">
            {["PAID", "PARTIAL", "PENDING", "OVERDUE"]
              .map((k) => (viewSummary.byStatus[k] ? `${k}: ${viewSummary.byStatus[k]}` : null))
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </Card>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <BarChart3 className="h-5 w-5 shrink-0 text-brand-600" />
            <h3 className="text-lg font-semibold">{reportMode === "summary" ? "Customer summary" : "Detailed installments"}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={exportCsv} disabled={activeRowCount === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button type="button" variant="secondary" disabled={isPdfPending || activeRowCount === 0} onClick={exportPdf}>
              <FileText className="mr-2 h-4 w-4" />
              {isPdfPending ? "PDF…" : "PDF"}
            </Button>
          </div>
        </div>

        {installmentRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-600">
            No installment rows in the database. Run{" "}
            <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs">npm run prisma:seed</code> to load demo bookings with
            plans.
          </div>
        ) : reportMode === "summary" ? (
          <>
            <div className="hidden rounded-2xl border border-slate-200/80 md:block">
              <div className="overflow-x-auto">
                <table className="min-w-[52rem] w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
                    {summaryTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((h) => (
                          <th key={h.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {h.isPlaceholder ? null : (
                              <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={h.column.getToggleSortingHandler()}>
                                {flexRender(h.column.columnDef.header, h.getContext())}
                                {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                              </button>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {summaryTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                          No rows match your filters.
                        </td>
                      </tr>
                    ) : (
                      summaryTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2 align-middle">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar table={summaryTable} filteredCount={summaryRows.length} />
            </div>
            <SummaryMobileCards rows={summaryRows} table={summaryTable} />
          </>
        ) : (
          <>
            <div className="hidden rounded-2xl border border-slate-200/80 md:block">
              <div className="overflow-x-auto">
                <table className="min-w-[76rem] w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
                    {detailedTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((h) => (
                          <th key={h.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {h.isPlaceholder ? null : h.id === "view" ? (
                              <span className="sr-only">View</span>
                            ) : (
                              <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={h.column.getToggleSortingHandler()}>
                                {flexRender(h.column.columnDef.header, h.getContext())}
                                {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                              </button>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detailedTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-3 py-12 text-center text-slate-500">
                          No rows match your filters.
                        </td>
                      </tr>
                    ) : (
                      detailedTable.getRowModel().rows.map((row) => {
                        const r = row.original;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50/80">
                            {row.getVisibleCells().map((cell) => (
                              <td key={cell.id} className={cn("px-3 py-2 align-middle", cell.column.id === "view" && "w-12")}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar table={detailedTable} filteredCount={detailedRows.length} />
            </div>
            <DetailedMobileCards rows={detailedRows} table={detailedTable} onViewBooking={setModalBookingId} />
          </>
        )}
      </Card>

      <details className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800 sm:px-5">
          <span>Browser-only planner snapshots (optional)</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </summary>
        <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap gap-2">
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
                showSuccess("Cleared planner snapshots from this tab.");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear snapshots
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="space-y-1 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshots</p>
              <p className="text-2xl font-bold text-slate-900">{demoStats.count}</p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique bookings</p>
              <p className="text-2xl font-bold text-slate-900">{demoStats.uniqueBookings}</p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contract (PKR)</p>
              <p className="text-lg font-bold text-slate-900">{formatMoney(demoStats.totalsByCurrency.PKR ?? 0, "PKR")}</p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg rows / snapshot</p>
              <p className="text-2xl font-bold text-slate-900">{demoStats.avgInstallments ? demoStats.avgInstallments.toFixed(1) : "—"}</p>
            </Card>
          </div>
          {demoEntries.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-sm text-slate-600">
              Nothing saved yet from the planner.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="min-w-[56rem] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Saved at</th>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Plan note</th>
                    <th className="px-3 py-2">Cur.</th>
                    <th className="px-3 py-2 text-right">Contract</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {demoEntries.map((entry) => {
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
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatMoney(entry.payload.totalAmount, cur)}</td>
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
        </div>
      </details>
    </div>
  );
}

function PaginationBar<T>({ table, filteredCount }: { table: Table<T>; filteredCount: number }) {
  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-slate-600">
        Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)} · {table.getRowModel().rows.length} on page ·{" "}
        {filteredCount} total
      </span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}

function DetailedMobileCards({
  rows,
  table,
  onViewBooking,
}: {
  rows: InstallmentScheduleRow[];
  table: Table<InstallmentScheduleRow>;
  onViewBooking: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 md:hidden">No rows.</p>;
  }
  return (
    <div className="space-y-3 md:hidden">
      {table.getRowModel().rows.map((tr) => {
        const r = tr.original;
        return (
          <Card key={r.installmentId} animate={false} className="space-y-2 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.customerName}</p>
                <p className="font-semibold text-slate-900">{r.bookingNo}</p>
                <p className="text-xs text-slate-500">
                  {r.unitLabel} · Due {formatDateDisplay(r.dueDate)}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", statusBadgeClass(r.status))}>{r.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
              <div>
                <p className="text-slate-500">Due</p>
                <p className="font-semibold tabular-nums">{formatMoneyPkr(r.dueAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500">Paid</p>
                <p className="font-semibold tabular-nums text-emerald-800">{formatMoneyPkr(r.paidAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500">Balance</p>
                <p className="font-semibold tabular-nums">{formatMoneyPkr(r.balance)}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" className="w-full" onClick={() => onViewBooking(r.bookingId)}>
              <Eye className="mr-2 h-4 w-4" />
              View full booking schedule
            </Button>
          </Card>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <span className="text-slate-600">
          {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
        </span>
        <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}

function SummaryMobileCards({
  rows,
  table,
}: {
  rows: CustomerInstallmentSummaryRow[];
  table: Table<CustomerInstallmentSummaryRow>;
}) {
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 md:hidden">No rows.</p>;
  }
  return (
    <div className="space-y-3 md:hidden">
      {table.getRowModel().rows.map((tr) => {
        const r = tr.original;
        return (
          <Card key={r.customerKey} animate={false} className="rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-slate-900">{r.customerName}</p>
            <p className="text-xs text-slate-500">{r.customerCnic || "—"}</p>
            <p className="mt-2 text-xs text-slate-600">
              {r.bookingCount} booking(s) · {r.installmentCount} line(s)
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
              <div>
                <p className="text-slate-500">Due</p>
                <p className="font-semibold tabular-nums">{formatMoneyPkr(r.totalDue)}</p>
              </div>
              <div>
                <p className="text-slate-500">Paid</p>
                <p className="font-semibold tabular-nums">{formatMoneyPkr(r.totalPaid)}</p>
              </div>
              <div>
                <p className="text-slate-500">Bal</p>
                <p className="font-semibold tabular-nums">{formatMoneyPkr(r.totalBalance)}</p>
              </div>
            </div>
          </Card>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <span className="text-slate-600">
          {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
        </span>
        <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}

function formatMoney(amount: number, currency: "PKR" | "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}
