"use client";

import type { ReactNode } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";

type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  emptyMessage?: string;
  getRowId: (row: TData) => string;
  renderMobileCard: (row: TData) => ReactNode;
};

export function DataTable<TData>({
  data,
  columns,
  emptyMessage = "No records found.",
  getRowId,
  renderMobileCard,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (data.length === 0) {
    return (
      <Card animate={false} className="border-dashed px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        {emptyMessage}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card animate={false} className="hidden overflow-hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/40">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200/80 dark:border-slate-700/70">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100/90 text-slate-700 dark:border-slate-800 dark:text-slate-200">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-3 lg:hidden">
        {data.map((item) => (
          <Card key={getRowId(item)} animate={false} className="p-4">
            {renderMobileCard(item)}
          </Card>
        ))}
      </div>
    </div>
  );
}
