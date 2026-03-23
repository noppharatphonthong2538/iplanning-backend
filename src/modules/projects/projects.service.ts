import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DuplicateProjectDto {
  name: string;
  copyStdMd?: boolean;
  copySources?: boolean;
  copyRoles?: boolean;
  copyPhases?: boolean;
  copyTasks?: boolean;   // requires copyPhases = true
  copyCalMd?: boolean;   // copies CalMdRoles + CalMdItems; remaps linkedTaskId if copyTasks = true
}

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  create(createProjectDto: any) {
    return this.prisma.project.create({
      data: createProjectDto,
    });
  }

  /** Active projects only (deletedAt is null) */
  findAll() {
    const db = this.prisma as any;
    return db.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Soft-deleted projects (deletedAt is not null) */
  findTrash() {
    const db = this.prisma as any;
    return db.project.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
    });
  }

  private toDateTime(val: any): Date | null {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    const s = String(val).trim();
    if (!s) return null;
    if (s.includes('T') || s.includes(' ')) return new Date(s);
    return new Date(s + 'T00:00:00.000Z');
  }

  update(id: string, updateProjectDto: any) {
    const { startDate, ...rest } = updateProjectDto;
    const data: any = { ...rest };
    if (startDate !== undefined) data.startDate = this.toDateTime(startDate);
    return this.prisma.project.update({
      where: { id },
      data,
    });
  }

  /** Soft delete — sets deletedAt, data stays in DB */
  softDelete(id: string) {
    const db = this.prisma as any;
    return db.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Restore from trash — clears deletedAt */
  restore(id: string) {
    const db = this.prisma as any;
    return db.project.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /** Hard delete — permanently removes from DB (all related data via cascade) */
  remove(id: string) {
    return this.prisma.project.delete({
      where: { id },
    });
  }

  async duplicate(sourceId: string, dto: DuplicateProjectDto) {
    // Use raw query helper to bypass stale Prisma types until migration is applied
    const prisma = this.prisma as any;

    const source = await prisma.project.findUnique({
      where: { id: sourceId },
      include: {
        stdMdRows: true,
        sources: true,
        roleConfigs: true,
        phases: true,
        // Include tasks sorted by sortOrder so dependencies resolve in order
        tasks: { orderBy: { sortOrder: 'asc' } },
        // Include CalMd roles with their items (for LINK→TASK remapping)
        calMdRoles: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!source) throw new Error('Source project not found');

    // 1️⃣ Create new project (copy rates & startDate)
    const newProject = await prisma.project.create({
      data: {
        name: dto.name,
        rates: source.rates,
        startDate: source.startDate,
        holidayConfig: source.holidayConfig ?? { weekdays: [0, 6], specialDates: [], specialColor: '#fef3c7' },
      },
    });

    // 2️⃣ Copy Standard Manday rows
    if (dto.copyStdMd && source.stdMdRows?.length) {
      for (const r of source.stdMdRows) {
        await prisma.stdMdRow.create({
          data: { projectId: newProject.id, stdCode: r.stdCode, group: r.group, type: r.type, roleMD: r.roleMD, sortOrder: r.sortOrder },
        });
      }
    }

    // 3️⃣ Copy Source Master
    if (dto.copySources && source.sources?.length) {
      for (const s of source.sources) {
        await prisma.sourceMaster.create({
          data: { projectId: newProject.id, name: s.name, sortOrder: s.sortOrder },
        });
      }
    }

    // 4️⃣ Copy Role Configs
    if (dto.copyRoles && source.roleConfigs?.length) {
      for (const r of source.roleConfigs) {
        await prisma.roleConfig.create({
          data: { projectId: newProject.id, name: r.name, color: r.color, isUser: r.isUser, sortOrder: r.sortOrder },
        });
      }
    }

    // 5️⃣ Copy Phases — build oldPhaseId → newPhaseId map
    const phaseIdMap = new Map<string, string>(); // old id → new id
    const shouldCopyPhases = dto.copyPhases || dto.copyTasks; // tasks require phases
    if (shouldCopyPhases && source.phases?.length) {
      for (const p of source.phases) {
        const newPhase = await prisma.phase.create({
          data: { projectId: newProject.id, phaseCode: p.phaseCode, name: p.name, color: p.color, sortOrder: p.sortOrder },
        });
        phaseIdMap.set(p.id, newPhase.id);
      }
    }

    // 6️⃣ Copy Tasks — two-pass: create first, then remap dependencies
    // taskIdMap is declared in outer scope so Cal MD step (7️⃣) can use it for linkedTaskId remapping
    const taskIdMap = new Map<string, string>(); // old task id → new task id

    if (dto.copyTasks && source.tasks?.length && phaseIdMap.size > 0) {
      // Pass 1: create all tasks with empty dependencies
      for (const t of source.tasks) {
        const newPhaseId = phaseIdMap.get(t.phaseId);
        if (!newPhaseId) continue; // skip tasks whose phase wasn't copied (shouldn't happen)
        const newTask = await prisma.task.create({
          data: {
            projectId: newProject.id,
            phaseId:   newPhaseId,
            taskCode:  t.taskCode,
            type:      t.type,
            name:      t.name,
            featureGroup: t.featureGroup,
            featureType:  t.featureType,
            taskMode:     t.taskMode,
            roleMD:       t.roleMD,
            activeRoles:  t.activeRoles,
            startDate:    t.startDate ?? null,
            endDate:      t.endDate ?? null,
            startWeek:    t.startWeek,
            endWeek:      t.endWeek,
            dependencies: [],   // filled in pass 2
            sortOrder:    t.sortOrder,
          },
        });
        taskIdMap.set(t.id, newTask.id);
      }

      // Pass 2: remap dependencies (old task ids → new task ids)
      // Supports both legacy string[] and new {taskId, type, lag}[] format
      for (const t of source.tasks) {
        const newTaskId = taskIdMap.get(t.id);
        const oldDeps: any[] = Array.isArray(t.dependencies) ? t.dependencies : [];
        if (!newTaskId || oldDeps.length === 0) continue;

        const remappedDeps = oldDeps
          .map((d: any) => {
            if (typeof d === 'string') {
              const newId = taskIdMap.get(d);
              return newId ? { taskId: newId, type: 'FS', lag: 0 } : null;
            }
            const newId = taskIdMap.get(d.taskId);
            return newId ? { ...d, taskId: newId } : null;
          })
          .filter(Boolean);

        if (remappedDeps.length > 0) {
          await prisma.task.update({
            where: { id: newTaskId },
            data: { dependencies: remappedDeps },
          });
        }
      }
    }

    // 7️⃣ Copy Cal MD Roles + Items
    // linkedTaskId is remapped via taskIdMap (built in step 6️⃣) when tasks were also copied.
    // If tasks were not copied, linkedTaskId is set to null (reference would be broken).
    if (dto.copyCalMd && source.calMdRoles?.length) {
      for (const role of source.calMdRoles) {
        const newRole = await prisma.calMdRole.create({
          data: {
            projectId: newProject.id,
            role:      role.role,
            sortOrder: role.sortOrder,
          },
        });

        for (const item of role.items ?? []) {
          // Remap linkedTaskId via taskIdMap (null if tasks not copied or not found)
          const newLinkedTaskId = item.linkedTaskId
            ? (taskIdMap.get(item.linkedTaskId) ?? null)
            : null;

          // Remap baseScope: 'all' stays 'all', phase UUIDs must be remapped via phaseIdMap
          // If the old phase wasn't copied (phaseIdMap miss), fall back to 'all'
          const newBaseScope =
            !item.baseScope || item.baseScope === 'all'
              ? 'all'
              : (phaseIdMap.get(item.baseScope) ?? 'all');

          await prisma.calMdItem.create({
            data: {
              calMdRoleId:  newRole.id,
              name:         item.name,
              value:        item.value,
              type:         item.type,
              baseScope:    newBaseScope,
              linkedTaskId: newLinkedTaskId,
              sortOrder:    item.sortOrder,
            },
          });
        }
      }
    }

    return newProject;
  }
}
