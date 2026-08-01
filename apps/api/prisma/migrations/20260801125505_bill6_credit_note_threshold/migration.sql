-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creditNoteApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 5000;
