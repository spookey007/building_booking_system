import { db } from "@/lib/db";

export type SidebarMenuItem = {
  key: string;
  label: string;
  route: string;
  icon: string;
};

const fallbackRoleMenu: Record<string, SidebarMenuItem[]> = {
  SUPER_ADMIN: [
    { key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard" },
    { key: "units", label: "Units", route: "/dashboard/units", icon: "Building2" },
    { key: "bookings", label: "Bookings", route: "/dashboard/bookings", icon: "FileText" },
    {
      key: "paymentSchedule",
      label: "Payment schedule",
      route: "/dashboard/payment-schedule",
      icon: "CalendarClock",
    },
    { key: "receiving", label: "Receiving", route: "/dashboard/receiving", icon: "HandCoins" },
    { key: "ledger", label: "Ledger", route: "/dashboard/ledger", icon: "BookOpen" },
    { key: "reports", label: "Reports", route: "/dashboard/reports", icon: "BarChart3" },
    { key: "payments", label: "Payments", route: "/dashboard/payments", icon: "Wallet" },
    { key: "customers", label: "Customers", route: "/dashboard/customers", icon: "Users" },
    { key: "settings", label: "Settings", route: "/dashboard/settings", icon: "Settings" },
  ],
  SALES_MANAGER: [
    { key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard" },
    { key: "units", label: "Units", route: "/dashboard/units", icon: "Building2" },
    { key: "bookings", label: "Bookings", route: "/dashboard/bookings", icon: "FileText" },
    {
      key: "paymentSchedule",
      label: "Payment schedule",
      route: "/dashboard/payment-schedule",
      icon: "CalendarClock",
    },
    { key: "reports", label: "Reports", route: "/dashboard/reports", icon: "BarChart3" },
    { key: "receiving", label: "Receiving", route: "/dashboard/receiving", icon: "HandCoins" },
    { key: "ledger", label: "Ledger", route: "/dashboard/ledger", icon: "BookOpen" },
    { key: "customers", label: "Customers", route: "/dashboard/customers", icon: "Users" },
  ],
  SALES_EXECUTIVE: [
    { key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard" },
    { key: "units", label: "Units", route: "/dashboard/units", icon: "Building2" },
    { key: "bookings", label: "Bookings", route: "/dashboard/bookings", icon: "FileText" },
    {
      key: "paymentSchedule",
      label: "Payment schedule",
      route: "/dashboard/payment-schedule",
      icon: "CalendarClock",
    },
  ],
  ACCOUNTS: [
    { key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard" },
    { key: "bookings", label: "Bookings", route: "/dashboard/bookings", icon: "FileText" },
    {
      key: "paymentSchedule",
      label: "Payment schedule",
      route: "/dashboard/payment-schedule",
      icon: "CalendarClock",
    },
    { key: "reports", label: "Reports", route: "/dashboard/reports", icon: "BarChart3" },
    { key: "receiving", label: "Receiving", route: "/dashboard/receiving", icon: "HandCoins" },
    { key: "ledger", label: "Ledger", route: "/dashboard/ledger", icon: "BookOpen" },
    { key: "payments", label: "Payments", route: "/dashboard/payments", icon: "Wallet" },
    { key: "customers", label: "Customers", route: "/dashboard/customers", icon: "Users" },
  ],
  VIEWER: [{ key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard" }],
};

export async function getRoleDrivenMenu(roleCodes: string[]) {
  const directRows = await db.roleMenuItem.findMany({
    where: {
      role: { code: { in: roleCodes } },
      canView: true,
      menuItem: { isActive: true },
    },
    include: {
      menuItem: true,
    },
    orderBy: {
      menuItem: {
        sortOrder: "asc",
      },
    },
  });

  if (directRows.length > 0) {
    return directRows
      .filter((entry) => !!entry.menuItem.route)
      .map((entry) => ({
        key: entry.menuItem.itemKey,
        label: entry.menuItem.label,
        route: entry.menuItem.route ?? "/dashboard",
        icon: entry.menuItem.icon ?? "LayoutDashboard",
      }));
  }

  const list = roleCodes.flatMap((code) => fallbackRoleMenu[code] ?? []);
  const unique = new Map<string, SidebarMenuItem>();
  for (const item of list) {
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  return [...unique.values()];
}
