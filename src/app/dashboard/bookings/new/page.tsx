import { db } from "@/lib/db";
import { BookingForm } from "@/components/booking/booking-form";

export default async function NewBookingPage() {
  const projects = await db.project.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });

  return <BookingForm projects={projects} />;
}
