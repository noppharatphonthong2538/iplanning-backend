import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StdmdService {
  constructor(private prisma: PrismaService) { }

  async create(projectId: string, createStdmdDto: any) {
    // Always generate a collision-safe stdCode on the backend.
    // Using frontend-supplied length-based codes breaks when rows have been deleted.
    const existing = await this.prisma.stdMdRow.findMany({
      where: { projectId },
      select: { stdCode: true },
    });
    // Extract numeric suffix from codes like "SM01", "SM12" → take MAX + 1
    const maxNum = existing.reduce((max, r) => {
      const n = parseInt(r.stdCode.replace(/\D/g, ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const stdCode = `SM${String(maxNum + 1).padStart(2, '0')}`;

    return this.prisma.stdMdRow.create({
      data: {
        ...createStdmdDto,
        stdCode,   // backend-generated code always wins
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

  /**
   * Bulk-assign sequential sortOrders based on the caller-supplied ordered list of row IDs.
   * Used after within-group drag-and-drop to persist the new row order to the database.
   */
  async reorderRows(projectId: string, orderedIds: string[]) {
    if (!orderedIds.length) return this.findByProject(projectId);

    // Prisma update requires a unique-field where clause; id (@id) is the unique key.
    // We verify ownership by only touching IDs that belong to this project.
    const owned = await this.prisma.stdMdRow.findMany({
      where: { projectId, id: { in: orderedIds } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((r) => r.id));

    await this.prisma.$transaction(
      orderedIds
        .filter((id) => ownedSet.has(id))
        .map((id, i) =>
          this.prisma.stdMdRow.update({
            where: { id },
            data: { sortOrder: i },
          }),
        ),
    );

    return this.findByProject(projectId);
  }
}
