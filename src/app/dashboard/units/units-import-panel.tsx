"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Download, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  analyzeUnitsCsvAction,
  importUnitsCsvAction,
  type UnitImportAnalysisResult,
  type UnitImportPreviewRow,
  type UnitImportRowStatus,
} from "@/lib/actions/unit-actions";

const initialNotice: { ok: boolean; message: string } = {
  ok: true,
  message: "Download the sample, fill rows, then upload CSV.",
};

function getStatusTone(status: UnitImportRowStatus) {
  if (status === "NEW") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DUPLICATE") return "border border-amber-200 bg-amber-50 text-amber-700";
  return "border border-rose-200 bg-rose-50 text-rose-700";
}

function getStatusLabel(status: UnitImportRowStatus) {
  if (status === "NEW") return "New";
  if (status === "DUPLICATE") return "Duplicate";
  return "Invalid";
}

export function UnitsImportPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState(initialNotice);
  const [analysis, setAnalysis] = useState<UnitImportAnalysisResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UnitImportRowStatus>("ALL");
  const [sorting, setSorting] = useState<SortingState>([{ id: "rowNumber", desc: false }]);

  function resetUploadState() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setAnalysis(null);
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startAnalyzeTransition(async () => {
      const result = await analyzeUnitsCsvAction(formData);
      setAnalysis(result);
      setNotice({ ok: result.ok, message: result.message });
      setShowModal(result.rows.length > 0);
      setSearchQuery("");
      setStatusFilter("ALL");
      if (!result.ok && result.rows.length === 0) {
        toast.error(result.message);
      }
    });
  }

  function handleImportNonExisting() {
    if (!analysis || analysis.importableCount === 0) return;

    startImportTransition(async () => {
      const result = await importUnitsCsvAction(analysis.importPayload);
      setNotice({ ok: result.ok, message: result.message });
      if (result.ok) {
        toast.success(result.message);
        resetUploadState();
        setShowModal(false);
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  const alertTone = useMemo(() => {
    if (notice.ok) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-rose-200 bg-rose-50 text-rose-700";
  }, [notice.ok]);

  const filteredRows = useMemo(() => {
    const rows = analysis?.rows ?? [];
    const query = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        row.projectCode,
        row.towerCode,
        row.prefix,
        row.unitNoRaw,
        row.unitNoNormalized,
        row.displayLabel,
        row.reason,
        getStatusLabel(row.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [analysis?.rows, searchQuery, statusFilter]);

  const columns = useMemo<ColumnDef<UnitImportPreviewRow>[]>(
    () => [
      { accessorKey: "rowNumber", header: "Row" },
      { accessorKey: "projectCode", header: "Project" },
      { accessorKey: "towerCode", header: "Tower" },
      {
        accessorKey: "prefix",
        header: "Prefix",
        cell: ({ row }) => row.original.prefix || "-",
      },
      { accessorKey: "unitNoRaw", header: "Uploaded Unit" },
      {
        accessorKey: "unitNoNormalized",
        header: "Stored Unit",
        cell: ({ row }) => row.original.unitNoNormalized || "-",
      },
      {
        accessorKey: "displayLabel",
        header: "Preview Label",
        cell: ({ row }) => row.original.displayLabel || "-",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTone(row.original.status)}`}>
            {getStatusLabel(row.original.status)}
          </span>
        ),
      },
      { accessorKey: "reason", header: "Reason" },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  useEffect(() => {
    table.setPageIndex(0);
  }, [searchQuery, statusFilter, analysis?.rows, table]);

  return (
    <>
      <Card animate={false} className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Bulk unit upload (CSV)</h3>
            <p className="text-xs text-slate-500 sm:text-sm">Analyze first, then import only rows marked as New.</p>
          </div>
          <a href="/templates/units-upload-sample.csv" download>
            <Button type="button" variant="secondary">
              <Download className="mr-2 h-4 w-4" />
              Download sample
            </Button>
          </a>
        </div>

        <form onSubmit={handleAnalyze} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="w-full">
            <label htmlFor="csvFile" className="mb-1 block text-sm font-semibold text-slate-700">
              CSV file
            </label>
            <input
              ref={fileInputRef}
              id="csvFile"
              name="csvFile"
              type="file"
              accept=".csv,text/csv"
              required
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
          <Button type="submit" disabled={isAnalyzing || isImporting}>
            <Upload className="mr-2 h-4 w-4" />
            {isAnalyzing ? "Analyzing File..." : "Analyze File"}
          </Button>
        </form>

        <div className={`rounded-lg border px-3 py-2 text-xs sm:text-sm ${alertTone}`}>{notice.message}</div>

        <div className="space-y-1 text-xs text-slate-500">
          <p>
            Required: <code>project_code</code>, <code>tower_code</code>, <code>unit_no</code>, <code>unit_kind</code>,{" "}
            <code>area_sqft</code>, <code>listing_status</code>
          </p>
          <p>
            Optional: <code>prefix</code> (uses <code>prefix-unit_no</code>, else <code>tower_code-unit_no</code>)
          </p>
        </div>
      </Card>

      {showModal && analysis ? (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-2 sm:p-4">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-4 sm:p-5">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">CSV Review</h4>
                <p className="text-sm text-slate-600">Review records, filter results, then import only rows marked as New.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 text-xs sm:px-5">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">
                New: {analysis.importableCount}
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">
                Duplicate: {analysis.duplicateCount}
              </span>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">
                Invalid: {analysis.invalidCount}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Total: {analysis.rows.length}
              </span>
            </div>

            <div className="grid gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by project, tower, unit, status, or reason..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none ring-brand-300 transition focus:border-slate-400 focus:ring-2"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | UnitImportRowStatus)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none ring-brand-300 transition focus:border-slate-400 focus:ring-2"
              >
                <option value="ALL">All statuses</option>
                <option value="NEW">New</option>
                <option value="DUPLICATE">Duplicate</option>
                <option value="INVALID">Invalid</option>
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              <div className="space-y-2 lg:hidden">
                {table.getRowModel().rows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
                    No matching rows found for current filters.
                  </div>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const r = row.original;
                    return (
                      <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900">
                            Row {r.rowNumber} · {r.displayLabel || r.unitNoRaw}
                          </p>
                          <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTone(r.status)}`}>
                            {getStatusLabel(r.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {r.projectCode} / {r.towerCode}
                          {r.prefix ? ` · prefix ${r.prefix}` : ""}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                          <span>Uploaded unit</span>
                          <span className="text-right font-medium text-slate-800">{r.unitNoRaw}</span>
                          <span>Stored unit</span>
                          <span className="text-right font-medium text-slate-800">{r.unitNoNormalized || "—"}</span>
                          <span className="col-span-2 text-slate-500">Reason: {r.reason}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden overflow-auto rounded-xl border border-slate-200 lg:block">
                <table className="min-w-[1080px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const canSort = header.column.getCanSort();
                          const sortDir = header.column.getIsSorted();
                          return (
                            <th
                              key={header.id}
                              className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
                            >
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
                        <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-slate-500">
                          No matching rows found for current filters.
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="border-b border-slate-100 px-3 py-2 text-slate-700">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>
                  Showing {table.getRowModel().rows.length} of {filteredRows.length} filtered row(s)
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <span className="px-1 text-sm font-medium text-slate-600">
                  Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 sm:p-5">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={handleImportNonExisting}
                disabled={isImporting || analysis.importableCount === 0}
              >
                {isImporting ? "Importing..." : `Import New Rows (${analysis.importableCount})`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
