-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('Task', 'Deliverable', 'Milestone');

-- CreateEnum
CREATE TYPE "TaskMode" AS ENUM ('feature', 'manual', 'derived');

-- CreateEnum
CREATE TYPE "CalMdType" AS ENUM ('pct', 'fixed');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rates" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reqNo" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "taskCode" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'Task',
    "name" TEXT NOT NULL,
    "featureGroup" TEXT NOT NULL DEFAULT '',
    "featureType" TEXT NOT NULL DEFAULT '',
    "taskMode" "TaskMode" NOT NULL DEFAULT 'manual',
    "roleMD" JSONB NOT NULL DEFAULT '{}',
    "activeRoles" JSONB,
    "startWeek" INTEGER NOT NULL DEFAULT 1,
    "endWeek" INTEGER NOT NULL DEFAULT 1,
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_requirements" (
    "taskId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "task_requirements_pkey" PRIMARY KEY ("taskId","requirementId")
);

-- CreateTable
CREATE TABLE "std_md_rows" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stdCode" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "roleMD" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "std_md_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cal_md_roles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cal_md_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cal_md_items" (
    "id" TEXT NOT NULL,
    "calMdRoleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "CalMdType" NOT NULL DEFAULT 'pct',
    "linkedTaskId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cal_md_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_masters" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "source_masters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirements_projectId_reqNo_key" ON "requirements"("projectId", "reqNo");

-- CreateIndex
CREATE UNIQUE INDEX "phases_projectId_phaseCode_key" ON "phases"("projectId", "phaseCode");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_projectId_taskCode_key" ON "tasks"("projectId", "taskCode");

-- CreateIndex
CREATE UNIQUE INDEX "std_md_rows_projectId_stdCode_key" ON "std_md_rows"("projectId", "stdCode");

-- CreateIndex
CREATE UNIQUE INDEX "cal_md_roles_projectId_role_key" ON "cal_md_roles"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "source_masters_projectId_name_key" ON "source_masters"("projectId", "name");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_requirements" ADD CONSTRAINT "task_requirements_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_requirements" ADD CONSTRAINT "task_requirements_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "std_md_rows" ADD CONSTRAINT "std_md_rows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cal_md_roles" ADD CONSTRAINT "cal_md_roles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cal_md_items" ADD CONSTRAINT "cal_md_items_calMdRoleId_fkey" FOREIGN KEY ("calMdRoleId") REFERENCES "cal_md_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cal_md_items" ADD CONSTRAINT "cal_md_items_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_masters" ADD CONSTRAINT "source_masters_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
