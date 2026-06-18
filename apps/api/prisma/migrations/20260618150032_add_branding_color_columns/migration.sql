-- AlterTable: add primaryForeground, colorSource, logoPalette to tenants
ALTER TABLE "tenants" ADD COLUMN "primaryForeground" TEXT;
ALTER TABLE "tenants" ADD COLUMN "colorSource" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "tenants" ADD COLUMN "logoPalette" JSONB;
