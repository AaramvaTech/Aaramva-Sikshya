-- Add nullable school-profile fields to tenants (filled in by school admins later)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "establishedYear" INTEGER;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "website" TEXT;
