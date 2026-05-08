"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import type { BookingFormInput } from "@/lib/validations/booking-form";
import { voidBookingAction } from "@/lib/actions/booking-actions";
import { showActionResult } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export type BookingRow = {
  id: string;
  unitId: string;
  bookingNo: string;
  bookingDate: string;
  customerName: string;
  unitLabel: string;
  projectCode: string;
  towerCode: string;
  unitNo: string;
  mode: string;
  status: string;
  unitPrice: string;
  discountAmount: string;
  cashPayable: string;
  grossTotal: string;
  payableCost: string;
  notes: string;
  formDefaults: Partial<BookingFormInput>;
};

type BookingsTableProps = {
  data: BookingRow[];
  onView: (row: BookingRow) => void;
};

export function BookingsTable({ data, onView }: BookingsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [isPending, startTransition] = useTransition();

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((row) => {
      const statusLabel = row.status === "CANCELLED" && row.notes.includes("VOIDED") ? "VOID" : row.status;
      if (statusFilter !== "ALL" && statusLabel !== statusFilter) return false;
      if (modeFilter !== "ALL" && row.mode !== modeFilter) return false;
      if (projectFilter !== "ALL" && row.projectCode !== projectFilter) return false;
      if (!q) return true;
      return [
        row.bookingNo,
        row.customerName,
        row.projectCode,
        row.unitLabel,
        row.mode,
        statusLabel,
        row.bookingDate,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, modeFilter, projectFilter, query, statusFilter]);

  const projectOptions = useMemo(
    () => ["ALL", ...Array.from(new Set(data.map((row) => row.projectCode))).sort()],
    [data],
  );

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      { accessorKey: "bookingNo", header: "Booking No" },
      { accessorKey: "bookingDate", header: "Date" },
      { accessorKey: "customerName", header: "Customer" },
      { accessorKey: "projectCode", header: "Project" },
      { accessorKey: "unitLabel", header: "Unit" },
      { accessorKey: "mode", header: "Mode" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const isVoided = row.original.status === "CANCELLED" && row.original.notes.includes("VOIDED");
          return <span className="font-medium">{isVoided ? "VOID" : row.original.status}</span>;
        },
      },
      {
        accessorKey: "grossTotal",
        header: "Gross",
        cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.grossTotal}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const isVoided = row.original.status === "CANCELLED" && row.original.notes.includes("VOIDED");
          const isClosed = isVoided || row.original.status === "TRANSFERRED" || row.original.status === "SWITCHED";
          return (
            <div className="flex items-center gap-1">
              <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={() => onView(row.original)}>
                <Eye className="mr-1 h-3.5 w-3.5" />
                View
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50"
                disabled={isClosed || isPending}
                onClick={() => {
                  if (!window.confirm(`Void booking ${row.original.bookingNo}?`)) return;
                  startTransition(async () => {
                    const result = await voidBookingAction(row.original.id);
                    showActionResult(result);
                    if (result.ok) {
                      router.refresh();
                      return;
                    }
                  });
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Void
              </Button>
            </div>
          );
        },
      },
    ],
    [isPending, onView, router],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
      sorting: [{ id: "bookingDate", desc: true }],
    },
  });

  const isEmpty = filteredData.length === 0;

  return (
    <>
      <Card animate={false} className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-2 md:grid-cols-5">
          <Field
            id="bookingSearch"
            label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Booking no, customer, unit, project..."
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bookingStatusFilter" className="text-sm font-semibold text-slate-700">
              Status
            </label>
            <select
              id="bookingStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="TRANSFERRED">Transferred</option>
              <option value="SWITCHED">Switched</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bookingModeFilter" className="text-sm font-semibold text-slate-700">
              Mode
            </label>
            <select
              id="bookingModeFilter"
              value={modeFilter}
              onChange={(event) => setModeFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="ALL">All</option>
              <option value="REGULAR">REGULAR</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="SWITCHING">SWITCHING</option>
              <option value="GIFT">GIFT</option>
              <option value="CANCEL">CANCEL</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bookingProjectFilter" className="text-sm font-semibold text-slate-700">
              Project
            </label>
            <select
              id="bookingProjectFilter"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              {projectOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All" : option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
                setModeFilter("ALL");
                setProjectFilter("ALL");
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {isEmpty ? (
        <Card animate={false} className="border-dashed px-4 py-10 text-center text-sm text-slate-500">
          No bookings found for selected filters.
        </Card>
      ) : (
        <>
        <Card animate={false} className="hidden overflow-hidden p-0 lg:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-slate-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-slate-200">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: "▲",
                              desc: "▼",
                            }[header.column.getIsSorted() as string] ?? ""}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 text-slate-700 hover:bg-slate-50/80">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <span>
              Showing {table.getRowModel().rows.length} of {filteredData.length} bookings
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

        <div className="space-y-3 lg:hidden">
          {table.getRowModel().rows.map((row) => {
            const item = row.original;
            const isVoided = item.status === "CANCELLED" && item.notes.includes("VOIDED");
            return (
              <Card key={item.id} animate={false} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Booking</p>
                    <p className="font-semibold text-slate-900">{item.bookingNo}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {isVoided ? "VOID" : item.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                  <p className="text-slate-500">Customer</p>
                  <p className="text-right">{item.customerName}</p>
                  <p className="text-slate-500">Unit</p>
                  <p className="text-right">{item.unitLabel}</p>
                  <p className="text-slate-500">Mode</p>
                  <p className="text-right">{item.mode}</p>
                  <p className="text-slate-500">Gross</p>
                  <p className="text-right font-semibold">{item.grossTotal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={() => onView(item)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50"
                    disabled={isVoided || isPending}
                    onClick={() => {
                      if (!window.confirm(`Void booking ${item.bookingNo}?`)) return;
                      startTransition(async () => {
                        const result = await voidBookingAction(item.id);
                        showActionResult(result);
                        if (result.ok) {
                          router.refresh();
                          return;
                        }
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Void
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
        </>
      )}
    </>
  );
}
