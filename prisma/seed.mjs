import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  createPrismaClient,
  normalizeDatabaseUrl,
  printDbTroubleshooting,
  withDbRetry,
} from "../scripts/lib/pg-connection.mjs";

const prisma = createPrismaClient(normalizeDatabaseUrl(process.env.DATABASE_URL));

async function seedRolesAndPermissions() {
  const roleCodes = [
    ["SUPER_ADMIN", "Super Admin"],
    ["SALES_MANAGER", "Sales Manager"],
    ["SALES_EXECUTIVE", "Sales Executive"],
    ["ACCOUNTS", "Accounts"],
    ["VIEWER", "Viewer"],
  ];

  for (const [code, name] of roleCodes) {
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }

  const permissions = [
    ["dashboard.view", "View dashboard", "dashboard"],
    ["units.view", "View units", "units"],
    ["units.manage", "Manage units", "units"],
    ["bookings.view", "View bookings", "bookings"],
    ["bookings.create", "Create bookings", "bookings"],
    ["bookings.manage", "Manage bookings", "bookings"],
    ["payments.view", "View payments", "payments"],
    ["payments.manage", "Manage payments", "payments"],
    ["users.manage", "Manage users", "admin"],
    ["settings.manage", "Manage settings", "admin"],
  ];

  for (const [code, name, module] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { name, module },
      create: { code, name, module },
    });
  }
}

async function seedMenu() {
  const menuItems = [
    { itemKey: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard", sortOrder: 10 },
    { itemKey: "units", label: "Units", route: "/dashboard/units", icon: "Building2", sortOrder: 20 },
    { itemKey: "bookings", label: "Bookings", route: "/dashboard/bookings", icon: "FileText", sortOrder: 30 },
    { itemKey: "new-booking", label: "New Booking", route: "/dashboard/bookings/new", icon: "NotebookPen", sortOrder: 40 },
    { itemKey: "payments", label: "Payments", route: "/dashboard/payments", icon: "Wallet", sortOrder: 50 },
    { itemKey: "receiving", label: "Receiving", route: "/dashboard/receiving", icon: "HandCoins", sortOrder: 55 },
    { itemKey: "ledger", label: "Ledger", route: "/dashboard/ledger", icon: "BookOpen", sortOrder: 56 },
    { itemKey: "customers", label: "Customers", route: "/dashboard/customers", icon: "Users", sortOrder: 60 },
    { itemKey: "settings", label: "Settings", route: "/dashboard/settings", icon: "Settings", sortOrder: 70 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { itemKey: item.itemKey },
      update: item,
      create: item,
    });
  }
}

async function seedAdmin() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@builder.local" },
    update: { fullName: "System Admin", passwordHash, status: "ACTIVE" },
    create: {
      fullName: "System Admin",
      email: "admin@builder.local",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: "SUPER_ADMIN" },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: superAdminRole.id,
    },
  });
}

async function seedLookups() {
  const categories = [
    ["GOLD", "Gold"],
    ["PLATINUM", "Platinum"],
    ["SILVER", "Silver"],
  ];
  for (const [code, name] of categories) {
    await prisma.unitCategory.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }

  const facings = [
    ["WEST_OPEN", "West Open"],
    ["PARK", "Park Facing"],
    ["EAST_OPEN", "East Open"],
    ["NAVY_MERCHANT", "Navy Merchant"],
    ["HIGHWAY", "Highway Facing"],
  ];

  for (const [code, name] of facings) {
    await prisma.facingType.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }
}

async function seedProjectsAndTowers() {
  const project = await prisma.project.upsert({
    where: { code: "FM01" },
    update: {
      name: "FM Towers",
      city: "Karachi",
      address: "FM Towers, Karachi",
      status: true,
    },
    create: {
      code: "FM01",
      name: "FM Towers",
      city: "Karachi",
      address: "FM Towers, Karachi",
      status: true,
    },
  });

  const towers = [
    ["A", "Tower A"],
    ["B", "Tower B"],
    ["C", "Tower C"],
    ["D", "Tower D"],
    ["E", "Tower E"],
    ["F", "Tower F"],
    ["G", "Tower G"],
    ["H", "Tower H"],
    ["Z", "Tower Z"],
  ];

  for (const [code, name] of towers) {
    await prisma.tower.upsert({
      where: {
        projectId_code: {
          projectId: project.id,
          code,
        },
      },
      update: {
        name,
        isActive: true,
      },
      create: {
        projectId: project.id,
        code,
        name,
        isActive: true,
      },
    });
  }
}

/** Idempotent demo data for dashboards, reports, and bookings UI. */
async function seedDemoUnitsAndBookings() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@builder.local" } });
  if (!admin) {
    console.warn("Skipping demo inventory: admin user not found.");
    return;
  }

  const project = await prisma.project.findUnique({ where: { code: "FM01" } });
  if (!project) {
    console.warn("Skipping demo inventory: project FM01 not found.");
    return;
  }

  const towerA = await prisma.tower.findFirst({ where: { projectId: project.id, code: "A" } });
  const towerB = await prisma.tower.findFirst({ where: { projectId: project.id, code: "B" } });
  const towerC = await prisma.tower.findFirst({ where: { projectId: project.id, code: "C" } });
  if (!towerA || !towerB || !towerC) {
    console.warn("Skipping demo inventory: towers missing.");
    return;
  }

  const categoryGold = await prisma.unitCategory.findUnique({ where: { code: "GOLD" } });
  const facingWest = await prisma.facingType.findUnique({ where: { code: "WEST_OPEN" } });

  const DEMO_NOTE = "[demo-seed]";

  await prisma.booking.deleteMany({
    where: { bookingNo: { startsWith: "DEMO-" } },
  });

  await prisma.unit.deleteMany({
    where: { notes: { contains: DEMO_NOTE } },
  });

  const customersData = [
    {
      fullName: "Ahmed Raza Khan",
      fatherHusband: "Tariq Khan",
      phone: "+923001112233",
      phoneRes: "+923001112233",
      whatsapp: "+923001112233",
      email: "ahmed.khan.demo@example.com",
      cnic: "42101-1234567-1",
      nationality: "PAKISTANI",
      postalAddress: "DHA Phase 8, Karachi",
      income: "850000",
      age: 38,
      occupation: "Business",
      broker: "City Associates",
      nominee: { name: "Fatima Khan", relation: "Wife", cnic: "42101-9876543-2", cell: "+923007776655" },
    },
    {
      fullName: "Sara Malik",
      fatherHusband: "Malik Aslam",
      phone: "+923214445566",
      email: "sara.malik.demo@example.com",
      cnic: "35202-7654321-3",
      nationality: "PAKISTANI",
      postalAddress: "Clifton Block 2, Karachi",
      income: "1200000",
      age: 32,
      occupation: "Consultant",
      broker: "FM Internal",
      nominee: { name: "Hassan Malik", relation: "Brother", cnic: "35202-1112233-4", cell: "+923218889900" },
    },
    {
      fullName: "Omar Farooq Siddiqui",
      fatherHusband: "Farooq Siddiqui",
      phone: "+923338889900",
      phoneOffice: "+922134567890",
      email: "omar.siddiqui.demo@example.com",
      cnic: "41303-5566777-5",
      nationality: "PAKISTANI",
      postalAddress: "Gulistan-e-Jauhar, Karachi",
      income: "650000",
      age: 45,
      occupation: "Engineer",
      broker: "Premier Realtors",
      nominee: { name: "Ayesha Siddiqui", relation: "Spouse", cnic: "41303-9988776-6", cell: "+923336667788" },
    },
  ];

  const customerIds = [];
  for (const c of customersData) {
    const { nominee, ...rest } = c;
    const existing = await prisma.customer.findFirst({ where: { cnic: rest.cnic } });
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            fullName: rest.fullName,
            fatherHusband: rest.fatherHusband,
            phone: rest.phone,
            phoneRes: rest.phoneRes ?? null,
            phoneOffice: rest.phoneOffice ?? null,
            whatsapp: rest.whatsapp ?? null,
            email: rest.email,
            nationality: rest.nationality,
            postalAddress: rest.postalAddress,
            income: rest.income,
            age: rest.age,
            occupation: rest.occupation,
            broker: rest.broker,
          },
        })
      : await prisma.customer.create({
          data: {
            fullName: rest.fullName,
            fatherHusband: rest.fatherHusband,
            phone: rest.phone,
            phoneRes: rest.phoneRes ?? null,
            phoneOffice: rest.phoneOffice ?? null,
            whatsapp: rest.whatsapp ?? null,
            email: rest.email,
            cnic: rest.cnic,
            nationality: rest.nationality,
            postalAddress: rest.postalAddress,
            income: rest.income,
            age: rest.age,
            occupation: rest.occupation,
            broker: rest.broker,
          },
        });
    customerIds.push(customer.id);

    await prisma.nominee.deleteMany({ where: { customerId: customer.id } });
    await prisma.nominee.create({
      data: {
        customerId: customer.id,
        name: nominee.name,
        relation: nominee.relation,
        fatherName: rest.fatherHusband,
        address: rest.postalAddress,
        cnic: nominee.cnic,
        cell: nominee.cell,
      },
    });
  }

  const [c1, c2, c3] = customerIds;

  /** @type {{ unitNo: string; towerId: string; floorNo: number; areaSqft: string; rooms: number; kind: string; status: string; basePrice: string; transfer: string; label: string }[]} */
  const unitDefs = [
    { unitNo: "DS-101", towerId: towerA.id, floorNo: 10, areaSqft: "1850.00", rooms: 3, kind: "RESIDENTIAL", status: "AVAILABLE", basePrice: "18500000", transfer: "350000", label: "Corner 3-bed" },
    { unitNo: "DS-102", towerId: towerA.id, floorNo: 10, areaSqft: "1650.00", rooms: 3, kind: "RESIDENTIAL", status: "AVAILABLE", basePrice: "16200000", transfer: "320000", label: "Standard 3-bed" },
    { unitNo: "DS-103", towerId: towerA.id, floorNo: 11, areaSqft: "2100.00", rooms: 4, kind: "PENTHOUSE", status: "AVAILABLE", basePrice: "28500000", transfer: "500000", label: "Penthouse" },
    { unitNo: "DS-104", towerId: towerA.id, floorNo: 8, areaSqft: "1200.00", rooms: 2, kind: "RESIDENTIAL", status: "HOLD", basePrice: "11800000", transfer: "280000", label: "Hold — legal" },
    { unitNo: "DS-201", towerId: towerB.id, floorNo: 5, areaSqft: "950.00", rooms: 0, kind: "COMMERCIAL", status: "AVAILABLE", basePrice: "22500000", transfer: "450000", label: "Ground shop" },
    { unitNo: "DS-202", towerId: towerB.id, floorNo: 6, areaSqft: "880.00", rooms: 0, kind: "COMMERCIAL", status: "AVAILABLE", basePrice: "19800000", transfer: "400000", label: "Shop mezzanine" },
    { unitNo: "DS-301", towerId: towerB.id, floorNo: 12, areaSqft: "1750.00", rooms: 3, kind: "RESIDENTIAL", status: "BOOKED", basePrice: "17200000", transfer: "330000", label: "Booked — Ahmed" },
    { unitNo: "DS-302", towerId: towerB.id, floorNo: 12, areaSqft: "1600.00", rooms: 3, kind: "RESIDENTIAL", status: "BOOKED", basePrice: "15800000", transfer: "310000", label: "Booked — Sara" },
    { unitNo: "DS-303", towerId: towerC.id, floorNo: 4, areaSqft: "1550.00", rooms: 3, kind: "RESIDENTIAL", status: "BOOKED", basePrice: "15100000", transfer: "300000", label: "Booked — Omar" },
    { unitNo: "DS-401", towerId: towerC.id, floorNo: 15, areaSqft: "1920.00", rooms: 3, kind: "RESIDENTIAL", status: "SOLD", basePrice: "18900000", transfer: "360000", label: "Sold — settled" },
    { unitNo: "DS-402", towerId: towerC.id, floorNo: 15, areaSqft: "1780.00", rooms: 3, kind: "RESIDENTIAL", status: "SOLD", basePrice: "17500000", transfer: "340000", label: "Sold — settled" },
    { unitNo: "DS-501", towerId: towerC.id, floorNo: 7, areaSqft: "1400.00", rooms: 2, kind: "RESIDENTIAL", status: "AVAILABLE", basePrice: "13200000", transfer: "260000", label: "2-bed park view" },
  ];

  const unitRows = [];
  for (const u of unitDefs) {
    const row = await prisma.unit.create({
      data: {
        projectId: project.id,
        towerId: u.towerId,
        categoryId: categoryGold?.id ?? undefined,
        facingTypeId: facingWest?.id ?? undefined,
        prefix: null,
        unitNo: u.unitNo,
        floorNo: u.floorNo,
        areaSqft: u.areaSqft,
        rooms: u.rooms,
        unitKind: u.kind,
        listingStatus: u.status,
        basePrice: u.basePrice,
        transferCharges: u.transfer,
        notes: `${DEMO_NOTE} ${u.label}`,
        serialNo: unitRows.length + 1,
      },
    });
    unitRows.push({ ...row, def: u });
  }

  const uBooked1 = unitRows.find((r) => r.unitNo === "DS-301");
  const uBooked2 = unitRows.find((r) => r.unitNo === "DS-302");
  const uBooked3 = unitRows.find((r) => r.unitNo === "DS-303");
  const uSold1 = unitRows.find((r) => r.unitNo === "DS-401");
  const uSold2 = unitRows.find((r) => r.unitNo === "DS-402");

  const base = new Date();
  base.setMonth(base.getMonth() - 4);
  base.setHours(12, 0, 0, 0);

  function addMonths(d, n) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  }

  /**
   * @param {object} opts
   * @param {string} opts.bookingNo
   * @param {string} opts.unitId
   * @param {string} opts.customerId
   * @param {Date} opts.bookingDate
   * @param {"DRAFT"|"CONFIRMED"|"COMPLETED"} opts.status
   * @param {string} opts.unitPrice
   * @param {string} opts.cashPayable
   * @param {string} opts.discount
   * @param {string} opts.grossTotal
   * @param {string} opts.payableCost
   * @param {object|null} opts.plan - { name, months, installment, paidCount }
   */
  async function createBookingWithPlan(opts) {
    const booking = await prisma.booking.create({
      data: {
        bookingNo: opts.bookingNo,
        projectId: project.id,
        unitId: opts.unitId,
        customerId: opts.customerId,
        bookedByUserId: admin.id,
        bookingDate: opts.bookingDate,
        status: opts.status,
        mode: "REGULAR",
        unitPrice: opts.unitPrice,
        cashPayable: opts.cashPayable,
        discountAmount: opts.discount,
        grossTotal: opts.grossTotal,
        payableCost: opts.payableCost,
        notes: `${DEMO_NOTE} Presentation booking`,
      },
    });

    if (!opts.plan) return booking;

    const { name, months, installment, paidCount } = opts.plan;
    const totalAmount = String(Number(installment) * months);
    const plan = await prisma.paymentPlan.create({
      data: {
        bookingId: booking.id,
        planName: name,
        totalInstallments: months,
        startDate: opts.bookingDate,
        totalAmount,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedules = [];
    for (let i = 1; i <= months; i += 1) {
      const dueDate = addMonths(opts.bookingDate, i);
      let status = i <= paidCount ? "PAID" : i === paidCount + 1 ? "PARTIAL" : "PENDING";
      if (status === "PENDING") {
        const dueDay = new Date(dueDate);
        dueDay.setHours(0, 0, 0, 0);
        if (dueDay < today) {
          status = "OVERDUE";
        }
      }
      const inst = await prisma.paymentInstallment.create({
        data: {
          paymentPlanId: plan.id,
          installmentNo: i,
          dueDate,
          dueAmount: installment,
          status: status === "PARTIAL" ? "PARTIAL" : status === "PAID" ? "PAID" : status === "OVERDUE" ? "OVERDUE" : "PENDING",
        },
      });
      schedules.push(inst);
    }

    for (let i = 0; i < paidCount; i += 1) {
      const inst = schedules[i];
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          installmentId: inst.id,
          paymentDate: addMonths(opts.bookingDate, i + 1),
          amount: installment,
          mode: "BANK_TRANSFER",
          referenceNo: `DEMO-TXN-${opts.bookingNo}-${i + 1}`,
          receivedBy: "Accounts Demo",
          notes: DEMO_NOTE,
        },
      });
    }

    if (paidCount < months && schedules[paidCount].status === "PARTIAL") {
      const half = String(Number(installment) / 2);
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          installmentId: schedules[paidCount].id,
          paymentDate: addMonths(opts.bookingDate, paidCount + 1),
          amount: half,
          mode: "CASH",
          referenceNo: `DEMO-PARTIAL-${opts.bookingNo}`,
          receivedBy: "Accounts Demo",
          notes: `${DEMO_NOTE} partial`,
        },
      });
    }

    return booking;
  }

  const up = (n) => String(n);

  if (uBooked1) {
    await createBookingWithPlan({
      bookingNo: "DEMO-BKG-001",
      unitId: uBooked1.id,
      customerId: c1,
      bookingDate: base,
      status: "CONFIRMED",
      unitPrice: up(17200000),
      cashPayable: up(2000000),
      discount: up(200000),
      grossTotal: up(17300000),
      payableCost: up(19300000),
      plan: { name: "12-Month Standard Plan", months: 12, installment: up(1441667), paidCount: 4 },
    });
  }

  if (uBooked2) {
    await createBookingWithPlan({
      bookingNo: "DEMO-BKG-002",
      unitId: uBooked2.id,
      customerId: c2,
      bookingDate: addMonths(base, 1),
      status: "CONFIRMED",
      unitPrice: up(15800000),
      cashPayable: up(1800000),
      discount: up(150000),
      grossTotal: up(15950000),
      payableCost: up(17750000),
      plan: { name: "8-Quarter Plan", months: 8, installment: up(2000000), paidCount: 2 },
    });
  }

  if (uBooked3) {
    await createBookingWithPlan({
      bookingNo: "DEMO-BKG-003",
      unitId: uBooked3.id,
      customerId: c3,
      bookingDate: addMonths(base, 2),
      status: "CONFIRMED",
      unitPrice: up(15100000),
      cashPayable: up(1500000),
      discount: up(100000),
      grossTotal: up(15200000),
      payableCost: up(16700000),
      plan: { name: "10-Month Flex", months: 10, installment: up(1520000), paidCount: 3 },
    });
  }

  if (uSold1) {
    await createBookingWithPlan({
      bookingNo: "DEMO-BKG-004",
      unitId: uSold1.id,
      customerId: c1,
      bookingDate: addMonths(base, -2),
      status: "COMPLETED",
      unitPrice: up(18900000),
      cashPayable: up(2500000),
      discount: up(400000),
      grossTotal: up(18860000),
      payableCost: up(21360000),
      plan: { name: "Lump-sum 4 installments", months: 4, installment: up(4715000), paidCount: 4 },
    });
  }

  if (uSold2) {
    await createBookingWithPlan({
      bookingNo: "DEMO-BKG-005",
      unitId: uSold2.id,
      customerId: c2,
      bookingDate: addMonths(base, -1),
      status: "COMPLETED",
      unitPrice: up(17500000),
      cashPayable: up(2200000),
      discount: up(250000),
      grossTotal: up(17675000),
      payableCost: up(19875000),
      plan: { name: "6-Month Completion", months: 6, installment: up(3312500), paidCount: 6 },
    });
  }

  console.log(
    `Demo seed: ${unitDefs.length} units, ${customersData.length} customers, bookings DEMO-BKG-001…005 (with payment plans, receipts, and overdue flags where due dates have passed).`,
  );
}

async function main() {
  await withDbRetry(() => seedRolesAndPermissions(), { label: "seed" });
  await seedMenu();
  await seedLookups();
  await seedProjectsAndTowers();
  await seedAdmin();
  await seedDemoUnitsAndBookings();
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    printDbTroubleshooting(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
