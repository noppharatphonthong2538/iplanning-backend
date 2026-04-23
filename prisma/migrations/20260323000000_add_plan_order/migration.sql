-- Add planOrder to tasks and phases for plan-tab-specific ordering
-- (independent of sortOrder used by Tasks tab for taskCode renumbering)

ALTER TABLE "tasks"  ADD COLUMN IF NOT EXISTS "planOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "planOrder" INTEGER NOT NULL DEFAULT 0;

-- Seed planOrder from existing sortOrder so current order is preserved
UPDATE "tasks"  SET "planOrder" = "sortOrder";
UPDATE "phases" SET "planOrder" = "sortOrder";
