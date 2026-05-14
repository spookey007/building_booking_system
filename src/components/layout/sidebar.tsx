"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  CalendarClock,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth-actions";
import type { SidebarMenuItem } from "@/lib/menu";

const iconMap = {
  LayoutDashboard,
  Building2,
  FileText,
  BarChart3,
  NotebookPen,
  Wallet,
  Users,
  Settings,
  CalendarClock,
};

export function Sidebar({
  menu,
  userName,
  roleLabel,
}: {
  menu: SidebarMenuItem[];
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  const submenuMap: Record<string, { key: string; label: string; route: string }[]> = {
    reports: [
      { key: "reports-hub", label: "All reports", route: "/dashboard/reports" },
      { key: "stock-report", label: "Stock report", route: "/dashboard/reports/stock-report" },
      { key: "sales-bookings", label: "Sales & installments", route: "/dashboard/reports/sales-bookings" },
      {
        key: "payment-schedule-demo",
        label: "Payment schedule (demo)",
        route: "/dashboard/reports/payment-schedule",
      },
    ],
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="fixed left-3 top-3 z-40 h-10 w-10 rounded-xl p-0 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--sidebar-border)] bg-gradient-to-b from-[var(--sidebar-surface)] to-white p-4 shadow-xl backdrop-blur-xl transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:min-h-screen md:translate-x-0",
          collapsed ? "md:w-20" : "md:w-72",
        )}
      >
        <div className="mb-7 px-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo.png"
                alt="FM Towers"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-lg object-contain"
                priority
              />
              <div className={cn("min-w-0", collapsed && "hidden md:block md:w-0 md:overflow-hidden")}>
                <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
                  FM Towers
                </p>
                <h1 className="truncate text-base font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-900">
                  Booking Suite
                </h1>
              </div>
            </div>

            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:inline-flex dark:text-slate-500 dark:hover:bg-slate-100 dark:hover:text-slate-900"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <nav className="space-y-1 px-0.5">
          {menu.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] ?? LayoutDashboard;
            const submenus = submenuMap[item.key] ?? [];
            const hasSubmenu = submenus.length > 0;
            const active =
              item.route === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.route || pathname.startsWith(`${item.route}/`);
            const isOpen =
              openSubmenus[item.key] ??
              (pathname === item.route || pathname.startsWith(`${item.route}/`));
            return (
              <motion.div
                key={item.key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-1"
              >
                {hasSubmenu ? (
                  <div
                    className={cn(
                      "group flex w-full items-center rounded-xl text-sm font-semibold transition-all duration-200",
                      active
                        ? "brand-gradient text-white shadow-sm nav-active-glow"
                        : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-600 dark:hover:bg-slate-100 dark:hover:text-slate-900",
                    )}
                  >
                    <Link
                      href={item.route}
                      title={collapsed ? item.label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center rounded-l-xl px-3 py-2.5",
                        collapsed ? "md:justify-center md:rounded-r-xl md:px-2.5" : "gap-3",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200",
                          active ? "text-current" : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-700",
                        )}
                      />
                      <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
                    </Link>
                    {!collapsed ? (
                      <button
                        type="button"
                        aria-label={`Toggle ${item.label} submenu`}
                        onClick={() => setOpenSubmenus((prev) => ({ ...prev, [item.key]: !isOpen }))}
                        className={cn(
                          "rounded-r-xl px-2 py-2.5 transition",
                          active ? "hover:bg-white/15" : "hover:bg-slate-200/70",
                        )}
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <Link
                    href={item.route}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                      collapsed ? "md:justify-center md:px-2.5" : "gap-3",
                      active
                        ? "brand-gradient text-white shadow-sm nav-active-glow"
                        : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-600 dark:hover:bg-slate-100 dark:hover:text-slate-900",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200",
                        active ? "text-current" : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-700",
                      )}
                    />
                    <span className={cn(collapsed && "md:hidden")}>{item.label}</span>
                  </Link>
                )}

                <AnimatePresence initial={false}>
                  {hasSubmenu && !collapsed && isOpen ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="ml-9 space-y-1 overflow-hidden"
                    >
                      {submenus.map((sub) => {
                        const subActive = pathname === sub.route || pathname.startsWith(`${sub.route}/`);
                        return (
                          <Link
                            key={sub.key}
                            href={sub.route}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "block rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                              subActive
                                ? "bg-brand-50 text-brand-700"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                            )}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-8 rounded-2xl border border-[var(--border)] bg-slate-50/70 p-4 dark:bg-slate-50/80",
            collapsed && "md:px-2.5 md:py-3",
          )}
        >
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-900">{userName}</p>
          <p className={cn("mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-500", collapsed && "md:hidden")}>
            {roleLabel}
          </p>
        </div>

        <form action={logoutAction} className="mt-4 px-0.5">
          <Button type="submit" variant="secondary" className={cn("w-full", collapsed && "md:px-0")} title="Sign out">
            <LogOut className="h-4 w-4" />
            <span className={cn("ml-2", collapsed && "md:hidden")}>Sign out</span>
          </Button>
        </form>
      </aside>
    </>
  );
}
