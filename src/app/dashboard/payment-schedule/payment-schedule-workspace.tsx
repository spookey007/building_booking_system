"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarClock, Download, LayoutList, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { paymentScheduleDemoSchema, type PaymentScheduleDemoInput } from "@/lib/validations/payment-schedule-demo";
import { downloadPaymentSchedulePdf } from "@/lib/payment-schedule-pdf";
import { savePaymentScheduleDemo } from "@/lib/payment-schedule-demo-storage";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

type BookingHit = {
  id: string;
  bookingNo: string;
  customerName: string;
  unitLabel: string;
  status: string;
};

const INTERVAL_OPTIONS = [
  { value: "1", label: "Monthly" },
  { value: "2", label: "Every 2 mo" },
  { value: "3", label: "Quarterly" },
  { value: "6", label: "Half-yearly" },
  { value: "12", label: "Yearly" },
];

function addCalendarMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setMonth(date.getMonth() + months);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function splitAmountEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  let remainder = cents - base * parts;
  const rows: number[] = [];
  for (let i = 0; i < parts; i += 1) {
    const add = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    rows.push((base + add) / 100);
  }
  return rows;
}

function formatMoney(amount: number, currency: "PKR" | "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

const defaultValues: PaymentScheduleDemoInput = {
  bookingId: "",
  bookingDisplayLabel: "",
  planTitle: "",
  totalAmount: 0,
  currency: "PKR",
  rows: [],
};

const cellInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";

function rowPaid(row: { amount: number; paidAmount?: number }) {
  const amt = Number(row.amount) || 0;
  const p = Number(row.paidAmount) || 0;
  return Math.min(Math.max(0, p), amt);
}

export function PaymentScheduleWorkspace() {
  const router = useRouter();
  const [isPdfPending, startPdf] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<BookingHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const [genCount, setGenCount] = useState(8);
  const [genFirstDue, setGenFirstDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [genInterval, setGenInterval] = useState("1");

  const form = useForm<PaymentScheduleDemoInput>({
    resolver: zodResolver(paymentScheduleDemoSchema) as Resolver<PaymentScheduleDemoInput>,
    defaultValues,
    mode: "onChange",
  });

  const { control, register, handleSubmit, watch, setValue, reset, formState } = form;
  const { fields, append, remove, replace } = useFieldArray({ control, name: "rows" });

  const rows = watch("rows");
  const totalAmount = watch("totalAmount");
  const currency = watch("currency");
  const bookingId = watch("bookingId");
  const bookingDisplayLabel = watch("bookingDisplayLabel");

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/bookings/for-schedule?q=${encodeURIComponent(q)}&take=12`, { signal: ac.signal });
        if (!res.ok) throw new Error("search");
        const data = (await res.json()) as { bookings: BookingHit[] };
        if (!ac.signal.aborted) setSearchHits(Array.isArray(data.bookings) ? data.bookings : []);
      } catch {
        if (!ac.signal.aborted) setSearchHits([]);
      } finally {
        if (!ac.signal.aborted) setSearchLoading(false);
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const scheduleStats = useMemo(() => {
    const rowCount = rows.length;
    const totalDue = rows.reduce((acc, r) => acc + (Number.isFinite(r.amount) ? r.amount : 0), 0);
    const totalPaid = rows.reduce((acc, r) => acc + rowPaid(r), 0);
    const pending = Math.max(0, totalDue - totalPaid);
    const sorted = [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const next = sorted.find((r) => {
      const amt = Number(r.amount) || 0;
      return rowPaid(r) < amt - 0.005;
    });
    const upcomingAmount = next ? Math.max(0, (Number(next.amount) || 0) - rowPaid(next)) : null;
    const upcomingDate = next?.dueDate ?? null;
    const contract = Number.isFinite(totalAmount) ? totalAmount : 0;
    const balanceVsContract = totalDue - contract;
    return { rowCount, totalDue, totalPaid, pending, upcomingAmount, upcomingDate, contract, balanceVsContract };
  }, [rows, totalAmount]);

  const pickBooking = useCallback(
    (hit: BookingHit) => {
      setValue("bookingId", hit.id, { shouldValidate: true, shouldDirty: true });
      setValue("bookingDisplayLabel", `${hit.bookingNo} · ${hit.customerName} · ${hit.unitLabel}`, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setSearchQuery("");
      setSearchHits([]);
      setSearchOpen(false);
    },
    [setValue],
  );

  const clearBooking = useCallback(() => {
    setValue("bookingId", "", { shouldValidate: true });
    setValue("bookingDisplayLabel", "", { shouldValidate: true });
    setSearchQuery("");
    setSearchHits([]);
  }, [setValue]);

  const generateRows = () => {
    const count = Math.min(60, Math.max(1, Math.round(Number(genCount))));
    const contract = Number(totalAmount);
    if (!Number.isFinite(contract) || contract <= 0) {
      showError("Enter a contract total first.");
      return;
    }
    if (!genFirstDue) {
      showError("Pick a first due date.");
      return;
    }
    const interval = Math.max(1, Math.round(Number(genInterval) || 1));
    const amounts = splitAmountEvenly(contract, count);
    replace(
      amounts.map((amount, index) => ({
        installmentNo: index + 1,
        dueDate: addCalendarMonths(genFirstDue, index * interval),
        amount,
        paidAmount: 0,
        label: "",
        notes: "",
      })),
    );
    showSuccess(`${count} installments added. Adjust paid amounts as you record receipts.`);
  };

  const onInvalidSubmit = () => {
    showError("Fix the highlighted fields before saving or exporting.");
  };

  const onSaveSnapshot = handleSubmit((values) => {
    savePaymentScheduleDemo(values);
    showSuccess("Saved for Reports → Payment schedule (demo).");
  }, onInvalidSubmit);

  const onExportPdf = handleSubmit((values) => {
    startPdf(async () => {
      try {
        const label = values.bookingDisplayLabel?.trim() || values.bookingId;
        await downloadPaymentSchedulePdf(label, values);
        showSuccess("PDF downloaded.");
      } catch {
        showError("Could not generate the PDF.");
      }
    });
  }, onInvalidSubmit);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Payment schedule</h2>
          <p className="text-sm text-slate-600">
            Search bookings by number or name (nothing loads until you type). One screen: contract, rows, paid vs pending,
            then export or save for reports.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 self-start"
          onClick={() => router.push("/dashboard/reports/payment-schedule")}
        >
          <LayoutList className="mr-2 h-4 w-4" />
          Reports
        </Button>
      </header>

      <Card className="space-y-5 p-4 sm:p-6">
        {/* Stats */}
        <section aria-label="Schedule summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Installment rows" value={String(scheduleStats.rowCount)} hint="Lines in grid" />
            <StatTile label="Total due (rows)" value={formatMoney(scheduleStats.totalDue, currency)} hint="Sum of row amounts" />
            <StatTile label="Total paid" value={formatMoney(scheduleStats.totalPaid, currency)} hint="Sum of paid column" />
            <StatTile label="Pending" value={formatMoney(scheduleStats.pending, currency)} hint="Due minus paid" />
            <StatTile
              label="Upcoming"
              value={scheduleStats.upcomingAmount != null ? formatMoney(scheduleStats.upcomingAmount, currency) : "—"}
              hint={scheduleStats.upcomingDate ? `Due ${scheduleStats.upcomingDate}` : "All rows settled"}
              className="col-span-2 sm:col-span-1 lg:col-span-2"
            />
            <StatTile
              label="Contract"
              value={formatMoney(scheduleStats.contract, currency)}
              hint={
                Math.abs(scheduleStats.balanceVsContract) <= 0.02
                  ? "Matches row total"
                  : "Rows vs contract differ"
              }
              variant={Math.abs(scheduleStats.balanceVsContract) <= 0.02 ? "ok" : "warn"}
            />
          </div>
        </section>

        {/* Booking + contract — single band */}
        <section className="space-y-4 border-t border-slate-200/80 pt-5">
            <div className="grid gap-4 lg:grid-cols-12 lg:items-end">
              <input type="hidden" {...register("bookingDisplayLabel")} />
            <div className="lg:col-span-5" ref={searchWrapRef}>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Booking</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Type booking no., customer, or CNIC (min 2 characters)…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  className="w-full rounded-xl border border-slate-300/90 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                />
                {searchOpen && (searchQuery.trim().length >= 2 || searchLoading) ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {searchLoading ? (
                      <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
                    ) : searchHits.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-500">No matches. Try another spelling.</p>
                    ) : (
                      searchHits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickBooking(hit)}
                        >
                          <span className="font-semibold text-slate-900">{hit.bookingNo}</span>
                          <span className="text-xs text-slate-600">
                            {hit.customerName} · {hit.unitLabel}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {bookingId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950">
                  <CalendarClock className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span className="min-w-0 flex-1 font-medium">
                    {bookingDisplayLabel?.trim() ? (
                      bookingDisplayLabel
                    ) : (
                      <span className="font-mono text-xs text-emerald-900/90">{bookingId}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg p-1 text-emerald-800 hover:bg-emerald-100"
                    aria-label="Clear booking"
                    onClick={clearBooking}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Search to link a booking, or paste its ID on the right.</p>
              )}
            </div>

            <Field
              id="bookingId"
              label="Booking ID"
              className="lg:col-span-4"
              hint="Filled when you pick a result, or paste a CUID yourself."
              error={formState.errors.bookingId?.message}
              {...register("bookingId", {
                onChange: () => {
                  setValue("bookingDisplayLabel", "", { shouldDirty: true });
                },
              })}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:col-span-3">
              <SelectField
                id="currency"
                label="Currency"
                value={currency}
                onChange={(e) =>
                  setValue("currency", e.target.value as "PKR" | "USD", { shouldValidate: true, shouldDirty: true })
                }
                options={[
                  { value: "PKR", label: "PKR" },
                  { value: "USD", label: "USD" },
                ]}
              />
              <Field
                id="totalAmount"
                label="Contract total"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                error={formState.errors.totalAmount?.message}
                {...register("totalAmount")}
              />
            </div>
          </div>

          <Field
            id="planTitle"
            label="Plan note (optional)"
            hint="Shown on PDF; leave blank if you do not need it."
            error={formState.errors.planTitle?.message}
            {...register("planTitle")}
          />
        </section>

        {/* Generator — one compact row */}
        <section className="flex flex-col gap-3 border-t border-slate-200/80 pt-5 sm:flex-row sm:flex-wrap sm:items-end">
          <Field
            id="genCount"
            label="Count"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            className="w-full sm:w-24"
            value={genCount}
            onChange={(e) => setGenCount(Number(e.target.value))}
          />
          <Field
            id="genFirstDue"
            label="First due"
            type="date"
            className="w-full sm:min-w-[11rem] sm:max-w-[12rem]"
            value={genFirstDue}
            onChange={(e) => setGenFirstDue(e.target.value)}
          />
          <div className="w-full sm:min-w-[9rem] sm:max-w-[11rem]">
            <SelectField
              id="genInterval"
              label="Interval"
              value={genInterval}
              onChange={(e) => setGenInterval(e.target.value)}
              options={INTERVAL_OPTIONS}
            />
          </div>
          <Button type="button" className="w-full sm:w-auto sm:shrink-0" onClick={generateRows}>
            Fill equal installments
          </Button>
          <Button type="button" variant="ghost" className="w-full sm:ml-auto sm:w-auto" onClick={() => reset(defaultValues)}>
            Reset all
          </Button>
        </section>

        {formState.errors.rows?.message ? (
          <p className="text-sm font-medium text-rose-600" role="alert">
            {formState.errors.rows.message}
          </p>
        ) : null}

        {/* Mobile: cards */}
        <div className="space-y-3 md:hidden">
          {fields.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
              Use <strong>Fill equal installments</strong> or add a row.
            </p>
          ) : (
            fields.map((field, index) => {
              const rowErrors = formState.errors.rows?.[index];
              const r = rows[index];
              const amt = Number(r?.amount) || 0;
              const paid = rowPaid(r ?? { amount: 0, paidAmount: 0 });
              return (
                <div key={field.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Row {index + 1}</span>
                    <Button type="button" variant="ghost" className="h-8 px-2 text-rose-600" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field id={`m-${index}-no`} label="#" type="number" error={rowErrors?.installmentNo?.message} {...register(`rows.${index}.installmentNo`)} />
                    <Field id={`m-${index}-due`} label="Due" type="date" error={rowErrors?.dueDate?.message} {...register(`rows.${index}.dueDate`)} />
                    <Field id={`m-${index}-amt`} label="Due amt" type="number" step="0.01" error={rowErrors?.amount?.message} {...register(`rows.${index}.amount`)} />
                    <Field id={`m-${index}-paid`} label="Paid" type="number" step="0.01" min={0} error={rowErrors?.paidAmount?.message} {...register(`rows.${index}.paidAmount`)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Balance on row: <span className="font-semibold text-slate-900">{formatMoney(amt - paid, currency)}</span>
                  </p>
                  <Field id={`m-${index}-label`} label="Label (optional)" className="mt-3" {...register(`rows.${index}.label`)} />
                </div>
              );
            })
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() =>
              append({
                installmentNo: fields.length + 1,
                dueDate: genFirstDue,
                amount: 0,
                paidAmount: 0,
                label: "",
                notes: "",
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add row
          </Button>
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90">
            <table className="min-w-[44rem] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Due amt</th>
                  <th className="px-2 py-2">Paid</th>
                  <th className="px-2 py-2">Balance</th>
                  <th className="min-w-[7rem] px-2 py-2">Label</th>
                  <th className="px-2 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-600">
                      Use <span className="font-semibold">Fill equal installments</span> or add a row.
                    </td>
                  </tr>
                ) : (
                  fields.map((field, index) => {
                    const rowErrors = formState.errors.rows?.[index];
                    const r = rows[index];
                    const amt = Number(r?.amount) || 0;
                    const paid = rowPaid(r ?? { amount: 0, paidAmount: 0 });
                    return (
                      <tr key={field.id}>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="number"
                            className={cn(cellInputClass, "w-14", rowErrors?.installmentNo && "border-rose-400")}
                            {...register(`rows.${index}.installmentNo`)}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="date"
                            className={cn(cellInputClass, "min-w-[9.5rem]", rowErrors?.dueDate && "border-rose-400")}
                            {...register(`rows.${index}.dueDate`)}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="number"
                            step="0.01"
                            className={cn(cellInputClass, "min-w-[6.5rem]", rowErrors?.amount && "border-rose-400")}
                            {...register(`rows.${index}.amount`)}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className={cn(cellInputClass, "min-w-[6.5rem]", rowErrors?.paidAmount && "border-rose-400")}
                            {...register(`rows.${index}.paidAmount`)}
                          />
                        </td>
                        <td className="px-2 py-2 align-middle text-xs font-medium tabular-nums text-slate-700">
                          {formatMoney(amt - paid, currency)}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <input type="text" className={cellInputClass} {...register(`rows.${index}.label`)} />
                        </td>
                        <td className="px-2 py-1.5 align-top text-right">
                          <Button type="button" variant="ghost" className="px-2 text-rose-600" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                append({
                  installmentNo: fields.length + 1,
                  dueDate: genFirstDue,
                  amount: 0,
                  paidAmount: 0,
                  label: "",
                  notes: "",
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add row
            </Button>
          </div>
        </div>

        {Math.abs(scheduleStats.balanceVsContract) > 0.02 && fields.length > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Row amounts total <strong>{formatMoney(scheduleStats.totalDue, currency)}</strong> but contract is{" "}
              <strong>{formatMoney(scheduleStats.contract, currency)}</strong>. Align them before export if that matters
              for your process.
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-slate-200/80 pt-5 sm:flex-row sm:flex-wrap">
          <Button type="button" disabled={isPdfPending} onClick={onExportPdf}>
            <Download className="mr-2 h-4 w-4" />
            {isPdfPending ? "PDF…" : "Download PDF"}
          </Button>
          <Button type="button" variant="secondary" onClick={onSaveSnapshot}>
            <Save className="mr-2 h-4 w-4" />
            Save for reports
          </Button>
        </div>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  className,
  variant = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
  variant?: "neutral" | "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        variant === "ok" && "border-emerald-200/90 bg-emerald-50/50",
        variant === "warn" && "border-amber-200/90 bg-amber-50/60",
        variant === "neutral" && "border-slate-200/80 bg-slate-50/50",
        className,
      )}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}
