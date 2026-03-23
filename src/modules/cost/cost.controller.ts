import { Controller, Get, Param } from '@nestjs/common';
import { CostService } from './cost.service';

@Controller()
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get('projects/:projectId/cost')
  calculateCost(@Param('projectId') projectId: string) {
    return this.costService.calculateCost(projectId);
  }
}
