import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CostService {
  constructor(private prisma: PrismaService) { }

  async calculateCost(projectId: string) {
    // Fetch all relevant data for cost calculation
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        calMdRoles: {
          include: { items: true },
        },
        stdMdRows: true,
      },
    });

    if (!project) {
      return { error: 'Project not found' };
    }

    // Basic cost calculation logic
    let totalCost = 0;

    // Calculate from CalMd entries
    if (project.calMdRoles && Array.isArray(project.calMdRoles)) {
      project.calMdRoles.forEach((role) => {
        totalCost += role.items.reduce(
          (sum: number, item: any) => sum + (item.value || 0),
          0,
        );
      });
    }

    // Calculate from StdMd entries
    if (project.stdMdRows && Array.isArray(project.stdMdRows)) {
      // StdMdRow stores roleMD as Json — sum up values in roleMD map
      project.stdMdRows.forEach((row: any) => {
        if (row.roleMD && typeof row.roleMD === 'object') {
          totalCost += Object.values(row.roleMD as Record<string, number>).reduce(
            (sum: number, v: number) => sum + (v || 0),
            0,
          );
        }
      });
    }

    return {
      projectId,
      totalCost,
      currency: 'MD',
      breakdown: {
        calMdCost: project.calMdRoles
          ? project.calMdRoles.reduce(
            (sum: number, role: any) =>
              sum +
              role.items.reduce(
                (s: number, item: any) => s + (item.value || 0),
                0,
              ),
            0,
          )
          : 0,
        stdMdCost: project.stdMdRows
          ? project.stdMdRows.reduce((sum: number, row: any) => {
            if (row.roleMD && typeof row.roleMD === 'object') {
              return (
                sum +
                Object.values(row.roleMD as Record<string, number>).reduce(
                  (s: number, v: number) => s + (v || 0),
                  0,
                )
              );
            }
            return sum;
          }, 0)
          : 0,
      },
    };
  }
}
