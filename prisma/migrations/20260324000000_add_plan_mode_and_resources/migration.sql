-- Add planMode column to tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "planMode" TEXT NOT NULL DEFAULT 'normal';

-- Create project_resources table
CREATE TABLE IF NOT EXISTS "project_resources" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "project_resources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_resources_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_resources_projectId_role_key"
    UNIQUE ("projectId", "role")
);
