import { Building2, CircleDollarSign, FileText, Sparkles, TrendingUp, Users } from "lucide-react";
import {
  ACTIVE_BOOKING_STATUSES,
  computeBookingFinancials,
  portfolioRecoveryPct,
  sumBookingFinancials,
} from "@/lib/booking-financials";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type StatusBucket = { key: string; label: string; count: number; tone: string; color: string };
type TrendPoint = { label: string; count: number };
type RecoveryPoint = { label: string; recoveryPct: number; collected: number };
type BookingRecoveryRow = {
  id: string;
  bookingNo: string;
  customerName: string;
  unitLabel: string;
  payable: number;
  paid: number;
  remaining: number;
  recoveryPct: number;
};
type TopCustomer = { id: string; name: string; bookings: number; amount: number };

function formatMonthLabel(year: number, monthIndex: number) {
  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

function toMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PKR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function buildTrendGeometry(points: TrendPoint[]) {
  const width = 520;
  const height = 210;
  const leftPad = 34;
  const rightPad = 14;
  const topPad = 16;
  const bottomPad = 30;

  const maxRaw = Math.max(...points.map((point) => point.count), 0);
  const max = maxRaw === 0 ? 1 : maxRaw;
  const usableWidth = width - leftPad - rightPad;
  const usableHeight = height - topPad - bottomPad;

  const coords = points.map((point, index) => {
    const x = leftPad + (usableWidth * index) / Math.max(points.length - 1, 1);
    const y = topPad + usableHeight - (point.count / max) * usableHeight;
    return { ...point, x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const lastX = coords.length > 0 ? coords[coords.length - 1].x : 0;
  const firstX = coords.length > 0 ? coords[0].x : 0;
  const areaPath = `${linePath} L ${lastX} ${height - bottomPad} L ${firstX} ${height - bottomPad} Z`;

  const yTicks = [0, 1, 2, 3].map((i) => {
    const y = topPad + (usableHeight / 3) * i;
    const value = Math.round((max * (3 - i)) / 3);
    return { y, value };
  });

  return { width, height, leftPad, rightPad, topPad, bottomPad, max, yTicks, coords, linePath, areaPath };
}

function buildMiniBars(points: TrendPoint[]) {
  const max = Math.max(...points.map((point) => point.count), 1);
  return points.map((point) => ({
    ...point,
    height: Math.max(10, Math.round((point.count / max) * 100)),
  }));
}

function buildDonutSegments(items: StatusBucket[]) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * 44;
  let offset = 0;

  const segments = items
    .filter((item) => item.count > 0)
    .map((item) => {
      const ratio = total > 0 ? item.count / total : 0;
      const length = ratio * circumference;
      const segment = { key: item.key, color: item.color, length, offset };
      offset += length;
      return segment;
    });

  return { total, segments, circumference };
}

async function getDashboardData() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 7, 1);
  const customerPeriodStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    units,
    bookings,
    customers,
    payments,
    grossTotalAgg,
    paymentTotalAgg,
    openLiabilityAgg,
    openLiabilityCount,
    unitStatusRaw,
    bookingStatusRaw,
    paymentModeRaw,
    bookingDates,
    customerDates,
    topCustomerRaw,
    recoveryBookingsRaw,
    recoveryPaymentsRaw,
  ] = await Promise.all([
    db.unit.count(),
    db.booking.count(),
    db.customer.count(),
    db.payment.count(),
    db.booking.aggregate({ _sum: { grossTotal: true } }),
    db.payment.aggregate({ _sum: { amount: true } }),
    db.companyLiability.aggregate({
      where: { status: "OPEN" },
      _sum: { amount: true },
    }),
    db.companyLiability.count({ where: { status: "OPEN" } }),
    db.unit.groupBy({ by: ["listingStatus"], _count: { _all: true } }),
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    db.payment.groupBy({ by: ["mode"], _count: { _all: true } }),
    db.booking.findMany({
      where: { bookingDate: { gte: periodStart } },
      select: { bookingDate: true },
      orderBy: { bookingDate: "asc" },
    }),
    db.customer.findMany({
      where: { createdAt: { gte: customerPeriodStart } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.booking.groupBy({ by: ["customerId"], _count: { _all: true }, _sum: { grossTotal: true } }),
    db.booking.findMany({
      where: { status: { in: [...ACTIVE_BOOKING_STATUSES] } },
      orderBy: { bookingDate: "desc" },
      include: {
        customer: { select: { fullName: true } },
        unit: { include: { tower: { select: { code: true } } } },
        payments: { where: { voidedAt: null }, select: { amount: true } },
      },
    }),
    db.payment.findMany({
      where: { voidedAt: null, paymentDate: { gte: periodStart } },
      select: { paymentDate: true, amount: true },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const unitStatusMap = new Map(unitStatusRaw.map((entry) => [entry.listingStatus, entry._count._all]));
  const bookingStatusMap = new Map(bookingStatusRaw.map((entry) => [entry.status, entry._count._all]));
  const paymentModeMap = new Map(paymentModeRaw.map((entry) => [entry.mode, entry._count._all]));

  const unitStatus: StatusBucket[] = [
    { key: "AVAILABLE", label: "Available", count: unitStatusMap.get("AVAILABLE") ?? 0, tone: "bg-emerald-500", color: "#10b981" },
    { key: "HOLD", label: "Hold", count: unitStatusMap.get("HOLD") ?? 0, tone: "bg-amber-500", color: "#f59e0b" },
    { key: "BOOKED", label: "Booked", count: unitStatusMap.get("BOOKED") ?? 0, tone: "bg-indigo-500", color: "#6366f1" },
    { key: "SOLD", label: "Sold", count: unitStatusMap.get("SOLD") ?? 0, tone: "bg-slate-500", color: "#64748b" },
    { key: "CANCELLED", label: "Cancelled", count: unitStatusMap.get("CANCELLED") ?? 0, tone: "bg-rose-500", color: "#f43f5e" },
  ];

  const bookingStatus: StatusBucket[] = [
    { key: "DRAFT", label: "Draft", count: bookingStatusMap.get("DRAFT") ?? 0, tone: "bg-slate-500", color: "#64748b" },
    { key: "CONFIRMED", label: "Confirmed", count: bookingStatusMap.get("CONFIRMED") ?? 0, tone: "bg-emerald-500", color: "#10b981" },
    { key: "COMPLETED", label: "Completed", count: bookingStatusMap.get("COMPLETED") ?? 0, tone: "bg-indigo-500", color: "#6366f1" },
    { key: "CANCELLED", label: "Cancelled", count: bookingStatusMap.get("CANCELLED") ?? 0, tone: "bg-rose-500", color: "#f43f5e" },
  ];

  const paymentModes: StatusBucket[] = [
    { key: "CASH", label: "Cash", count: paymentModeMap.get("CASH") ?? 0, tone: "bg-emerald-500", color: "#10b981" },
    { key: "BANK_TRANSFER", label: "Bank Transfer", count: paymentModeMap.get("BANK_TRANSFER") ?? 0, tone: "bg-blue-500", color: "#3b82f6" },
    { key: "CHEQUE", label: "Cheque", count: paymentModeMap.get("CHEQUE") ?? 0, tone: "bg-violet-500", color: "#8b5cf6" },
    { key: "ONLINE", label: "Online", count: paymentModeMap.get("ONLINE") ?? 0, tone: "bg-cyan-500", color: "#06b6d4" },
    { key: "OTHER", label: "Other", count: paymentModeMap.get("OTHER") ?? 0, tone: "bg-slate-500", color: "#64748b" },
  ];

  const trendMonthKeys: { key: string; label: string }[] = [];
  for (let i = 7; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendMonthKeys.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: formatMonthLabel(date.getFullYear(), date.getMonth()),
    });
  }
  const bookingTrendMap = new Map<string, number>();
  for (const row of bookingDates) {
    const date = row.bookingDate;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    bookingTrendMap.set(key, (bookingTrendMap.get(key) ?? 0) + 1);
  }
  const bookingTrend: TrendPoint[] = trendMonthKeys.map((entry) => ({
    label: entry.label,
    count: bookingTrendMap.get(entry.key) ?? 0,
  }));

  const allRecoveryRows: BookingRecoveryRow[] = recoveryBookingsRaw.map((booking) => {
    const fin = computeBookingFinancials(booking);
    return {
      id: booking.id,
      bookingNo: booking.bookingNo,
      customerName: booking.customer.fullName,
      unitLabel: `${booking.unit.tower.code} · ${booking.unit.unitNo}`,
      payable: fin.payable,
      paid: fin.paid,
      remaining: fin.remaining,
      recoveryPct: fin.recoveryPct,
    };
  });

  const portfolioTotals = sumBookingFinancials(allRecoveryRows);
  const portfolioRecovery = portfolioRecoveryPct(portfolioTotals);

  const recoveryByBooking = [...allRecoveryRows]
    .filter((row) => row.payable > 0 || row.paid > 0)
    .sort((a, b) => b.remaining - a.remaining || a.recoveryPct - b.recoveryPct)
    .slice(0, 20);

  const recoveryTrendMap = new Map<string, { collected: number }>();
  for (const payment of recoveryPaymentsRaw) {
    const key = `${payment.paymentDate.getFullYear()}-${payment.paymentDate.getMonth()}`;
    const bucket = recoveryTrendMap.get(key) ?? { collected: 0 };
    bucket.collected += Number(payment.amount);
    recoveryTrendMap.set(key, bucket);
  }
  const recoveryTrend: RecoveryPoint[] = trendMonthKeys.map((entry) => {
    const collected = recoveryTrendMap.get(entry.key)?.collected ?? 0;
    const recoveryPct =
      portfolioTotals.payable > 0
        ? Math.min(100, Math.round((collected / portfolioTotals.payable) * 100))
        : 0;
    return { label: entry.label, recoveryPct, collected };
  });

  const customerMonthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    customerMonthKeys.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: formatMonthLabel(date.getFullYear(), date.getMonth()),
    });
  }
  const customerTrendMap = new Map<string, number>();
  for (const row of customerDates) {
    const date = row.createdAt;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    customerTrendMap.set(key, (customerTrendMap.get(key) ?? 0) + 1);
  }
  const customerTrend: TrendPoint[] = customerMonthKeys.map((entry) => ({
    label: entry.label,
    count: customerTrendMap.get(entry.key) ?? 0,
  }));

  const customerIds = topCustomerRaw.map((entry) => entry.customerId);
  const customerProfiles =
    customerIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, fullName: true },
        })
      : [];
  const customerNameMap = new Map(customerProfiles.map((entry) => [entry.id, entry.fullName]));
  const topCustomers: TopCustomer[] = topCustomerRaw
    .map((entry) => ({
      id: entry.customerId,
      name: customerNameMap.get(entry.customerId) ?? "Unknown",
      bookings: entry._count._all,
      amount: Number(entry._sum.grossTotal ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    units,
    bookings,
    customers,
    payments,
    grossTotal: Number(grossTotalAgg._sum.grossTotal ?? 0),
    paymentsTotal: Number(paymentTotalAgg._sum.amount ?? 0),
    openLiabilityAmount: Number(openLiabilityAgg._sum.amount ?? 0),
    openLiabilityCount,
    unitStatus,
    bookingStatus,
    paymentModes,
    bookingTrend,
    recoveryTrend,
    recoveryByBooking,
    portfolioTotals,
    portfolioRecovery,
    customerTrend,
    topCustomers,
  };
}

const statConfig = [
  { key: "units", label: "Total units", hint: "Inventory across towers", icon: Building2, valueKey: "units" as const, accent: "from-emerald-50 to-white", iconBg: "bg-emerald-500/15 text-emerald-700" },
  { key: "bookings", label: "Bookings", hint: "All-time reservations", icon: FileText, valueKey: "bookings" as const, accent: "from-indigo-50 to-white", iconBg: "bg-indigo-500/15 text-indigo-700" },
  { key: "customers", label: "Customers", hint: "Profiles on file", icon: Users, valueKey: "customers" as const, accent: "from-amber-50 to-white", iconBg: "bg-amber-500/15 text-amber-700" },
  { key: "payments", label: "Payments", hint: "Receipts recorded", icon: CircleDollarSign, valueKey: "payments" as const, accent: "from-sky-50 to-white", iconBg: "bg-cyan-500/15 text-cyan-700" },
] as const;

export default async function DashboardHomePage() {
  const stats = await getDashboardData();
  const unitDonut = buildDonutSegments(stats.unitStatus);
  const bookingStatusMax = Math.max(...stats.bookingStatus.map((entry) => entry.count), 1);
  const paymentModeMax = Math.max(...stats.paymentModes.map((entry) => entry.count), 1);
  const newCustomerBars = buildMiniBars(stats.customerTrend);

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Live Analytics
          </span>
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">Dashboard</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Real-time portfolio performance with inventory, bookings, customer activity, and payment channels.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statConfig.map((item) => {
          const Icon = item.icon;
          const value = stats[item.valueKey];
          return (
            <Card key={item.key} className={`bg-gradient-to-br ${item.accent} p-0`}>
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-600">{item.hint}</p>
                  </div>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Contract value", value: toMoney(stats.portfolioTotals.payable), hint: "Active bookings payable" },
          { label: "Collected", value: toMoney(stats.portfolioTotals.paid), hint: "Non-voided receipts" },
          { label: "Outstanding", value: toMoney(stats.portfolioTotals.remaining), hint: "Remaining from customers" },
          { label: "Portfolio recovery", value: `${stats.portfolioRecovery}%`, hint: "Paid ÷ payable (active bookings)" },
        ].map((card) => (
          <Card key={card.label} animate={false} className="rounded-2xl border border-slate-200/90 p-4 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-600">{card.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card animate={false} className="space-y-3 p-4 xl:col-span-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recovery trend</h3>
              <p className="text-base font-bold text-slate-900">Collections vs portfolio (last 8 months)</p>
              <p className="text-xs text-slate-500">
                Recovery % = monthly collections ÷ total active booking payable. Outstanding = payable − receipts (no plan required).
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="overflow-hidden rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-3">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {stats.recoveryTrend.map((point) => (
                <div key={point.label} className="text-center">
                  <div className="mx-auto flex h-16 w-full max-w-[48px] items-end justify-center rounded-md bg-emerald-100/60">
                    <div
                      className="w-full rounded-t-md bg-emerald-500"
                      style={{ height: `${Math.max(8, point.recoveryPct)}%` }}
                      title={`${point.recoveryPct}%`}
                    />
                  </div>
                  <p className="mt-1 text-[0.65rem] font-semibold text-slate-600">{point.label}</p>
                  <p className="text-[0.65rem] text-slate-500">{toCompactMoney(point.collected)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <h4 className="text-sm font-semibold text-slate-800">Highest outstanding (top 20)</h4>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Payable</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recoveryByBooking.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        No active bookings with payable amounts yet.
                      </td>
                    </tr>
                  ) : (
                    stats.recoveryByBooking.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{row.bookingNo}</td>
                        <td className="px-3 py-2 text-slate-600">{row.customerName}</td>
                        <td className="px-3 py-2 text-slate-600">{row.unitLabel}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{toMoney(row.paid)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{toMoney(row.payable)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-700">{toMoney(row.remaining)}</td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              row.recoveryPct >= 80
                                ? "bg-emerald-100 text-emerald-800"
                                : row.recoveryPct >= 40
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {row.recoveryPct}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card animate={false} className="space-y-3 p-4 xl:col-span-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New Customers</h3>
            <p className="text-base font-bold text-slate-900">Monthly growth (6 months)</p>
          </div>
          <div className="grid h-44 grid-cols-6 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            {newCustomerBars.map((point) => (
              <div key={point.label} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600">{point.count}</span>
                <div className="relative h-24 w-full rounded-md bg-slate-200/70">
                  <div className="absolute bottom-0 left-0 w-full rounded-md bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${point.height}%` }} />
                </div>
                <span className="text-[11px] font-medium text-slate-500">{point.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card animate={false} className="space-y-4 p-4 xl:col-span-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory Mix</h3>
            <p className="text-base font-bold text-slate-900">Unit status split</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center">
            <div className="mx-auto h-40 w-40">
              <svg viewBox="0 0 120 120" className="h-full w-full">
                <circle cx="60" cy="60" r="44" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                {unitDonut.segments.map((segment) => (
                  <circle
                    key={segment.key}
                    cx="60"
                    cy="60"
                    r="44"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={`${segment.length} ${unitDonut.circumference}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
                <text x="60" y="56" textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold uppercase">Units</text>
                <text x="60" y="72" textAnchor="middle" className="fill-slate-900 text-[17px] font-bold">{unitDonut.total}</text>
              </svg>
            </div>
            <div className="space-y-3">
              {stats.unitStatus.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <span className={`h-2.5 w-2.5 rounded-full ${entry.tone}`} />
                    {entry.label}
                  </span>
                  <span className="font-semibold text-slate-900">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card animate={false} className="space-y-4 p-4 xl:col-span-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Booking Pipeline</h3>
            <p className="text-base font-bold text-slate-900">By booking status</p>
          </div>
          <div className="space-y-3">
            {stats.bookingStatus.map((entry) => (
              <div key={entry.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{entry.label}</span>
                  <span className="font-semibold text-slate-900">{entry.count}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${entry.tone}`}
                    style={{ width: bookingStatusMax > 0 ? `${Math.max(8, Math.round((entry.count / bookingStatusMax) * 100))}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card animate={false} className="space-y-4 p-4 xl:col-span-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment Modes</h3>
            <p className="text-base font-bold text-slate-900">Collection channel split</p>
          </div>
          <div className="space-y-3">
            {stats.paymentModes.map((entry) => (
              <div key={entry.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{entry.label}</span>
                  <span className="font-semibold text-slate-900">{entry.count}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${entry.tone}`}
                    style={{ width: paymentModeMax > 0 ? `${Math.max(8, Math.round((entry.count / paymentModeMax) * 100))}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card animate={false} className="space-y-4 p-4 xl:col-span-5">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Revenue Snapshot</h3>
            <p className="text-base font-bold text-slate-900">Gross vs collected</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Gross booking value</p>
              <p className="mt-2 text-xl font-bold text-emerald-900">{toCompactMoney(stats.grossTotal)}</p>
              <p className="mt-1 text-xs text-emerald-700/80">{toMoney(stats.grossTotal)}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Collected payments</p>
              <p className="mt-2 text-xl font-bold text-blue-900">{toCompactMoney(stats.paymentsTotal)}</p>
              <p className="mt-1 text-xs text-blue-700/80">{toMoney(stats.paymentsTotal)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Open transfer liabilities</p>
              <p className="mt-2 text-xl font-bold text-amber-900">{toCompactMoney(stats.openLiabilityAmount)}</p>
              <p className="mt-1 text-xs text-amber-700/80">
                {toMoney(stats.openLiabilityAmount)} ({stats.openLiabilityCount} item(s))
              </p>
            </div>
          </div>
        </Card>

        <Card animate={false} className="space-y-4 p-4 xl:col-span-7">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top Customers</h3>
            <p className="text-base font-bold text-slate-900">Ranked by booking value</p>
          </div>
          <div className="space-y-2">
            {stats.topCustomers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                No booking customers yet.
              </p>
            ) : (
              stats.topCustomers.map((customer, index) => (
                <div key={customer.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                      <p className="text-xs text-slate-500">{customer.bookings} booking(s)</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{toCompactMoney(customer.amount)}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
