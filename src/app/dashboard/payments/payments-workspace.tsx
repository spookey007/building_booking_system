"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/data-table";
import { createPaymentAction, voidPaymentAction } from "@/lib/actions/payment-actions";
import { showActionResult, showError } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";

const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
] as const;

export type PaymentWorkspaceRow = {
  id: string;
  paymentDate: string;
  bookingNo: string;
  customerName: string;
  unitLabel: string;
  sourceBookingNo: string;
  mode: string;
  amount: string;
  referenceNo: string;
  installmentLabel: string;
  voidedAt: string | null;
  voidReason: string | null;
};

function formatPkr(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}

type BookingPick = {
  id: string;
  bookingNo: string;
  customerName: string;
  unitLabel: string;
  hasPlan: boolean;
  planName: string | null;
};

type InstallmentPick = {
  id: string;
  installmentNo: number;
  dueDate: string;
  dueAmount: string;
  paidAmount: string;
  remaining: string;
  status: string;
  canAcceptPayment: boolean;
};

export function PaymentsWorkspace({ initialRows }: { initialRows: PaymentWorkspaceRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentWorkspaceRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (!showVoided && row.voidedAt) return false;
      if (!q) return true;
      return [
        row.paymentDate,
        row.bookingNo,
        row.customerName,
        row.unitLabel,
        row.mode,
        row.referenceNo,
        row.sourceBookingNo,
        row.installmentLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [initialRows, query, showVoided]);

  const stats = useMemo(() => {
    let activeTotal = 0;
    let activeCount = 0;
    for (const r of initialRows) {
      if (r.voidedAt) continue;
      activeCount += 1;
      activeTotal += Number(r.amount);
    }
    return { activeCount, activeTotal };
  }, [initialRows]);

  const openVoid = (row: PaymentWorkspaceRow) => {
    setVoidTarget(row);
    setVoidReason("");
    setVoidOpen(true);
  };

  const columns = useMemo<ColumnDef<PaymentWorkspaceRow>[]>(
    () => [
      {
        accessorKey: "paymentDate",
        header: "Date",
        cell: ({ row }) => <span className="tabular-nums text-slate-700 dark:text-slate-200">{row.original.paymentDate}</span>,
      },
      {
        accessorKey: "bookingNo",
        header: "Booking",
        cell: ({ row }) => <span className="font-medium text-slate-900 dark:text-slate-100">{row.original.bookingNo}</span>,
      },
      {
        accessorKey: "customerName",
        header: "Customer",
      },
      { accessorKey: "unitLabel", header: "Unit" },
      {
        accessorKey: "installmentLabel",
        header: "Installment",
        cell: ({ row }) => (
          <span className="tabular-nums text-slate-600 dark:text-slate-300">{row.original.installmentLabel}</span>
        ),
      },
      {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {row.original.mode.replaceAll("_", " ")}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span
            className={`font-semibold tabular-nums ${row.original.voidedAt ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}
          >
            {formatPkr(row.original.amount)}
          </span>
        ),
      },
      { accessorKey: "referenceNo", header: "Reference" },
      {
        accessorKey: "sourceBookingNo",
        header: "Source",
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-400">{row.original.sourceBookingNo === "-" ? "—" : row.original.sourceBookingNo}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.voidedAt ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
              Voided
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Active
            </span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const r = row.original;
          if (r.voidedAt) {
            return <span className="text-xs text-slate-400">—</span>;
          }
          return (
            <Button
              type="button"
              variant="secondary"
              className="h-8 gap-1 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
              disabled={isPending}
              onClick={() => openVoid(r)}
            >
              <Ban className="h-3.5 w-3.5" />
              Void
            </Button>
          );
        },
      },
    ],
    [isPending],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card animate={false} className="rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active receipts</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{stats.activeCount}</p>
        </Card>
        <Card animate={false} className="rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-slate-700 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active total (non-voided)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatPkr(stats.activeTotal)}</p>
        </Card>
      </div>

      <Card animate={false} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-slate-700 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <Field
          id="payment-search"
          label="Search"
          placeholder="Booking, customer, unit, reference…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="rounded border-slate-300" />
          Show voided
        </label>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add payment
        </Button>
      </Card>

      <p className="text-xs text-slate-500">
        Showing {filteredRows.length} of {initialRows.length} loaded payments
        {query.trim() || !showVoided ? " (filters applied)" : ""}.
      </p>

      <DataTable
        data={filteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No payments match your filters."
        renderMobileCard={(row) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
                <p
                  className={`text-lg font-bold tabular-nums ${row.voidedAt ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}
                >
                  {formatPkr(row.amount)}
                </p>
                <p className="text-xs text-slate-500">
                  {row.bookingNo} · {row.customerName}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {row.mode.replaceAll("_", " ")}
              </span>
            </div>
            {row.voidedAt ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50/80 px-2 py-1.5 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                Voided{row.voidReason ? `: ${row.voidReason}` : ""}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
              <p className="text-slate-500">Date</p>
              <p className="text-right tabular-nums">{row.paymentDate}</p>
              <p className="text-slate-500">Unit</p>
              <p className="text-right">{row.unitLabel}</p>
              <p className="text-slate-500">Installment</p>
              <p className="text-right">{row.installmentLabel}</p>
              <p className="text-slate-500">Reference</p>
              <p className="text-right break-all">{row.referenceNo}</p>
              <p className="text-slate-500">Source booking</p>
              <p className="text-right">{row.sourceBookingNo}</p>
            </div>
            {!row.voidedAt ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full text-rose-700 dark:text-rose-300"
                disabled={isPending}
                onClick={() => openVoid(row)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Void payment
              </Button>
            ) : null}
          </div>
        )}
      />

      <AnimatePresence>
        {addOpen ? (
          <AddPaymentModal
            onClose={() => setAddOpen(false)}
            onSuccess={() => {
              setAddOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {voidOpen && voidTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-payment-title"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <h3 id="void-payment-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Void payment
                </h3>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close"
                  onClick={() => {
                    setVoidOpen(false);
                    setVoidTarget(null);
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {voidTarget.bookingNo} · {formatPkr(voidTarget.amount)} on {voidTarget.paymentDate}
                </p>
                <TextareaField
                  id="void-reason"
                  label="Reason (required)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, cheque bounced…"
                  rows={3}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setVoidOpen(false);
                      setVoidTarget(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-rose-600 text-white hover:bg-rose-700"
                    disabled={isPending || !voidReason.trim()}
                    onClick={() => {
                      if (!voidTarget) return;
                      startTransition(async () => {
                        const result = await voidPaymentAction({
                          paymentId: voidTarget.id,
                          voidReason: voidReason.trim(),
                        });
                        showActionResult(result);
                        if (result.ok) {
                          setVoidOpen(false);
                          setVoidTarget(null);
                          router.refresh();
                        }
                      });
                    }}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm void"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AddPaymentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingResults, setBookingResults] = useState<BookingPick[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingPick | null>(null);
  const [installments, setInstallments] = useState<InstallmentPick[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [installmentId, setInstallmentId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<string>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const searchBookings = useCallback(async (q: string) => {
    setBookingLoading(true);
    try {
      const params = new URLSearchParams({ take: "40" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/bookings/for-payments?${params}`);
      if (res.status === 401) {
        showError("Session expired. Sign in again.");
        setBookingResults([]);
        return;
      }
      if (!res.ok) throw new Error("fetch");
      const data = (await res.json()) as { bookings: BookingPick[] };
      setBookingResults(data.bookings);
    } catch {
      showError("Could not load bookings.");
      setBookingResults([]);
    } finally {
      setBookingLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void searchBookings(bookingQuery);
    }, 320);
    return () => window.clearTimeout(t);
  }, [bookingQuery, searchBookings]);

  const loadInstallments = useCallback(async (bookingId: string) => {
    setInstLoading(true);
    setInstallments([]);
    setInstallmentId("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/installments`);
      if (res.status === 401) {
        showError("Session expired.");
        return;
      }
      if (!res.ok) throw new Error("fetch");
      const data = (await res.json()) as { installments: InstallmentPick[] };
      setInstallments(data.installments);
    } catch {
      showError("Could not load installments.");
    } finally {
      setInstLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBooking?.id) {
      void loadInstallments(selectedBooking.id);
    } else {
      setInstallments([]);
      setInstallmentId("");
    }
  }, [selectedBooking, loadInstallments]);

  const selectedInst = useMemo(() => installments.find((i) => i.id === installmentId), [installments, installmentId]);

  useEffect(() => {
    if (!installmentId) return;
    const inst = installments.find((i) => i.id === installmentId);
    if (inst?.remaining) setAmount(inst.remaining);
  }, [installmentId, installments]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) {
      showError("Select a booking.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      const result = await createPaymentAction({
        bookingId: selectedBooking.id,
        installmentId: installmentId || null,
        paymentDate,
        amount: amt,
        mode: mode as (typeof PAYMENT_MODES)[number]["value"],
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
      });
      showActionResult(result);
      if (result.ok) onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-payment-title"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <h3 id="add-payment-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Record payment
          </h3>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-4">
          <Field
            id="bk-search"
            label="Find booking"
            placeholder="Booking no, customer name, CNIC, phone…"
            value={bookingQuery}
            onChange={(e) => setBookingQuery(e.target.value)}
          />

          <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            {bookingLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : bookingResults.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No bookings found.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {bookingResults.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBooking(b)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/80 ${
                        selectedBooking?.id === b.id ? "bg-brand-50 dark:bg-brand-950/30" : ""
                      }`}
                    >
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{b.bookingNo}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {b.customerName} · {b.unitLabel}
                        {b.hasPlan ? ` · ${b.planName ?? "Plan"}` : " · No payment plan"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedBooking ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                <p className="font-medium text-slate-900 dark:text-slate-100">{selectedBooking.bookingNo}</p>
                <p className="text-slate-600 dark:text-slate-400">
                  {selectedBooking.customerName} · {selectedBooking.unitLabel}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="installment-select" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Apply to installment (optional)
                </label>
                {instLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : installments.length === 0 ? (
                  <p className="text-sm text-slate-500">No schedule for this booking — payment will be recorded without an installment.</p>
                ) : (
                  <select
                    id="installment-select"
                    value={installmentId}
                    onChange={(e) => setInstallmentId(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">General / unallocated</option>
                    {installments.map((i) => (
                      <option key={i.id} value={i.id} disabled={!i.canAcceptPayment}>
                        #{i.installmentNo} · due {i.dueDate} · remaining {formatPkr(i.remaining)}
                        {!i.canAcceptPayment ? " (paid)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {selectedInst ? (
                  <p className="text-xs text-slate-500">
                    Due {formatPkr(selectedInst.dueAmount)} · already paid {formatPkr(selectedInst.paidAmount)} · status {selectedInst.status}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="pay-date" label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                <Field
                  id="pay-amt"
                  label="Amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="pay-mode" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Mode
                </label>
                <select
                  id="pay-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <Field id="pay-ref" label="Reference / cheque no." value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              <TextareaField id="pay-notes" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save payment"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a booking above to continue.</p>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}
