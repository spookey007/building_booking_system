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
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export type StockReportRow = {
  id: string;
  projectCode: string;
  towerCode: string;
  unitNo: string;
  displayLabel: string;
  unitKind: "RESIDENTIAL" | "COMMERCIAL" | "PENTHOUSE";
  listingStatus: "AVAILABLE" | "HOLD" | "BOOKED" | "SOLD" | "CANCELLED";
  floorNo: string;
  areaSqft: string;
  basePrice: string;
  transferCharges: string;
};

function toMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function buildCsv(rows: StockReportRow[]) {
  const headers = [
    "project_code",
    "tower_code",
    "unit_no",
    "display_label",
    "type",
    "status",
    "floor_no",
    "area_sqft",
    "base_price",
    "transfer_charges",
  ];

  const lines = rows.map((row) =>
    [
      row.projectCode,
      row.towerCode,
      row.unitNo,
      row.displayLabel,
      row.unitKind,
      row.listingStatus,
      row.floorNo,
      row.areaSqft,
      row.basePrice,
      row.transferCharges,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function StockReportWorkspace({ rows }: { rows: StockReportRow[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"SHOP" | "FLAT">("FLAT");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SOLD" | "BOOKED" | "OTHERS">("ALL");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const typeMatch =
        typeFilter === "SHOP"
          ? row.unitKind === "COMMERCIAL"
          : row.unitKind === "RESIDENTIAL" || row.unitKind === "PENTHOUSE";

      if (!typeMatch) return false;

      if (statusFilter === "SOLD" && row.listingStatus !== "SOLD") return false;
      if (statusFilter === "BOOKED" && row.listingStatus !== "BOOKED") return false;
      if (statusFilter === "OTHERS" && (row.listingStatus === "SOLD" || row.listingStatus === "BOOKED")) return false;

      if (!q) return true;
      return [row.projectCode, row.towerCode, row.unitNo, row.displayLabel, row.listingStatus].join(" ").toLowerCase().includes(q);
    });
  }, [query, rows, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const sold = filteredRows.filter((row) => row.listingStatus === "SOLD").length;
    const booked = filteredRows.filter((row) => row.listingStatus === "BOOKED").length;
    const others = total - sold - booked;
    const inventoryValue = filteredRows.reduce((sum, row) => sum + toNumber(row.basePrice), 0);

    return { total, sold, booked, others, inventoryValue };
  }, [filteredRows]);

  const columns = useMemo<ColumnDef<StockReportRow>[]>(
    () => [
      { accessorKey: "projectCode", header: "Project" },
      { accessorKey: "towerCode", header: "Tower" },
      { accessorKey: "displayLabel", header: "Unit" },
      { accessorKey: "unitKind", header: "Type" },
      { accessorKey: "listingStatus", header: "Status" },
      { accessorKey: "floorNo", header: "Floor" },
      { accessorKey: "areaSqft", header: "Area (sqft)" },
      { accessorKey: "basePrice", header: "Base Price" },
      { accessorKey: "transferCharges", header: "Transfer Charges" },
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
      sorting: [{ id: "displayLabel", desc: false }],
    },
  });

  return (
    <div className="space-y-4">
      <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h2 className="text-2xl font-bold text-slate-900">Stock Report</h2>
        <p className="text-sm text-slate-500">Stock summary and detailed report for shops and flats.</p>
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.03 }}>
      <Card animate={false} className="space-y-3 rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <Field
            id="stock-search"
            label="Search"
            placeholder="Project, tower, unit, status..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stock-type" className="text-sm font-semibold text-slate-700">
              Type
            </label>
            <select
              id="stock-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "SHOP" | "FLAT")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="FLAT">Flat</option>
              <option value="SHOP">Shop</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stock-status" className="text-sm font-semibold text-slate-700">
              Status Filter
            </label>
            <select
              id="stock-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | "SOLD" | "BOOKED" | "OTHERS")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="ALL">All</option>
              <option value="SOLD">Sold</option>
              <option value="BOOKED">Booked</option>
              <option value="OTHERS">Others</option>
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const csv = buildCsv(filteredRows);
                downloadCsv(`stock-report-${typeFilter.toLowerCase()}.csv`, csv);
                showSuccess("CSV exported.");
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  const [{ jsPDF }, autoTableModule] = await Promise.all([
                    import("jspdf"),
                    import("jspdf-autotable"),
                  ]);
                  const autoTable = autoTableModule.default;
                  const doc = new jsPDF({
                    orientation: "landscape",
                    unit: "pt",
                    format: "a4",
                  });

                  doc.setFontSize(14);
                  doc.text("Stock Report", 40, 36);
                  doc.setFontSize(10);
                  doc.text(`Type: ${typeFilter} | Status: ${statusFilter} | Records: ${filteredRows.length}`, 40, 54);

                  autoTable(doc, {
                    startY: 66,
                    head: [["Project", "Tower", "Unit", "Type", "Status", "Floor", "Area (sqft)", "Base Price", "Transfer"]],
                    body: filteredRows.map((row) => [
                      row.projectCode,
                      row.towerCode,
                      row.displayLabel,
                      row.unitKind,
                      row.listingStatus,
                      row.floorNo,
                      row.areaSqft,
                      row.basePrice,
                      row.transferCharges,
                    ]),
                    styles: {
                      fontSize: 8,
                      cellPadding: 4,
                    },
                    headStyles: {
                      fillColor: [15, 23, 42],
                    },
                  });

                  doc.save(`stock-report-${typeFilter.toLowerCase()}.pdf`);
                  showSuccess("PDF exported.");
                } catch {
                  showError("Unable to export PDF.");
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </Card>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.05 }}>
        <Card animate={false} className="rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Stock</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.total}</p>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.08 }}>
        <Card animate={false} className="rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sold</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.sold}</p>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.11 }}>
        <Card animate={false} className="rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booked</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.booked}</p>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.14 }}>
        <Card animate={false} className="rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Others</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.others}</p>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.17 }}>
        <Card animate={false} className="rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory Value</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{toMoney(summary.inventoryValue)}</p>
        </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, delay: 0.2 }}>
      <Card animate={false} className="hidden overflow-hidden rounded-2xl border border-slate-200 p-0 shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-3 py-2 text-left font-semibold text-slate-600">
                      {header.isPlaceholder ? null : (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1">
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
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                    No stock records found for selected filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
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
          <Card animate={false} className="px-3 py-8 text-center text-sm text-slate-500">
            No stock records found for selected filters.
          </Card>
        ) : (
          table.getRowModel().rows.map((tableRow) => {
            const row = tableRow.original;
            return (
            <motion.div key={row.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
            <Card animate={false} className="space-y-2 rounded-2xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">{row.projectCode} / {row.towerCode}</p>
                  <p className="font-semibold text-slate-900">{row.displayLabel}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{row.listingStatus}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                <p className="text-slate-500">Type</p>
                <p className="text-right">{row.unitKind}</p>
                <p className="text-slate-500">Floor</p>
                <p className="text-right">{row.floorNo}</p>
                <p className="text-slate-500">Area</p>
                <p className="text-right">{row.areaSqft}</p>
                <p className="text-slate-500">Base Price</p>
                <p className="text-right">{row.basePrice}</p>
                <p className="text-slate-500">Transfer</p>
                <p className="text-right">{row.transferCharges}</p>
              </div>
            </Card>
            </motion.div>
          )})
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
