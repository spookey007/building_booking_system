"use client";

import { useMemo, useState, useTransition } from "react";
import type { LedgerType } from "@prisma/client";
import { Download, FileText } from "lucide-react";
import { downloadCustomerLedgerPdf } from "@/lib/reports/ledger-report-pdf";
import { buildCustomerLedgerExport, buildPortfolioLedgerExport } from "@/lib/actions/ledger-actions";
import type { LedgerExportResult } from "@/lib/actions/ledger-actions";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger/ledger-classification";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";

type CustomerOption = { id: string; fullName: string; cnic: string | null };
type BookingOption = { id: string; bookingNo: string; unitLabel: string };

const LEDGER_TYPES: LedgerType[] = ["OFFICIAL", "UNOFFICIAL", "UTILITY", "PARKING"];

function formatPkr(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);
}

export function LedgerWorkspace({
  customers,
  bookingsByCustomer,
  portfolioSummary,
}: {
  customers: CustomerOption[];
  bookingsByCustomer: Record<string, BookingOption[]>;
  portfolioSummary: { customerCount: number; bookingCount: number };
}) {
  const [isPending, startTransition] = useTransition();
  const [viewScope, setViewScope] = useState<"portfolio" | "customer">("portfolio");
  const [customerId, setCustomerId] = useState("");
  const [bookingScope, setBookingScope] = useState<"all" | "single">("all");
  const [bookingId, setBookingId] = useState("");
  const [ledgerTypes, setLedgerTypes] = useState<LedgerType[]>([...LEDGER_TYPES]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exportResult, setExportResult] = useState<LedgerExportResult | null>(null);

  const bookingOptions = useMemo(() => bookingsByCustomer[customerId] ?? [], [bookingsByCustomer, customerId]);

  const toggleLedger = (type: LedgerType) => {
    setLedgerTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const runExport = () => {
    if (ledgerTypes.length === 0) {
      showError("Select at least one ledger type.");
      return;
    }
    if (viewScope === "customer" && !customerId) {
      showError("Select a customer, or switch to all customers.");
      return;
    }

    startTransition(async () => {
      const result =
        viewScope === "portfolio"
          ? await buildPortfolioLedgerExport({
              ledgerTypes,
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
            })
          : await buildCustomerLedgerExport({
              customerId,
              bookingIds: bookingScope === "single" && bookingId ? [bookingId] : undefined,
              ledgerTypes,
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
            });

      if (!result) {
        showError("Customer not found.");
        return;
      }
      setExportResult(result);
      showSuccess(
        viewScope === "portfolio"
          ? `Portfolio ledger: ${result.lines.length} lines across ${result.customerCount} customers.`
          : "Ledger generated.",
      );
    });
  };

  const downloadCsv = () => {
    if (!exportResult) return;
    const showCustomer = exportResult.scope === "portfolio";
    const header = [
      ...(showCustomer ? ["Customer"] : []),
      "Date",
      "Booking",
      "Unit",
      "Receiving",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Ledger",
      "Mode",
    ];
    const rows = exportResult.lines.map((line) => [
      ...(showCustomer ? [line.customerName ?? ""] : []),
      line.date,
      line.bookingNo,
      line.unitLabel,
      line.receivingNo ?? "",
      line.description,
      line.debit.toFixed(2),
      line.credit.toFixed(2),
      line.balance.toFixed(2),
      line.ledgerType,
      line.mode,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      exportResult.scope === "portfolio"
        ? "fm-towers-portfolio-ledger.csv"
        : `ledger-${exportResult.customerName.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">FM Towers · Accounting</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Customer ledger</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Export official, unofficial, utility, and parking ledgers for the full portfolio ({portfolioSummary.bookingCount}{" "}
          bookings, {portfolioSummary.customerCount} customers) or drill into a single customer.
        </p>
      </header>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            id="ledger-view-scope"
            label="Export scope"
            value={viewScope}
            onChange={(e) => {
              setViewScope(e.target.value as "portfolio" | "customer");
              setExportResult(null);
            }}
            options={[
              { value: "portfolio", label: `All customers (${portfolioSummary.customerCount})` },
              { value: "customer", label: "Single customer" },
            ]}
          />
          {viewScope === "customer" ? (
            <SelectField
              id="ledger-customer"
              label="Customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setBookingId("");
                setExportResult(null);
              }}
              options={[
                { value: "", label: "Select customer…" },
                ...customers.map((c) => ({
                  value: c.id,
                  label: `${c.fullName}${c.cnic ? ` · ${c.cnic}` : ""}`,
                })),
              ]}
            />
          ) : null}
          {viewScope === "customer" ? (
            <SelectField
              id="ledger-scope"
              label="Booking scope"
              value={bookingScope}
              onChange={(e) => setBookingScope(e.target.value as "all" | "single")}
              options={[
                { value: "all", label: "All bookings" },
                { value: "single", label: "Single booking" },
              ]}
            />
          ) : null}
          {viewScope === "customer" && bookingScope === "single" ? (
            <SelectField
              id="ledger-booking"
              label="Booking"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              options={[
                { value: "", label: "Select booking…" },
                ...bookingOptions.map((b) => ({ value: b.id, label: `${b.bookingNo} — ${b.unitLabel}` })),
              ]}
            />
          ) : null}
          <Field id="ledger-from" label="From date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Field id="ledger-to" label="To date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Ledger types</p>
          <div className="flex flex-wrap gap-2">
            {LEDGER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleLedger(type)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  ledgerTypes.includes(type)
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {LEDGER_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={runExport} disabled={isPending}>
            {isPending ? "Generating…" : viewScope === "portfolio" ? "Generate portfolio ledger" : "Generate ledger"}
          </Button>
          {exportResult ? (
            <>
              <Button type="button" variant="secondary" onClick={downloadCsv}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  try {
                    await downloadCustomerLedgerPdf(exportResult);
                    showSuccess("PDF downloaded.");
                  } catch {
                    showError("Could not generate PDF.");
                  }
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      {exportResult ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-semibold text-slate-900">{exportResult.customerName}</p>
            <p className="text-xs text-slate-500">
              {exportResult.scope === "portfolio"
                ? `${exportResult.customerCount} customers · ${exportResult.bookingNos.length} bookings`
                : `Bookings: ${exportResult.bookingNos.join(", ") || "—"}`}{" "}
              · Types: {exportResult.ledgerTypes.map((t) => LEDGER_TYPE_LABELS[t]).join(", ")}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Total debits: {formatPkr(exportResult.totalDebits)} · Total received: {formatPkr(exportResult.totalCredits)} ·
              Closing balance: {formatPkr(exportResult.closingBalance)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {exportResult.scope === "portfolio" ? <th className="px-3 py-2">Customer</th> : null}
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {exportResult.lines.length === 0 ? (
                  <tr>
                    <td colSpan={exportResult.scope === "portfolio" ? 7 : 6} className="px-3 py-6 text-center text-slate-500">
                      No ledger lines for the selected filters.
                    </td>
                  </tr>
                ) : (
                  exportResult.lines.map((line, idx) => (
                    <tr key={`${line.bookingNo}-${line.customerName ?? ""}-${idx}`} className="border-t border-slate-100">
                      {exportResult.scope === "portfolio" ? (
                        <td className="px-3 py-2">{line.customerName ?? "—"}</td>
                      ) : null}
                      <td className="px-3 py-2">{line.date || "—"}</td>
                      <td className="px-3 py-2">{line.bookingNo}</td>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right">{line.debit > 0 ? formatPkr(line.debit) : "—"}</td>
                      <td className="px-3 py-2 text-right">{line.credit > 0 ? formatPkr(line.credit) : "—"}</td>
                      <td className="px-3 py-2 text-right">{formatPkr(line.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
