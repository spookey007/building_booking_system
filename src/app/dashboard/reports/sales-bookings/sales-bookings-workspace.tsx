"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export type SalesBookingsSummary = {
  soldUnits: number;
  bookedUnits: number;
  totalInstallments: number;
  paidInstallments: number;
  soldStockValueLabel: string;
  bookedStockValueLabel: string;
};

export type SalesBookingsRow = {
  bookingId: string;
  bookingNo: string;
  bookingDate: string;
  bookingStatus: string;
  unitStatus: string;
  projectCode: string;
  unitLabel: string;
  customerName: string;
  customerCnic: string;
  planName: string | null;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
};

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCsv(rows: SalesBookingsRow[]) {
  const headers = [
    "booking_no",
    "booking_date",
    "booking_status",
    "unit_status",
    "project",
    "unit",
    "customer",
    "cnic",
    "plan",
    "installments_paid",
    "installments_total",
    "installments_pending",
  ];
  const lines = rows.map((r) =>
    [
      r.bookingNo,
      r.bookingDate,
      r.bookingStatus,
      r.unitStatus,
      r.projectCode,
      r.unitLabel,
      r.customerName,
      r.customerCnic,
      r.planName ?? "",
      r.paidInstallments,
      r.totalInstallments,
      r.pendingInstallments,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function SalesBookingsWorkspace({
  rows,
  summary,
}: {
  rows: SalesBookingsRow[];
  summary: SalesBookingsSummary;
}) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.bookingNo,
        r.bookingDate,
        r.bookingStatus,
        r.unitStatus,
        r.projectCode,
        r.unitLabel,
        r.customerName,
        r.customerCnic,
        r.planName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, rows]);

  const columns = useMemo<ColumnDef<SalesBookingsRow>[]>(
    () => [
      {
        accessorKey: "bookingNo",
        header: "Booking #",
        cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.bookingNo}</span>,
      },
      { accessorKey: "bookingDate", header: "Date" },
      { accessorKey: "bookingStatus", header: "Booking" },
      { accessorKey: "unitStatus", header: "Unit status" },
      { accessorKey: "projectCode", header: "Project" },
      { accessorKey: "unitLabel", header: "Unit" },
      { accessorKey: "customerName", header: "Customer" },
      { accessorKey: "customerCnic", header: "CNIC" },
      {
        accessorKey: "planName",
        header: "Plan",
        cell: ({ getValue }) => (getValue() as string | null) ?? "—",
      },
      {
        id: "installments",
        header: "Installments",
        cell: ({ row }) => {
          const { paidInstallments, totalInstallments, pendingInstallments } = row.original;
          if (totalInstallments === 0) return <span className="text-slate-400">No plan</span>;
          return (
            <span className="tabular-nums">
              <span className="font-semibold text-emerald-700">{paidInstallments}</span>
              <span className="text-slate-400"> / {totalInstallments}</span>
              {pendingInstallments > 0 ? (
                <span className="ml-1 text-xs text-amber-700">({pendingInstallments} open)</span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 12 },
      sorting: [{ id: "bookingDate", desc: true }],
    },
  });

  const installmentProgress =
    summary.totalInstallments > 0
      ? Math.round((summary.paidInstallments / summary.totalInstallments) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h2 className="text-2xl font-bold text-slate-900">Sales &amp; installments</h2>
        <p className="text-sm text-slate-500">
          Sold and booked stock, installment completion, and active bookings on committed units.
        </p>
      </motion.header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Units sold", value: summary.soldUnits, sub: summary.soldStockValueLabel },
          { label: "Units booked", value: summary.bookedUnits, sub: summary.bookedStockValueLabel },
          { label: "Installments paid", value: summary.paidInstallments, sub: `of ${summary.totalInstallments} total` },
          { label: "Installment progress", value: `${installmentProgress}%`, sub: "paid vs scheduled" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 * i }}
          >
            <Card animate={false} className="rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{card.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{card.sub}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        <Card animate={false} className="space-y-3 rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <Field
              id="sales-bookings-search"
              label="Search"
              placeholder="Booking, customer, unit, CNIC…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-[220px] flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                downloadCsv("sales-bookings-report.csv", buildCsv(filteredRows));
                showSuccess("CSV exported.");
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, delay: 0.08 }}>
        <Card animate={false} className="hidden overflow-hidden rounded-2xl border border-slate-200 p-0 shadow-sm lg:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="px-3 py-2 text-left font-semibold text-slate-600">
                        {h.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {{ asc: "▲", desc: "▼" }[h.column.getIsSorted() as string] ?? ""}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                      No booked or sold units match your search.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
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
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span>
              Showing {table.getRowModel().rows.length} of {filteredRows.length}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                Previous
              </Button>
              <span>
                Page {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
              </span>
              <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="space-y-2 lg:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <Card animate={false} className="px-3 py-10 text-center text-sm text-slate-500">
            No records for this search.
          </Card>
        ) : (
          table.getRowModel().rows.map((tr) => {
            const r = tr.original;
            return (
              <Card key={r.bookingId} animate={false} className="space-y-2 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{r.bookingNo}</p>
                    <p className="text-xs text-slate-500">
                      {r.projectCode} · {r.unitLabel}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{r.unitStatus}</span>
                </div>
                <p className="text-sm text-slate-700">{r.customerName}</p>
                <p className="text-xs text-slate-500">
                  Installments: {r.paidInstallments}/{r.totalInstallments || "—"}
                </p>
              </Card>
            );
          })
        )}
        {table.getRowModel().rows.length > 0 ? (
          <div className="flex items-center justify-between gap-2 pt-1 text-sm">
            <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Previous
            </Button>
            <span>
              {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
            </span>
            <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
