"use client";

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UnitRow = {
  id: string;
  unitNo: string;
  towerCode: string;
  prefix: string;
  floorNo: string;
  unitKind: string;
  categoryCode: string;
  areaSqft: string;
  listingStatus: string;
};

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "AVAILABLE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "HOLD":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "BOOKED":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "SOLD":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case "PLATINUM":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "GOLD":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "SILVER":
      return "border-zinc-300 bg-zinc-100 text-zinc-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

const columns: ColumnDef<UnitRow>[] = [
  { accessorKey: "unitNo", header: "Unit" },
  { accessorKey: "towerCode", header: "Tower" },
  {
    accessorKey: "prefix",
    header: "Prefix",
    cell: ({ row }) => row.original.prefix || "-",
  },
  { accessorKey: "floorNo", header: "Floor" },
  { accessorKey: "unitKind", header: "Type" },
  {
    accessorKey: "categoryCode",
    header: "Category",
    cell: ({ row }) => (
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getCategoryBadgeClass(row.original.categoryCode)}`}>
        {row.original.categoryCode}
      </span>
    ),
  },
  {
    accessorKey: "areaSqft",
    header: "Area",
    cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.areaSqft}</span>,
  },
  {
    accessorKey: "listingStatus",
    header: "Status",
    cell: ({ row }) => (
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(row.original.listingStatus)}`}>
        {row.original.listingStatus}
      </span>
    ),
  },
];

export function UnitsTable({ data }: { data: UnitRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "towerCode", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredData = useMemo(() => {
    if (statusFilter === "ALL") return data;
    return data.filter((row) => row.listingStatus === statusFilter);
  }, [data, statusFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const uniqueStatuses = useMemo(
    () => Array.from(new Set(data.map((row) => row.listingStatus))).sort(),
    [data],
  );

  if (data.length === 0) {
    return (
      <Card animate={false} className="border-dashed px-4 py-10 text-center text-sm text-slate-500">
        No units found.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card animate={false} className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search unit, tower, prefix, category..."
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none ring-brand-300 transition focus:border-slate-400 focus:ring-2"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none ring-brand-300 transition focus:border-slate-400 focus:ring-2"
          >
            <option value="ALL">All statuses</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card animate={false} className="hidden overflow-hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <th key={header.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            disabled={!canSort}
                            onClick={header.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 ${canSort ? "hover:text-slate-900" : ""}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sortDir === "asc" ? "▲" : sortDir === "desc" ? "▼" : ""}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                    No units match your filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 text-slate-700 hover:bg-slate-50/60">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-3 lg:hidden">
        {table.getRowModel().rows.map((row) => (
          <Card key={row.original.id} animate={false} className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Unit</p>
                  <p className="font-semibold text-slate-900">{row.original.unitNo}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(row.original.listingStatus)}`}>
                  {row.original.listingStatus}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-slate-500">Tower</p>
                <p className="text-right">{row.original.towerCode}</p>
                <p className="text-slate-500">Prefix</p>
                <p className="text-right">{row.original.prefix || "-"}</p>
                <p className="text-slate-500">Floor</p>
                <p className="text-right">{row.original.floorNo}</p>
                <p className="text-slate-500">Type</p>
                <p className="text-right">{row.original.unitKind}</p>
                <p className="text-slate-500">Category</p>
                <p className="text-right">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getCategoryBadgeClass(row.original.categoryCode)}`}>
                    {row.original.categoryCode}
                  </span>
                </p>
                <p className="text-slate-500">Area</p>
                <p className="text-right font-semibold">{row.original.areaSqft}</p>
                <p className="text-slate-500">Status</p>
                <p className="text-right">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(row.original.listingStatus)}`}>
                    {row.original.listingStatus}
                  </span>
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card animate={false} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>
            Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length} filtered row(s)
          </span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700"
          >
            {[10, 20, 30, 50].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <span className="text-sm font-medium text-slate-600">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <Button type="button" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
