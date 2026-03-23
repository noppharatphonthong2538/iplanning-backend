-- Plan V2: add startDate/endDate to tasks, holidayConfig to projects, migrate dependencies format

-- 1. Add startDate and endDate columns to tasks (nullable)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "endDate"   TIMESTAMP(3);

-- 2. Add holidayConfig JSON column to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "holidayConfig" JSONB NOT NULL
  DEFAULT '{"weekdays":[0,6],"specialDates":[],"specialColor":"#fef3c7"}';

-- 3. Migrate dependencies: string[] → {taskId, type, lag}[]
--    Only convert rows that still have a plain string array (not already converted to objects)
UPDATE "tasks"
SET "dependencies" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('taskId', elem, 'type', 'FS', 'lag', 0)
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text("dependencies"::jsonb) AS elem
)
WHERE jsonb_typeof("dependencies"::jsonb) = 'array'
  AND jsonb_array_length("dependencies"::jsonb) > 0
  AND jsonb_typeof(("dependencies"::jsonb)->0) = 'string';
