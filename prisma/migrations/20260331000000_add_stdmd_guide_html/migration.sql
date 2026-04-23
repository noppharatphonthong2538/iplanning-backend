-- AlterTable: add stdMdGuideHtml (nullable) to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "stdMdGuideHtml" TEXT;
