import { Loader2 } from "lucide-react";

/**
 * Shared loading UI for all /dashboard/* routes.
 * Must not mimic the dashboard home page — that caused a misleading flash
 * when navigating to Bookings, Units, Reports, etc.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-16">
      <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden />
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-800">Loading</p>
        <p className="mt-1 text-xs text-slate-500">Please wait…</p>
      </div>
    </div>
  );
}
