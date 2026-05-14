"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Plus, Search, X } from "lucide-react";
import {
  switchBookingToNewUnitAction,
  transferBookingToNewCustomerAction,
  updateBookingFromFormAction,
} from "@/lib/actions/booking-actions";
import { downloadBookingDocumentPdf } from "@/lib/booking-document-pdf";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { BookingForm } from "@/components/booking/booking-form";
import { BookingsTable, type BookingRow } from "./bookings-table";

type BookingsWorkspaceProps = {
  rows: BookingRow[];
  startDate: string;
  endDate: string;
  projects: { code: string; name: string }[];
};

const steps = [
  { key: "booking", title: "Booking setup", hint: "Date, serial, and mode details" },
  { key: "unit", title: "Unit information", hint: "Tower, size, and category metadata" },
  { key: "applicant", title: "Primary applicant", hint: "Identity, contact, and address" },
  { key: "nominee", title: "Nominee details", hint: "Optional nominee profile fields" },
  { key: "finance", title: "Financial block", hint: "Pricing and payable figures" },
] as const;

export function BookingsWorkspace({ rows, startDate, endDate, projects }: BookingsWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [modalActionValue, setModalActionValue] = useState("");
  const [range, setRange] = useState({ startDate, endDate });

  const titleRange = useMemo(() => `${range.startDate} to ${range.endDate}`, [range.endDate, range.startDate]);

  useEffect(() => {
    if (viewBooking) setModalActionValue("");
  }, [viewBooking?.id]);

  const modalActionOptions = useMemo(
    () => [
      { value: "", label: "Choose an action…" },
      { value: "pdf", label: "Download PDF" },
      ...(isEditMode ? [{ value: "view", label: "Leave edit mode (read-only)" }] : [{ value: "edit", label: "Edit booking" }]),
    ],
    [isEditMode],
  );

  const handleFetch = () => {
    if (!range.startDate || !range.endDate) {
      showError("Please select both start and end dates.");
      return;
    }
    if (range.startDate > range.endDate) {
      showError("Start date cannot be after end date.");
      return;
    }
    const params = new URLSearchParams();
    params.set("startDate", range.startDate);
    params.set("endDate", range.endDate);
    startTransition(() => {
      router.push(`/dashboard/bookings?${params.toString()}`);
    });
  };

  return (
    <>
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">Bookings</h2>
          <p className="text-sm text-slate-500">Manage and review bookings for the selected date range.</p>
        </header>

        <Card animate={false} className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CalendarRange className="h-4 w-4 text-brand-600" />
              <span className="font-medium">Showing:</span>
              <span>{titleRange}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={handleFetch} disabled={isPending}>
                <Search className="mr-2 h-4 w-4" />
                {isPending ? "Fetching..." : "Fetch Bookings"}
              </Button>
              <Button type="button" onClick={() => setShowAddModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Booking
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <Field
              id="startDate"
              label="Start date"
              type="date"
              value={range.startDate}
              onChange={(event) => setRange((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <Field
              id="endDate"
              label="End date"
              type="date"
              value={range.endDate}
              onChange={(event) => setRange((prev) => ({ ...prev, endDate: event.target.value }))}
            />
          </div>
        </Card>

        <BookingsTable
          data={rows}
          onView={(row) => {
            setViewBooking(row);
            setIsEditMode(false);
          }}
        />
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            aria-label="Close add booking modal"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative z-10 w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add Booking</h3>
                <p className="text-xs text-slate-500">Compact modal form optimized for laptop and mobile screens.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setShowAddModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[85vh] overflow-y-auto">
              <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="hidden border-b border-slate-200 bg-slate-50/70 p-4 lg:sticky lg:top-0 lg:block lg:h-fit lg:self-start lg:border-b-0 lg:border-r lg:p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Form Steps</p>
                  <ol className="space-y-2">
                    {steps.map((step, index) => (
                      <li key={step.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold text-brand-600">Step {index + 1}</p>
                        <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                        <p className="text-xs text-slate-500">{step.hint}</p>
                      </li>
                    ))}
                  </ol>
                </aside>
                <div className="p-3 sm:p-5">
                  <BookingForm
                    projects={projects}
                    compact
                    hideTopBar
                    onSuccess={() => {
                      setShowAddModal(false);
                      router.refresh();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewBooking ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            aria-label="Close booking modal"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setViewBooking(null)}
          />
          <div className="relative z-10 w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {isEditMode ? `Edit Booking ${viewBooking.bookingNo}` : `View Booking ${viewBooking.bookingNo}`}
                </h3>
                <p className="text-xs text-slate-500">Full booking data in the same layout as add booking modal.</p>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2 sm:gap-3">
                <div className="w-full min-w-0 sm:w-56 sm:flex-1 sm:max-w-xs">
                  <SelectField
                    id="bookingModalActions"
                    label="Actions"
                    value={modalActionValue}
                    options={modalActionOptions}
                    onChange={(event) => {
                      const v = event.target.value;
                      const booking = viewBooking;
                      if (!v || !booking) {
                        setModalActionValue("");
                        return;
                      }
                      if (v === "pdf") {
                        void (async () => {
                          try {
                            await downloadBookingDocumentPdf(
                              {
                                bookingNo: booking.bookingNo,
                                bookingDate: booking.bookingDate,
                                customerName: booking.customerName,
                                unitLabel: booking.unitLabel,
                                projectCode: booking.projectCode,
                                mode: booking.mode,
                                status: booking.status,
                                unitPrice: booking.unitPrice,
                                discountAmount: booking.discountAmount,
                                cashPayable: booking.cashPayable,
                                grossTotal: booking.grossTotal,
                                payableCost: booking.payableCost,
                                notes: booking.notes,
                                formDefaults: booking.formDefaults,
                              },
                              { projectName: projects.find((p) => p.code === booking.projectCode)?.name },
                            );
                            showSuccess("Booking PDF downloaded.");
                          } catch {
                            showError("Could not generate PDF.");
                          }
                        })();
                      } else if (v === "edit") {
                        setIsEditMode(true);
                      } else if (v === "view") {
                        setIsEditMode(false);
                      }
                      setTimeout(() => setModalActionValue(""), 0);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="mt-7 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:mt-8"
                  onClick={() => setViewBooking(null)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[85vh] overflow-y-auto">
              <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="hidden border-b border-slate-200 bg-slate-50/70 p-4 lg:sticky lg:top-0 lg:block lg:h-fit lg:self-start lg:border-b-0 lg:border-r lg:p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Form Steps</p>
                  <ol className="space-y-2">
                    {steps.map((step, index) => (
                      <li key={step.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold text-brand-600">Step {index + 1}</p>
                        <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                        <p className="text-xs text-slate-500">{step.hint}</p>
                      </li>
                    ))}
                  </ol>
                </aside>
                <div className="p-3 sm:p-5">
                  <BookingForm
                    projects={projects}
                    compact
                    hideTopBar
                    readOnly={!isEditMode}
                    submitLabel="Update Booking"
                    enableTransferSwitchActions={isEditMode}
                    unitSearchIncludeId={viewBooking.unitId}
                    initialValues={viewBooking.formDefaults}
                    onSubmitAction={(values) => updateBookingFromFormAction(viewBooking.id, values)}
                    onTransferAction={(values) => transferBookingToNewCustomerAction(viewBooking.id, values)}
                    onSwitchAction={(values) => switchBookingToNewUnitAction(viewBooking.id, values)}
                    onSuccess={() => {
                      setIsEditMode(false);
                      setViewBooking(null);
                      router.refresh();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
