export type DemoBookingOption = {
  id: string;
  bookingNo: string;
  customer: string;
  unit: string;
};

export const DEMO_BOOKING_OPTIONS: DemoBookingOption[] = [
  { id: "uuid-demo-1001", bookingNo: "BK-2026-0142", customer: "Ayesha Malik", unit: "Tower B · 1204" },
  { id: "uuid-demo-1002", bookingNo: "BK-2026-0188", customer: "Hassan Raza", unit: "Tower A · 0901" },
  { id: "uuid-demo-1003", bookingNo: "BK-2026-0210", customer: "Sana Farooq", unit: "Tower C · 0508" },
  { id: "uuid-demo-1004", bookingNo: "BK-2026-0234", customer: "Omar Siddiqui", unit: "Tower B · 0703" },
];

export function demoBookingLabel(id: string) {
  const row = DEMO_BOOKING_OPTIONS.find((entry) => entry.id === id);
  if (!row) return id;
  return `${row.bookingNo} — ${row.customer} — ${row.unit}`;
}
