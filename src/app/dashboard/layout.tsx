import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUserWithRoles } from "@/lib/current-user";
import { getRoleDrivenMenu } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserWithRoles();
  if (!user) redirect("/login");

  const roleCodes = user.roles.map((entry) => entry.role.code);
  const menu = await getRoleDrivenMenu(roleCodes);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar menu={menu} userName={user.fullName} roleLabel={roleCodes.join(", ") || "No role"} />
      <main className="flex-1 p-4 md:p-6 lg:p-7">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
