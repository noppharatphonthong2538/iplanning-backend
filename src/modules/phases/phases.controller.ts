import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PhasesService } from './phases.service';

@Controller()
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Post('projects/:projectId/phases')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() createPhaseDto: any,
  ) {
    return this.phasesService.create(projectId, createPhaseDto);
  }

  @Get('projects/:projectId/phases')
  findByProject(@Param('projectId') projectId: string) {
    return this.phasesService.findByProject(projectId);
  }

  @Get('phases/:id')
  findOne(@Param('id') id: string) {
    return this.phasesService.findOne(id);
  }

  @Put('phases/:id')
  update(@Param('id') id: string, @Body() updatePhaseDto: any) {
    return this.phasesService.update(id, updatePhaseDto);
  }

  @Patch('projects/:projectId/phases/reorder')
  reorderPhases(
    @Param('projectId') _projectId: string,
    @Body() body: { items: { id: string; phaseCode: string; name: string; color: string; sortOrder: number }[] },
  ) {
    return this.phasesService.reorderPhases(body.items ?? []);
  }

  @Delete('phases/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.phasesService.remove(id);
  }
}
