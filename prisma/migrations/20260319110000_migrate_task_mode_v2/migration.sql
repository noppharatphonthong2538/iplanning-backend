-- Migrate existing taskMode data to new enum values
-- Must run AFTER 20260319100000_add_task_mode_v2 is committed,
-- because PostgreSQL requires ADD VALUE to be committed before the new
-- enum value can be referenced in DML statements.
UPDATE "tasks" SET "taskMode" = 'auto'  WHERE "taskMode" = 'feature';
UPDATE "tasks" SET "taskMode" = 'calmd' WHERE "taskMode" = 'derived';
