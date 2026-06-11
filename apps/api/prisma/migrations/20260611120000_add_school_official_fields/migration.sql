-- Add official / document-related school profile fields to tenants.
-- All nullable, filled in by school admins. Used on report cards, certificates,
-- ID cards, invoices and other official documents.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "motto" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "principalName" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "principalSignatureUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "schoolStampUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "affiliationBoard" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "affiliationNumber" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "province" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "district" TEXT;
