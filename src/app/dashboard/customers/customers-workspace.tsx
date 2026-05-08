"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pencil, RefreshCw, X } from "lucide-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";
import { customerUpdateSchema } from "@/lib/validations/customer";

export type CustomerRow = {
  id: string;
  fullName: string;
  phone: string | null;
  cnic: string | null;
  email: string | null;
  broker: string | null;
  nomineeCount: number;
  bookingCount: number;
};

type CustomerDetail = {
  id: string;
  fullName: string;
  fatherHusband: string | null;
  phone: string | null;
  phoneOffice: string | null;
  phoneRes: string | null;
  whatsapp: string | null;
  email: string | null;
  cnic: string | null;
  passportNo: string | null;
  nationality: string | null;
  postalAddress: string | null;
  income: number | null;
  age: number | null;
  occupation: string | null;
  broker: string | null;
  careOf: string | null;
  nominees: {
    id: string;
    name: string;
    relation: string | null;
    fatherName: string | null;
    address: string | null;
    cnic: string | null;
    cell: string | null;
    passportNo: string | null;
  }[];
};

function formatCnicInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function CustomersWorkspace() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nominees, setNominees] = useState<CustomerDetail["nominees"]>([]);

  const loadList = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: "500", skip: "0" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/customers?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 401) {
          showError("Session expired. Sign in again.");
          return;
        }
        throw new Error("Failed to load customers");
      }
      const data = (await res.json()) as {
        customers: CustomerRow[];
        total: number;
      };
      setRows(
        data.customers.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          phone: c.phone,
          cnic: c.cnic,
          email: c.email,
          broker: c.broker,
          nomineeCount: c.nomineeCount,
          bookingCount: c.bookingCount,
        })),
      );
      setTotal(data.total);
    } catch {
      showError("Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void loadList(debouncedQuery);
  }, [debouncedQuery, loadList]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(customerUpdateSchema),
    defaultValues: {
      fullName: "",
      fatherHusband: "",
      phone: "",
      phoneOffice: "",
      phoneRes: "",
      whatsapp: "",
      email: "",
      cnic: "",
      passportNo: "",
      nationality: "",
      postalAddress: "",
      occupation: "",
      broker: "",
      careOf: "",
    },
  });

  const openEdit = useCallback(
    async (id: string) => {
      setEditingId(id);
      setEditOpen(true);
      setEditLoading(true);
      setNominees([]);
      try {
        const res = await fetch(`/api/customers/${id}`);
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as { customer: CustomerDetail };
        const c = data.customer;
        reset({
          fullName: c.fullName,
          fatherHusband: c.fatherHusband ?? "",
          phone: c.phone ?? "",
          phoneOffice: c.phoneOffice ?? "",
          phoneRes: c.phoneRes ?? "",
          whatsapp: c.whatsapp ?? "",
          email: c.email ?? "",
          cnic: c.cnic ?? "",
          passportNo: c.passportNo ?? "",
          nationality: c.nationality ?? "",
          postalAddress: c.postalAddress ?? "",
          income: c.income ?? undefined,
          age: c.age ?? undefined,
          occupation: c.occupation ?? "",
          broker: c.broker ?? "",
          careOf: c.careOf ?? "",
        });
        setNominees(c.nominees ?? []);
      } catch {
        showError("Could not load customer.");
        setEditOpen(false);
        setEditingId(null);
      } finally {
        setEditLoading(false);
      }
    },
    [reset],
  );

  const onSave = async (values: Record<string, unknown>) => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string[]> };
      if (!res.ok) {
        if (res.status === 422 && payload.fieldErrors) {
          const first = Object.values(payload.fieldErrors).flat()[0];
          showError(first ?? payload.error ?? "Validation failed");
        } else {
          showError(payload.error ?? "Could not save customer.");
        }
        return;
      }
      showSuccess("Customer updated.");
      setEditOpen(false);
      setEditingId(null);
      await loadList(debouncedQuery);
    } catch {
      showError("Could not save customer.");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      { accessorKey: "fullName", header: "Name" },
      {
        accessorKey: "cnic",
        header: "CNIC",
        cell: ({ getValue }) => (getValue() as string | null) ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ getValue }) => (getValue() as string | null) ?? "—",
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ getValue }) => (
          <span className="max-w-[200px] truncate block" title={(getValue() as string | null) ?? ""}>
            {(getValue() as string | null) ?? "—"}
          </span>
        ),
      },
      { accessorKey: "broker", header: "Broker", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
      {
        accessorKey: "nomineeCount",
        header: "Nominees",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        accessorKey: "bookingCount",
        header: "Bookings",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => void openEdit(row.original.id)}>
            <Pencil className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">Edit</span>
          </Button>
        ),
      },
    ],
    [openEdit],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 }, sorting: [{ id: "fullName", desc: false }] },
  });

  return (
    <div className="space-y-4">
      <Card animate={false} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <Field
          id="customer-search"
          label="Search"
          placeholder="Name, CNIC, phone, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md flex-1"
        />
        <Button type="button" variant="secondary" onClick={() => void loadList(debouncedQuery)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </Card>

      <p className="text-xs text-slate-500">
        Showing {rows.length} of {total} customers{debouncedQuery ? ` matching “${debouncedQuery}”` : ""}.
      </p>

      <Card animate={false} className="hidden overflow-hidden rounded-2xl border border-slate-200 p-0 shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] text-sm">
            <thead className="bg-slate-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {h.isPlaceholder ? null : (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1">
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
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    No customers found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-middle text-slate-800">
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
            Page {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Previous
            </Button>
            <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-2 lg:hidden">
        {loading ? (
          <Card animate={false} className="py-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          </Card>
        ) : rows.length === 0 ? (
          <Card animate={false} className="py-10 text-center text-sm text-slate-500">
            No customers found.
          </Card>
        ) : (
          table.getRowModel().rows.map((r) => {
            const c = r.original;
            return (
              <Card key={c.id} animate={false} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{c.fullName}</p>
                  <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void openEdit(c.id)}>
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                  <span>CNIC</span>
                  <span className="text-right break-all">{c.cnic ?? "—"}</span>
                  <span>Phone</span>
                  <span className="text-right">{c.phone ?? "—"}</span>
                  <span>Email</span>
                  <span className="text-right break-all">{c.email ?? "—"}</span>
                  <span>Nominees</span>
                  <span className="text-right tabular-nums">{c.nomineeCount}</span>
                  <span>Bookings</span>
                  <span className="text-right tabular-nums">{c.bookingCount}</span>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {editOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-customer-title"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <h3 id="edit-customer-title" className="text-lg font-semibold text-slate-900">
                  Edit customer
                </h3>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                  onClick={() => {
                    setEditOpen(false);
                    setEditingId(null);
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {editLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSave)} className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="ec-name" label="Full name" error={errors.fullName?.message} {...register("fullName")} />
                    <Field
                      id="ec-father"
                      label="Father / husband"
                      error={errors.fatherHusband?.message}
                      {...register("fatherHusband")}
                    />
                    <Field
                      id="ec-cnic"
                      label="CNIC"
                      inputMode="numeric"
                      error={errors.cnic?.message}
                      {...register("cnic", {
                        onChange: (e) => {
                          e.target.value = formatCnicInput(e.target.value);
                        },
                      })}
                    />
                    <Field id="ec-passport" label="Passport" error={errors.passportNo?.message} {...register("passportNo")} />
                    <Field id="ec-phone" label="Primary phone" error={errors.phone?.message} {...register("phone")} />
                    <Field id="ec-office" label="Phone office" error={errors.phoneOffice?.message} {...register("phoneOffice")} />
                    <Field id="ec-res" label="Phone res." error={errors.phoneRes?.message} {...register("phoneRes")} />
                    <Field id="ec-wa" label="WhatsApp" error={errors.whatsapp?.message} {...register("whatsapp")} />
                    <Field id="ec-email" type="email" label="Email" error={errors.email?.message} {...register("email")} />
                    <Field id="ec-nationality" label="Nationality" error={errors.nationality?.message} {...register("nationality")} />
                    <Field id="ec-age" label="Age" inputMode="numeric" error={errors.age?.message as string} {...register("age")} />
                    <Field
                      id="ec-income"
                      label="Income"
                      error={errors.income?.message as string}
                      {...register("income")}
                    />
                    <Field id="ec-occupation" label="Occupation" error={errors.occupation?.message} {...register("occupation")} />
                    <Field id="ec-broker" label="Broker" error={errors.broker?.message} {...register("broker")} />
                    <Field id="ec-care" label="Care of" error={errors.careOf?.message} {...register("careOf")} />
                  </div>
                  <TextareaField
                    id="ec-address"
                    label="Postal address"
                    error={errors.postalAddress?.message}
                    {...register("postalAddress")}
                  />

                  {nominees.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-sm font-semibold text-slate-800">Nominees (read-only)</p>
                      <p className="text-xs text-slate-500">Manage nominees from booking flows or a future nominee editor.</p>
                      <ul className="mt-2 space-y-2 text-sm">
                        {nominees.map((n) => (
                          <li key={n.id} className="rounded-lg border border-slate-100 bg-white px-2 py-1.5">
                            <span className="font-medium">{n.name}</span>
                            {n.relation ? <span className="text-slate-500"> · {n.relation}</span> : null}
                            {n.cnic ? <span className="block text-xs text-slate-500">{n.cnic}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditOpen(false);
                        setEditingId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
