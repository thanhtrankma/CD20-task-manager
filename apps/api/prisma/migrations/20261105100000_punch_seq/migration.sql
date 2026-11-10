-- DropIndex
DROP INDEX "attendance_punches_code_punched_at_key";

-- AlterTable
ALTER TABLE "attendance_punches" ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_code_punched_at_seq_key" ON "attendance_punches"("code", "punched_at", "seq");

