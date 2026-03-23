-- AlterTable: add baseScope column to cal_md_items
ALTER TABLE "cal_md_items" ADD COLUMN IF NOT EXISTS "base_scope" TEXT NOT NULL DEFAULT 'all';
