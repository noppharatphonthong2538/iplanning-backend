import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SourcesService {
  constructor(private prisma: PrismaService) {}

  list(projectId: string) {
    return this.prisma.sourceMaster.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  create(projectId: string, data: { name: string; sortOrder?: number }) {
    return this.prisma.sourceMaster.create({
      data: { projectId, name: data.name, sortOrder: data.sortOrder ?? 0 },
    });
  }

  update(id: string, data: { name?: string; sortOrder?: number }) {
    return this.prisma.sourceMaster.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.sourceMaster.delete({ where: { id } });
  }

  /** Bulk replace: delete all then re-insert in order */
  async reorder(projectId: string, items: { id?: string; name: string; sortOrder: number }[]) {
    // Two-pass: avoid unique constraint on name during reorder
    const ts = Date.now();
    await this.prisma.$transaction(async (tx) => {
      // Step 1: rename all to tmp
      const existing = await tx.sourceMaster.findMany({ where: { projectId } });
      for (let i = 0; i < existing.length; i++) {
        await tx.sourceMaster.update({
          where: { id: existing[i]!.id },
          data: { name: `__tmp_${ts}_${i}__` },
        });
      }
      // Step 2: upsert with final names
      for (const item of items) {
        if (item.id) {
          await tx.sourceMaster.update({
            where: { id: item.id },
            data: { name: item.name, sortOrder: item.sortOrder },
          });
        } else {
          await tx.sourceMaster.create({
            data: { projectId, name: item.name, sortOrder: item.sortOrder },
          });
        }
      }
      // Step 3: delete any remaining tmp_ (deleted items)
      await tx.sourceMaster.deleteMany({
        where: { projectId, name: { startsWith: `__tmp_${ts}_` } },
      });
    });
    return this.list(projectId);
  }
}
