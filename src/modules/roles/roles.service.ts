import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesService {
  // Use 'any' cast to avoid stale Prisma types before migration
  private get db(): any { return this.prisma; }

  constructor(private prisma: PrismaService) {}

  list(projectId: string) {
    return this.db.roleConfig.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  create(projectId: string, data: { name: string; color?: string; isUser?: boolean; sortOrder?: number }) {
    return this.db.roleConfig.create({
      data: {
        projectId,
        name: data.name,
        color: data.color ?? '#94a3b8',
        isUser: data.isUser ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  update(id: string, data: { name?: string; color?: string; isUser?: boolean; sortOrder?: number }) {
    return this.db.roleConfig.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.db.roleConfig.delete({ where: { id } });
  }

  /** Bulk save: delete removed, create new, reorder existing — all in one transaction */
  async bulkSave(
    projectId: string,
    items: { id?: string; name: string; color: string; isUser: boolean; sortOrder: number }[],
  ) {
    const existing = await this.db.roleConfig.findMany({ where: { projectId } });
    const existingIds = new Set((existing as any[]).map((r: any) => r.id as string));
    const keepIds     = new Set(items.filter((r) => r.id).map((r) => r.id as string));

    const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
    const toCreate = items.filter((r) => !r.id);
    const toUpdate = items.filter((r) => r.id);

    const ts = Date.now();
    await this.prisma.$transaction(async (tx: any) => {
      // Delete removed
      if (toDelete.length) {
        await tx.roleConfig.deleteMany({ where: { id: { in: toDelete } } });
      }
      // Rename existing to tmp (avoid unique constraint)
      for (let i = 0; i < toUpdate.length; i++) {
        await tx.roleConfig.update({
          where: { id: toUpdate[i]!.id },
          data: { name: `__tmp_${ts}_${i}__` },
        });
      }
      // Set final values
      for (const item of toUpdate) {
        await tx.roleConfig.update({
          where: { id: item.id },
          data: { name: item.name, color: item.color, isUser: item.isUser, sortOrder: item.sortOrder },
        });
      }
      // Create new
      for (const item of toCreate) {
        await tx.roleConfig.create({
          data: { projectId, name: item.name, color: item.color, isUser: item.isUser, sortOrder: item.sortOrder },
        });
      }
    });
    return this.list(projectId);
  }
}
