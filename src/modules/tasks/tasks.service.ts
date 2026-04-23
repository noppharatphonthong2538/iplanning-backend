import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(projectId: string, createTaskDto: any) {
    const { requirements, dependencies, activeRoles, roleMD, ...taskData } = createTaskDto;
    try {
      return await this.prisma.task.create({
        data: {
          ...taskData,
          projectId,
          roleMD:      roleMD      ?? {},
          activeRoles: activeRoles ?? Prisma.JsonNull,
          dependencies: dependencies ?? [],
          requirements: requirements?.length
            ? { create: requirements.map((reqId: string) => ({ requirementId: reqId })) }
            : undefined,
        },
        include: { requirements: { select: { requirementId: true } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`Task code "${taskData.taskCode}" already exists in this project`);
      }
      if (e?.code === 'P2003') {
        throw new BadRequestException('Invalid Phase or Project reference');
      }
      throw e;
    }
  }

  async findByProject(projectId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: { requirements: { select: { requirementId: true } } },
    });
    // Transform: flatten requirements to string[]
    return tasks.map((t) => ({
      ...t,
      requirements: t.requirements.map((r) => r.requirementId),
    }));
  }

  async findOne(id: string) {
    const t = await this.prisma.task.findUnique({
      where: { id },
      include: { requirements: { select: { requirementId: true } } },
    });
    if (!t) return null;
    return { ...t, requirements: t.requirements.map((r) => r.requirementId) };
  }

  /** Convert "YYYY-MM-DD" or any date-like string to a proper Date object for Prisma DateTime fields */
  private toDateTime(val: any): Date | null {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    const s = String(val).trim();
    if (!s) return null;
    // If already has time component, parse directly
    if (s.includes('T') || s.includes(' ')) return new Date(s);
    // Date-only "YYYY-MM-DD" → treat as UTC midnight
    return new Date(s + 'T00:00:00.000Z');
  }

  async update(id: string, updateTaskDto: any) {
    const { requirements, dependencies, activeRoles, roleMD, startDate, endDate, ...taskData } = updateTaskDto;
    // If requirements array provided, sync the junction table
    if (Array.isArray(requirements)) {
      await this.prisma.taskRequirement.deleteMany({ where: { taskId: id } });
      if (requirements.length > 0) {
        await this.prisma.taskRequirement.createMany({
          data: requirements.map((reqId: string) => ({ taskId: id, requirementId: reqId })),
        });
      }
    }
    const updateData: any = { ...taskData };
    if (roleMD !== undefined)       updateData.roleMD = roleMD;
    if (activeRoles !== undefined)  updateData.activeRoles = activeRoles ?? Prisma.JsonNull;
    if (dependencies !== undefined) updateData.dependencies = dependencies;
    if (startDate !== undefined)    updateData.startDate = this.toDateTime(startDate);
    if (endDate !== undefined)      updateData.endDate   = this.toDateTime(endDate);

    if (Object.keys(updateData).length > 0) {
      await this.prisma.task.update({ where: { id }, data: updateData });
    }
    return this.findOne(id);
  }

  remove(id: string) {
    return this.prisma.task.delete({ where: { id } });
  }

  /**
   * Reorder tasks within a phase.
   * Uses a two-phase transaction to avoid unique-constraint conflicts on taskCode:
   *   1) Rename all to temp codes (no conflicts)
   *   2) Rename to final codes + update sortOrders
   */
  async reorderTasks(items: { id: string; taskCode: string; sortOrder: number }[]) {
    if (!items.length) return { reordered: 0 };
    const ts = Date.now();
    await this.prisma.$transaction(async (tx) => {
      // Phase 1: assign unique temp codes
      for (let i = 0; i < items.length; i++) {
        await tx.task.update({
          where: { id: items[i].id },
          data: { taskCode: `__tmp_${ts}_${i}__` },
        });
      }
      // Phase 2: assign final codes + sortOrders
      for (const { id, taskCode, sortOrder } of items) {
        await tx.task.update({ where: { id }, data: { taskCode, sortOrder } });
      }
    });
    return { reordered: items.length };
  }

  /**
   * Plan-tab-only reorder: update planOrder only, no taskCode renaming.
   * Also clears dependencies of moved tasks and removes references to them
   * from other tasks in the same project.
   */
  async planReorderTasks(
    projectId: string,
    items: { id: string; planOrder: number }[],
    clearDepIds: string[],    // task IDs whose entire dep array should be wiped (task-level reorder)
    filterDepsIds: string[] = [], // task IDs for which only cross-group deps are removed (phase-level reorder)
  ) {
    const hasWork = items.length || clearDepIds.length || filterDepsIds.length;
    if (!hasWork) return { reordered: 0 };

    await this.prisma.$transaction(async (tx) => {
      // 1. Update planOrder for all reordered tasks
      for (const { id, planOrder } of items) {
        await tx.task.update({ where: { id }, data: { planOrder } });
      }

      // 2. Wipe entire dep arrays for clearDepIds (used by task-level reorder)
      if (clearDepIds.length) {
        await tx.task.updateMany({
          where: { id: { in: clearDepIds } },
          data: { dependencies: [] },
        });
      }

      // 3. For filterDepsIds (phase-level reorder): keep only internal deps (within the group),
      //    remove any dep pointing to a task outside the group
      if (filterDepsIds.length) {
        const filterTasks = await tx.task.findMany({
          where: { id: { in: filterDepsIds } },
          select: { id: true, dependencies: true },
        });
        for (const t of filterTasks) {
          const deps = t.dependencies as any[];
          if (!Array.isArray(deps) || !deps.length) continue;
          const kept = deps.filter((d: any) => filterDepsIds.includes(d.taskId));
          if (kept.length !== deps.length) {
            await tx.task.update({ where: { id: t.id }, data: { dependencies: kept } });
          }
        }
      }

      // 4. Remove references to cleared/filtered tasks from all other tasks in this project
      const allAffectedIds = [...clearDepIds, ...filterDepsIds];
      if (!allAffectedIds.length) return;

      const otherTasks = await tx.task.findMany({
        where: { projectId, id: { notIn: allAffectedIds } },
        select: { id: true, dependencies: true },
      });
      for (const t of otherTasks) {
        const deps = t.dependencies as any[];
        if (!Array.isArray(deps) || !deps.length) continue;
        const filtered = deps.filter((d: any) => !allAffectedIds.includes(d.taskId));
        if (filtered.length !== deps.length) {
          await tx.task.update({ where: { id: t.id }, data: { dependencies: filtered } });
        }
      }
    });
    return { reordered: items.length };
  }
}
