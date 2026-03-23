-- Add new TaskMode enum values
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction as DML
-- that references the new value. This migration only adds the enum values.
-- Data migration (feature → auto, derived → calmd) is in the next migration.
ALTER TYPE "TaskMode" ADD VALUE IF NOT EXISTS 'auto';
ALTER TYPE "TaskMode" ADD VALUE IF NOT EXISTS 'calmd';
ALTER TYPE "TaskMode" ADD VALUE IF NOT EXISTS 'allocate';
