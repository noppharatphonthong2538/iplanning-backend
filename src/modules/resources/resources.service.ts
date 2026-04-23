import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  private get db(): any { return this.prisma; }

  constructor(private prisma: PrismaService) {}

  list(projectId: string) {
    return this.db.projectResource.findMany({
      where: { projectId },
      orderBy: { role: 'asc' },
    });
  }

  /**
   * Upsert all resources for a project in one call.
   * Deletes removed roles, upserts remaining.
   */
  async bulkSave(
    projectId: string,
    items: { role: string; count: number }[],
  ) {
    // Remove roles not in the new list
    await this.db.projectResource.deleteMany({
      where: {
        projectId,
        role: { notIn: items.map((i) => i.role) },
      },
    });

    // Upsert each item
    for (const { role, count } of items) {
      await this.db.projectResource.upsert({
        where: { projectId_role: { projectId, role } },
        create: { id: require('crypto').randomUUID(), projectId, role, count },
        update: { count },
      });
    }

    return this.list(projectId);
  }
}
