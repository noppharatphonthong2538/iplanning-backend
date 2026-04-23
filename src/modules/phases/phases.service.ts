import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PhasesService {
  constructor(private prisma: PrismaService) {}

  create(projectId: string, createPhaseDto: any) {
    return this.prisma.phase.create({
      data: {
        ...createPhaseDto,
        projectId,
      },
    });
  }

  findByProject(projectId: string) {
    return this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.phase.findUnique({
      where: { id },
    });
  }

  update(id: string, updatePhaseDto: any) {
    return this.prisma.phase.update({
      where: { id },
      data: updatePhaseDto,
    });
  }

  remove(id: string) {
    return this.prisma.phase.delete({
      where: { id },
    });
  }

  async reorderPhases(items: { id: string; phaseCode: string; name: string; color: string; sortOrder: number }[]) {
    if (!items.length) return { reordered: 0 };
    const ts = Date.now();
    await this.prisma.$transaction(async (tx) => {
      // Pass 1: assign unique temp codes to avoid unique-constraint conflicts
      for (let i = 0; i < items.length; i++) {
        await tx.phase.update({
          where: { id: items[i].id },
          data: { phaseCode: `__tmp_${ts}_${i}__` },
        });
      }
      // Pass 2: assign final codes + sortOrders
      for (const { id, phaseCode, name, color, sortOrder } of items) {
        await tx.phase.update({ where: { id }, data: { phaseCode, name, color, sortOrder } });
      }
    });
    return { reordered: items.length };
  }

  /** Plan-tab-only reorder: update planOrder only, no phaseCode renaming. */
  async planReorderPhases(items: { id: string; planOrder: number }[]) {
    if (!items.length) return { reordered: 0 };
    await this.prisma.$transaction(
      items.map(({ id, planOrder }) =>
        this.prisma.phase.update({ where: { id }, data: { planOrder } }),
      ),
    );
    return { reordered: items.length };
  }
}
