import { CustomersWorkspace } from "./customers-workspace";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Customers</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Search and edit customer profiles. Changes apply to future bookings; nominee rows are shown for reference.
        </p>
      </div>
      <CustomersWorkspace />
    </div>
  );
}
