"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";
import { mergeBookingsAction } from "@/lib/actions/booking-actions";
import { showActionResult, showError } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { TextareaField } from "@/components/ui/textarea-field";

type MergeBookingOption = {
  id: string;
  bookingNo: string;
  customerName: string;
  unitLabel: string;
  customerId: string;
  status: string;
};

export function MergeBookingsPanel({ bookings }: { bookings: MergeBookingOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sourceBookingId, setSourceBookingId] = useState("");
  const [targetBookingId, setTargetBookingId] = useState("");
  const [mergeDate, setMergeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const activeBookings = useMemo(
    () => bookings.filter((b) => !["CANCELLED", "TRANSFERRED", "SWITCHED", "MERGED"].includes(b.status)),
    [bookings],
  );

  const customerGroups = useMemo(() => {
    const map = new Map<string, MergeBookingOption[]>();
    for (const b of activeBookings) {
      const list = map.get(b.customerId) ?? [];
      list.push(b);
      map.set(b.customerId, list);
    }
    return [...map.entries()].filter(([, list]) => list.length >= 2);
  }, [activeBookings]);

  const sourceOptions = useMemo(() => {
    if (!targetBookingId) return activeBookings;
    const target = activeBookings.find((b) => b.id === targetBookingId);
    if (!target) return activeBookings;
    return activeBookings.filter((b) => b.customerId === target.customerId && b.id !== targetBookingId);
  }, [activeBookings, targetBookingId]);

  const targetOptions = useMemo(() => {
    if (!sourceBookingId) return activeBookings;
    const source = activeBookings.find((b) => b.id === sourceBookingId);
    if (!source) return activeBookings;
    return activeBookings.filter((b) => b.customerId === source.customerId && b.id !== sourceBookingId);
  }, [activeBookings, sourceBookingId]);

  const handleMerge = () => {
    if (!sourceBookingId || !targetBookingId) {
      showError("Select source and target bookings.");
      return;
    }
    startTransition(async () => {
      const result = await mergeBookingsAction({
        sourceBookingId,
        targetBookingId,
        mergeDate,
        notes: notes || null,
      });
      showActionResult(result);
      if (result.ok) {
        setOpen(false);
        setSourceBookingId("");
        setTargetBookingId("");
        setNotes("");
        router.refresh();
      }
    });
  };

  if (customerGroups.length === 0) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Merge bookings</p>
          <p className="text-xs text-slate-500">
            {customerGroups.length} customer(s) have multiple active units — merge into one booking and free the other unit.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <GitMerge className="mr-2 h-4 w-4" />
          {open ? "Close" : "Merge units"}
        </Button>
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          <SelectField
            id="merge-target"
            label="Surviving booking (keep this unit)"
            value={targetBookingId}
            onChange={(e) => setTargetBookingId(e.target.value)}
            options={[
              { value: "", label: "Select target…" },
              ...targetOptions.map((b) => ({
                value: b.id,
                label: `${b.bookingNo} — ${b.unitLabel} (${b.customerName})`,
              })),
            ]}
          />
          <SelectField
            id="merge-source"
            label="Source booking (unit will be freed)"
            value={sourceBookingId}
            onChange={(e) => setSourceBookingId(e.target.value)}
            options={[
              { value: "", label: "Select source…" },
              ...sourceOptions.map((b) => ({
                value: b.id,
                label: `${b.bookingNo} — ${b.unitLabel} (${b.customerName})`,
              })),
            ]}
          />
          <Field id="merge-date" label="Merge date" type="date" value={mergeDate} onChange={(e) => setMergeDate(e.target.value)} />
          <TextareaField id="merge-notes" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <div className="sm:col-span-2">
            <Button type="button" onClick={handleMerge} disabled={isPending}>
              {isPending ? "Merging…" : "Confirm merge"}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
