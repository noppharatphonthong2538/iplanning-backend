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
import { ProjectsService, DuplicateProjectDto } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProjectDto: any) {
    return this.projectsService.create(createProjectDto);
  }

  /** Active projects only */
  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  /** Soft-deleted projects (trash) — MUST be before :id route */
  @Get('trash')
  findTrash() {
    return this.projectsService.findTrash();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateProjectDto: any) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@Param('id') id: string, @Body() body: DuplicateProjectDto) {
    return this.projectsService.duplicate(id, body);
  }

  /** Soft delete — moves to trash */
  @Patch(':id/soft-delete')
  softDelete(@Param('id') id: string) {
    return this.projectsService.softDelete(id);
  }

  /** Restore from trash */
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.projectsService.restore(id);
  }

  /** Hard delete — permanently removes from DB */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  /** Legacy hard delete (keep for backward compat) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
