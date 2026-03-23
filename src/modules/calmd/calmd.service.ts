import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CalmdService {
  constructor(private prisma: PrismaService) { }

  // ── Role CRUD ──────────────────────────────────────────────────────
  createRole(projectId: string, dto: any) {
    return this.prisma.calMdRole.create({
      data: { role: dto.role, sortOrder: dto.sortOrder ?? 0, projectId },
      include: { items: true },
    });
  }

  findByProject(projectId: string) {
    return this.prisma.calMdRole.findMany({
      where: { projectId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.calMdRole.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  removeRole(id: string) {
    return this.prisma.calMdRole.delete({ where: { id } });
  }

  // ── Item CRUD ──────────────────────────────────────────────────────
  createItem(roleId: string, dto: any) {
    return this.prisma.calMdItem.create({
      data: {
        calMdRoleId: roleId,
        name: dto.name ?? 'New Item',
        value: dto.value ?? 0,
        type: dto.type ?? 'pct',
        baseScope: dto.baseScope ?? 'all',
        linkedTaskId: dto.linkedTaskId ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  updateItem(id: string, dto: any) {
    const { calMdRoleId, ...data } = dto; // strip relation field if present
    // Ensure baseScope defaults to 'all' if not provided
    if (data.baseScope === undefined) data.baseScope = 'all';
    return this.prisma.calMdItem.update({ where: { id }, data });
  }

  removeItem(id: string) {
    return this.prisma.calMdItem.delete({ where: { id } });
  }
}
