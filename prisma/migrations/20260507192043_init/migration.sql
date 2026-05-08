-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PENTHOUSE');

-- CreateEnum
CREATE TYPE "UnitListingStatus" AS ENUM ('AVAILABLE', 'HOLD', 'BOOKED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('REGULAR', 'TRANSFER', 'CANCEL', 'SWITCHING', 'GIFT');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('CUSTOMER', 'BOOKING', 'UNIT', 'PAYMENT', 'USER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32),
    "passwordHash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "route" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleMenuItem" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoleMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "city" VARCHAR(120),
    "address" VARCHAR(500),
    "status" VARCHAR(64),
    "launchDate" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tower" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "totalFloors" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitCategory" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,

    CONSTRAINT "UnitCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacingType" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "FacingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "facingTypeId" TEXT,
    "unitNo" VARCHAR(32) NOT NULL,
    "serialNo" INTEGER,
    "floorNo" INTEGER,
    "areaSqft" DECIMAL(12,2) NOT NULL,
    "rooms" INTEGER,
    "unitKind" "UnitKind" NOT NULL,
    "listingStatus" "UnitListingStatus" NOT NULL DEFAULT 'AVAILABLE',
    "basePrice" DECIMAL(14,2),
    "expectedLoan" DECIMAL(14,2),
    "transferCharges" DECIMAL(14,2),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "fatherHusband" VARCHAR(200),
    "phone" VARCHAR(32),
    "phoneOffice" VARCHAR(32),
    "phoneRes" VARCHAR(32),
    "whatsapp" VARCHAR(32),
    "email" VARCHAR(320),
    "cnic" VARCHAR(20),
    "passportNo" VARCHAR(24),
    "nationality" VARCHAR(64),
    "postalAddress" VARCHAR(500),
    "income" DECIMAL(14,2),
    "age" INTEGER,
    "occupation" VARCHAR(120),
    "broker" VARCHAR(200),
    "careOf" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nominee" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "relation" VARCHAR(64),
    "fatherName" VARCHAR(200),
    "address" VARCHAR(500),
    "cnic" VARCHAR(20),
    "cell" VARCHAR(32),
    "passportNo" VARCHAR(24),

    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingNo" VARCHAR(64) NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookedByUserId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "BookingMode" NOT NULL DEFAULT 'REGULAR',
    "switchingDate" TIMESTAMP(3),
    "switchToUnitId" TEXT,
    "cancelDate" TIMESTAMP(3),
    "currentDateAtBooking" TIMESTAMP(3),
    "categoryAtBooking" VARCHAR(64),
    "unitPrice" DECIMAL(14,2),
    "cashPayable" DECIMAL(14,2),
    "discountAmount" DECIMAL(14,2),
    "grossTotal" DECIMAL(14,2),
    "payableCost" DECIMAL(14,2),
    "notes" VARCHAR(4000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "planName" VARCHAR(200) NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstallment" (
    "id" TEXT NOT NULL,
    "paymentPlanId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dueAmount" DECIMAL(14,2) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PaymentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "installmentId" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "referenceNo" VARCHAR(120),
    "receivedBy" VARCHAR(200),
    "notes" VARCHAR(1000),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerId" VARCHAR(64) NOT NULL,
    "docType" VARCHAR(120) NOT NULL,
    "fileUrl" VARCHAR(2000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_itemKey_key" ON "MenuItem"("itemKey");

-- CreateIndex
CREATE INDEX "MenuItem_parentId_sortOrder_idx" ON "MenuItem"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_isActive_sortOrder_idx" ON "MenuItem"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "RoleMenuItem_menuItemId_idx" ON "RoleMenuItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleMenuItem_roleId_menuItemId_key" ON "RoleMenuItem"("roleId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Tower_projectId_isActive_idx" ON "Tower"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Tower_projectId_code_key" ON "Tower"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitCategory_code_key" ON "UnitCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FacingType_code_key" ON "FacingType"("code");

-- CreateIndex
CREATE INDEX "idx_unit_kind_status" ON "Unit"("unitKind", "listingStatus");

-- CreateIndex
CREATE INDEX "idx_unit_tower_floor" ON "Unit"("towerId", "floorNo");

-- CreateIndex
CREATE INDEX "idx_unit_category_facing" ON "Unit"("categoryId", "facingTypeId");

-- CreateIndex
CREATE INDEX "idx_unit_project_serial" ON "Unit"("projectId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "ux_unit_project_tower_no" ON "Unit"("projectId", "towerId", "unitNo");

-- CreateIndex
CREATE INDEX "idx_customer_name" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "idx_customer_phone" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "idx_customer_cnic" ON "Customer"("cnic");

-- CreateIndex
CREATE INDEX "Nominee_customerId_idx" ON "Nominee"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNo_key" ON "Booking"("bookingNo");

-- CreateIndex
CREATE INDEX "idx_booking_status_date" ON "Booking"("status", "bookingDate");

-- CreateIndex
CREATE INDEX "idx_booking_mode_date" ON "Booking"("mode", "bookingDate");

-- CreateIndex
CREATE INDEX "idx_booking_unit_status" ON "Booking"("unitId", "status");

-- CreateIndex
CREATE INDEX "idx_booking_customer_date" ON "Booking"("customerId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_bookingId_key" ON "PaymentPlan"("bookingId");

-- CreateIndex
CREATE INDEX "idx_installment_status_due" ON "PaymentInstallment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstallment_paymentPlanId_installmentNo_key" ON "PaymentInstallment"("paymentPlanId", "installmentNo");

-- CreateIndex
CREATE INDEX "idx_payment_booking_date" ON "Payment"("bookingId", "paymentDate");

-- CreateIndex
CREATE INDEX "idx_payment_mode_date" ON "Payment"("mode", "paymentDate");

-- CreateIndex
CREATE INDEX "idx_document_owner" ON "Document"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "idx_audit_entity_date" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_audit_actor_date" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleMenuItem" ADD CONSTRAINT "RoleMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleMenuItem" ADD CONSTRAINT "RoleMenuItem_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tower" ADD CONSTRAINT "Tower_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UnitCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_facingTypeId_fkey" FOREIGN KEY ("facingTypeId") REFERENCES "FacingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nominee" ADD CONSTRAINT "Nominee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookedByUserId_fkey" FOREIGN KEY ("bookedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_switchToUnitId_fkey" FOREIGN KEY ("switchToUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstallment" ADD CONSTRAINT "PaymentInstallment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PaymentInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
