-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING_UNIT', 'PENDING_LEADER', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DayPart" AS ENUM ('FULL', 'MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "PunchSource" AS ENUM ('IMPORT', 'DEVICE');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "work_shift_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "attendance_code" VARCHAR(32),
ADD COLUMN     "hr_manager" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staff_category_id" INTEGER;

-- CreateTable
CREATE TABLE "staff_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "annual_days" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "staff_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deducts_balance" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" DOUBLE PRECISION,
    "carried_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_part" "DayPart" NOT NULL DEFAULT 'FULL',
    "end_part" "DayPart" NOT NULL DEFAULT 'FULL',
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL,
    "approver_unit_id" INTEGER,
    "needs_leader" BOOLEAN NOT NULL DEFAULT false,
    "unit_decided_by_id" INTEGER,
    "unit_decided_at" TIMESTAMP(3),
    "leader_decided_by_id" INTEGER,
    "leader_decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "revoked_by_id" INTEGER,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_shifts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "break_start" VARCHAR(5) NOT NULL DEFAULT '11:30',
    "break_end" VARCHAR(5) NOT NULL DEFAULT '13:30',
    "grace_minutes" INTEGER NOT NULL DEFAULT 5,
    "workdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER,
    "source" "PunchSource" NOT NULL DEFAULT 'IMPORT',
    "import_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_imports" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "inserted" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "unmatched" INTEGER NOT NULL,
    "range_from" TIMESTAMP(3),
    "range_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_categories_name_key" ON "staff_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_user_id_year_key" ON "leave_balances"("user_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_user_id_start_date_idx" ON "leave_requests"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_approver_unit_id_status_idx" ON "leave_requests"("approver_unit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "attendance_punches_user_id_punched_at_idx" ON "attendance_punches"("user_id", "punched_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_code_punched_at_key" ON "attendance_punches"("code", "punched_at");

-- CreateIndex
CREATE INDEX "attendance_imports_created_at_idx" ON "attendance_imports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_attendance_code_key" ON "users"("attendance_code");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_work_shift_id_fkey" FOREIGN KEY ("work_shift_id") REFERENCES "work_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_category_id_fkey" FOREIGN KEY ("staff_category_id") REFERENCES "staff_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_unit_id_fkey" FOREIGN KEY ("approver_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_unit_decided_by_id_fkey" FOREIGN KEY ("unit_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leader_decided_by_id_fkey" FOREIGN KEY ("leader_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

