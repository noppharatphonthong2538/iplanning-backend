import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SourcesService } from './sources.service';

@Controller('projects/:projectId/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.sourcesService.list(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Param('projectId') projectId: string, @Body() body: { name: string; sortOrder?: number }) {
    return this.sourcesService.create(projectId, body);
  }

  @Patch('reorder')
  reorder(
    @Param('projectId') projectId: string,
    @Body() body: { items: { id?: string; name: string; sortOrder: number }[] },
  ) {
    return this.sourcesService.reorder(projectId, body.items ?? []);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; sortOrder?: number }) {
    return this.sourcesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.sourcesService.remove(id);
  }
}
