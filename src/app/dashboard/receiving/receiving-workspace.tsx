"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { LedgerType } from "@prisma/client";
import { DataTable } from "@/components/ui/data-table";
import { createReceivingAction, voidReceivingAction, settleLiabilityAction } from "@/lib/actions/receiving-actions";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger/ledger-classification";
import { showActionResult, showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { TextareaField } from "@/components/ui/textarea-field";

const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
] as const;

const LEDGER_OPTIONS = (["OFFICIAL", "UNOFFICIAL", "UTILITY", "PARKING"] as LedgerType[]).map((value) => ({
  value,
  label: LEDGER_TYPE_LABELS[value],
}));

export type ReceivingWorkspaceRow = {
  id: string;
  receivingNo: string;
  receivedDate: string;
  customerName: string;
  mode: string;
  totalAmount: string;
  allocationCount: number;
  voidedAt: string | null;
};

export type LiabilityRow = {
  id: string;
  bookingNo: string;
  transferBookingNo: string | null;
  liabilityType: string;
  amount: string;
  reason: string;
  status: string;
};

type AllocationLine = {
  key: string;
  bookingId: string;
  bookingLabel: string;
  installmentId: string;
  installmentLabel: string;
  amount: string;
  ledgerType: LedgerType;
};

type CustomerHit = { id: string; fullName: string; cnic: string | null };
type BookingData = {
  id: string;
  bookingNo: string;
  unitLabel: string;
  installments: {
    id: string;
    installmentNo: number;
    dueDate: string;
    remaining: number;
    canAcceptPayment: boolean;
  }[];
};

function formatPkr(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);
}

export function ReceivingWorkspace({
  initialRows,
  liabilities,
}: {
  initialRows: ReceivingWorkspaceRow[];
  liabilities: LiabilityRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [customerBookings, setCustomerBookings] = useState<BookingData[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]["value"]>("CASH");
  const [notes, setNotes] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBranch, setChequeBranch] = useState("");
  const [chequeDrawer, setChequeDrawer] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeStatus, setChequeStatus] = useState("PENDING");
  const [onlineReceivedFrom, setOnlineReceivedFrom] = useState("");
  const [onlineReference, setOnlineReference] = useState("");
  const [allocations, setAllocations] = useState<AllocationLine[]>([]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (row.voidedAt) return false;
      if (!q) return true;
      return [row.receivingNo, row.customerName, row.mode].join(" ").toLowerCase().includes(q);
    });
  }, [initialRows, query]);

  const allocationTotal = useMemo(
    () => allocations.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [allocations],
  );

  const columns = useMemo<ColumnDef<ReceivingWorkspaceRow>[]>(
    () => [
      { accessorKey: "receivedDate", header: "Date" },
      { accessorKey: "receivingNo", header: "Receiving no." },
      { accessorKey: "customerName", header: "Customer" },
      { accessorKey: "mode", header: "Mode" },
      {
        accessorKey: "totalAmount",
        header: "Amount",
        cell: ({ row }) => formatPkr(row.original.totalAmount),
      },
      { accessorKey: "allocationCount", header: "Lines" },
    ],
    [],
  );

  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&take=12`);
      if (!res.ok) return;
      const data = (await res.json()) as { customers: CustomerHit[] };
      setCustomerHits(data.customers ?? []);
    }, 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  const loadCustomerBookings = useCallback(async (customerId: string) => {
    setLoadingBookings(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/receiving-data`);
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { bookings: BookingData[] };
      setCustomerBookings(data.bookings);
    } catch {
      showError("Could not load customer bookings.");
      setCustomerBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  const pickCustomer = (customer: CustomerHit) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.fullName);
    setCustomerHits([]);
    setAllocations([]);
    void loadCustomerBookings(customer.id);
  };

  const addAllocationLine = () => {
    const firstBooking = customerBookings[0];
    if (!firstBooking) {
      showError("No active bookings for this customer.");
      return;
    }
    const firstInst = firstBooking.installments.find((i) => i.canAcceptPayment) ?? firstBooking.installments[0];
    setAllocations((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        bookingId: firstBooking.id,
        bookingLabel: `${firstBooking.bookingNo} — ${firstBooking.unitLabel}`,
        installmentId: firstInst?.id ?? "",
        installmentLabel: firstInst ? `#${firstInst.installmentNo} (${firstInst.dueDate})` : "—",
        amount: firstInst ? String(firstInst.remaining) : "",
        ledgerType: "OFFICIAL",
      },
    ]);
  };

  const resetForm = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerBookings([]);
    setAllocations([]);
    setNotes("");
    setChequeNo("");
    setChequeBank("");
    setChequeBranch("");
    setChequeDrawer("");
    setChequeDate("");
    setOnlineReceivedFrom("");
    setOnlineReference("");
    setMode("CASH");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer) {
      showError("Select a customer.");
      return;
    }
    if (allocations.length === 0) {
      showError("Add at least one allocation line.");
      return;
    }

    startTransition(async () => {
      const result = await createReceivingAction({
        customerId: selectedCustomer.id,
        receivedDate,
        mode,
        notes: notes || null,
        chequeNo: mode === "CHEQUE" ? chequeNo : null,
        chequeBank: mode === "CHEQUE" ? chequeBank : null,
        chequeBranch: mode === "CHEQUE" ? chequeBranch : null,
        chequeDrawer: mode === "CHEQUE" ? chequeDrawer : null,
        chequeDate: mode === "CHEQUE" && chequeDate ? chequeDate : null,
        chequeStatus: mode === "CHEQUE" ? chequeStatus : null,
        onlineReceivedFrom: mode === "ONLINE" ? onlineReceivedFrom : null,
        onlineReference: mode === "ONLINE" ? onlineReference : null,
        allocations: allocations.map((line) => ({
          bookingId: line.bookingId,
          installmentId: line.installmentId || null,
          amount: Number(line.amount),
          ledgerType: line.ledgerType,
        })),
      });
      showActionResult(result);
      if (result.ok) {
        setAddOpen(false);
        resetForm();
        router.refresh();
      }
    });
  };

  const handleVoidReceiving = (receivingId: string) => {
    const reason = window.prompt("Reason for voiding this receiving:");
    if (!reason?.trim()) return;
    startTransition(async () => {
      const result = await voidReceivingAction({ receivingId, voidReason: reason.trim() });
      showActionResult(result);
      if (result.ok) router.refresh();
    });
  };

  const handleSettleLiability = (liabilityId: string) => {
    startTransition(async () => {
      const result = await settleLiabilityAction({ liabilityId, notes: "Settled from receiving module" });
      showActionResult(result);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Field
          id="recv-search"
          label="Search receivings"
          placeholder="Receiving no., customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New receiving
        </Button>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No receivings recorded yet."
        renderMobileCard={(row) => (
          <div className="space-y-2 text-sm">
            <p className="font-bold text-slate-900">{row.receivingNo}</p>
            <p className="text-slate-600">{row.customerName}</p>
            <p>{formatPkr(row.totalAmount)} · {row.mode}</p>
            <p className="text-xs text-slate-500">{row.receivedDate} · {row.allocationCount} line(s)</p>
          </div>
        )}
      />

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <Card className="mt-8 w-full max-w-3xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Record receiving</h3>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field
                id="customer-search"
                label="Customer"
                placeholder="Search by name or CNIC"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomer(null);
                }}
              />
              {customerHits.length > 0 ? (
                <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white text-sm">
                  {customerHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => pickCustomer(hit)}
                      >
                        {hit.fullName}
                        {hit.cnic ? ` · ${hit.cnic}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="recv-date" label="Received date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
                <SelectField
                  id="recv-mode"
                  label="Payment method"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as (typeof PAYMENT_MODES)[number]["value"])}
                  options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
                />
              </div>

              {mode === "CHEQUE" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="ch-no" label="Cheque no." value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} required />
                  <Field id="ch-bank" label="Bank" value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} required />
                  <Field id="ch-branch" label="Branch" value={chequeBranch} onChange={(e) => setChequeBranch(e.target.value)} />
                  <Field id="ch-drawer" label="Drawer" value={chequeDrawer} onChange={(e) => setChequeDrawer(e.target.value)} />
                  <Field id="ch-date" label="Cheque date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                  <SelectField
                    id="ch-status"
                    label="Cheque status"
                    value={chequeStatus}
                    onChange={(e) => setChequeStatus(e.target.value)}
                    options={[
                      { value: "PENDING", label: "Pending" },
                      { value: "CLEARED", label: "Cleared" },
                      { value: "BOUNCED", label: "Bounced" },
                    ]}
                  />
                </div>
              ) : null}

              {mode === "ONLINE" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="ol-from" label="Received from" value={onlineReceivedFrom} onChange={(e) => setOnlineReceivedFrom(e.target.value)} required />
                  <Field id="ol-ref" label="Transaction / reference" value={onlineReference} onChange={(e) => setOnlineReference(e.target.value)} />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Allocations (split across bookings / installments)</p>
                  <Button type="button" variant="secondary" onClick={addAllocationLine} disabled={!selectedCustomer || loadingBookings}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add line
                  </Button>
                </div>
                {loadingBookings ? (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading bookings…
                  </p>
                ) : null}
                {allocations.map((line) => (
                  <div key={line.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <SelectField
                        id={`bk-${line.key}`}
                        label="Booking"
                        value={line.bookingId}
                        onChange={(e) => {
                          const booking = customerBookings.find((b) => b.id === e.target.value);
                          setAllocations((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? {
                                    ...row,
                                    bookingId: e.target.value,
                                    bookingLabel: booking ? `${booking.bookingNo} — ${booking.unitLabel}` : row.bookingLabel,
                                    installmentId: booking?.installments[0]?.id ?? "",
                                    installmentLabel: booking?.installments[0]
                                      ? `#${booking.installments[0].installmentNo}`
                                      : "—",
                                  }
                                : row,
                            ),
                          );
                        }}
                        options={customerBookings.map((b) => ({
                          value: b.id,
                          label: `${b.bookingNo} — ${b.unitLabel}`,
                        }))}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <SelectField
                        id={`inst-${line.key}`}
                        label="Installment"
                        value={line.installmentId}
                        onChange={(e) => {
                          const booking = customerBookings.find((b) => b.id === line.bookingId);
                          const inst = booking?.installments.find((i) => i.id === e.target.value);
                          setAllocations((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? {
                                    ...row,
                                    installmentId: e.target.value,
                                    installmentLabel: inst ? `#${inst.installmentNo}` : "—",
                                    amount: inst ? String(inst.remaining) : row.amount,
                                  }
                                : row,
                            ),
                          );
                        }}
                        options={(customerBookings.find((b) => b.id === line.bookingId)?.installments ?? []).map((inst) => ({
                          value: inst.id,
                          label: `#${inst.installmentNo} · ${inst.dueDate} · rem ${inst.remaining}`,
                        }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field id={`amt-${line.key}`} label="Amount" value={line.amount} onChange={(e) => setAllocations((prev) => prev.map((row) => (row.key === line.key ? { ...row, amount: e.target.value } : row)))} />
                    </div>
                    <div className="sm:col-span-2">
                      <SelectField
                        id={`led-${line.key}`}
                        label="Ledger"
                        value={line.ledgerType}
                        onChange={(e) =>
                          setAllocations((prev) =>
                            prev.map((row) =>
                              row.key === line.key ? { ...row, ledgerType: e.target.value as LedgerType } : row,
                            ),
                          )
                        }
                        options={LEDGER_OPTIONS}
                      />
                    </div>
                    <div className="flex items-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setAllocations((prev) => prev.filter((row) => row.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-sm font-semibold text-slate-700">Total: {formatPkr(allocationTotal)}</p>
              </div>

              <TextareaField id="recv-notes" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving…" : "Save receiving"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-amber-800">Open FM Towers liabilities</h3>
        {liabilities.length === 0 ? (
          <p className="text-sm text-slate-500">No open liabilities.</p>
        ) : (
          liabilities.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {row.bookingNo}
                  {row.transferBookingNo ? ` → ${row.transferBookingNo}` : ""} · {row.liabilityType}
                </p>
                <p className="text-xs text-slate-500">{row.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{formatPkr(row.amount)}</span>
                {row.status === "OPEN" ? (
                  <Button type="button" variant="secondary" onClick={() => handleSettleLiability(row.id)} disabled={isPending}>
                    Settle
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
