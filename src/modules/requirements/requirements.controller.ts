import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequirementsService } from './requirements.service';

@Controller()
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post('projects/:projectId/requirements')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() createRequirementDto: any,
  ) {
    return this.requirementsService.create(projectId, createRequirementDto);
  }

  @Get('projects/:projectId/requirements')
  findByProject(@Param('projectId') projectId: string) {
    return this.requirementsService.findByProject(projectId);
  }

  @Get('requirements/:id')
  findOne(@Param('id') id: string) {
    return this.requirementsService.findOne(id);
  }

  @Put('requirements/:id')
  update(@Param('id') id: string, @Body() updateRequirementDto: any) {
    return this.requirementsService.update(id, updateRequirementDto);
  }

  @Delete('requirements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.requirementsService.remove(id);
  }
}
