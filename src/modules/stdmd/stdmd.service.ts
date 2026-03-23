import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StdmdService {
  constructor(private prisma: PrismaService) { }

  create(projectId: string, createStdmdDto: any) {
    return this.prisma.stdMdRow.create({
      data: {
        ...createStdmdDto,
        projectId,
      },
    });
  }

  findByProject(projectId: string) {
    return this.prisma.stdMdRow.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.stdMdRow.findUnique({
      where: { id },
    });
  }

  update(id: string, updateStdmdDto: any) {
    return this.prisma.stdMdRow.update({
      where: { id },
      data: updateStdmdDto,
    });
  }

  remove(id: string) {
    return this.prisma.stdMdRow.delete({
      where: { id },
    });
  }

  /**
   * Bulk update sortOrder for a list of rows.
   * Used by FGModal when user reorders groups — rows are resorted so
   * group[0] rows come first, group[1] next, etc., maintaining relative
   * order within each group.
   */
  async reorderByGroups(projectId: string, groupOrder: string[]) {
    const rows = await this.prisma.stdMdRow.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });

    // Build new sortOrder: group first by groupOrder, then by existing relative order
    const sorted: typeof rows = [];
    for (const group of groupOrder) {
      sorted.push(...rows.filter((r) => r.group === group));
    }
    // Append any rows whose group isn't in groupOrder (shouldn't happen, but safety)
    rows.forEach((r) => { if (!sorted.includes(r)) sorted.push(r); });

    // Bulk update sortOrders
    await this.prisma.$transaction(
      sorted.map((r, i) =>
        this.prisma.stdMdRow.update({ where: { id: r.id }, data: { sortOrder: i } }),
      ),
    );

    return this.findByProject(projectId);
  }
}
