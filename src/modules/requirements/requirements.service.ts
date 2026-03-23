import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RequirementsService {
  constructor(private prisma: PrismaService) {}

  create(projectId: string, createRequirementDto: any) {
    return this.prisma.requirement.create({
      data: { ...createRequirementDto, projectId },
    });
  }

  findByProject(projectId: string) {
    return this.prisma.requirement.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.requirement.findUnique({ where: { id } });
  }

  update(id: string, updateRequirementDto: any) {
    return this.prisma.requirement.update({
      where: { id },
      data: updateRequirementDto,
    });
  }

  remove(id: string) {
    return this.prisma.requirement.delete({ where: { id } });
  }
}
