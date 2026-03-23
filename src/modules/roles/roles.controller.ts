import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';

@Controller('projects/:projectId/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.rolesService.list(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() body: { name: string; color?: string; isUser?: boolean; sortOrder?: number },
  ) {
    return this.rolesService.create(projectId, body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; color?: string; isUser?: boolean; sortOrder?: number },
  ) {
    return this.rolesService.update(id, body);
  }

  @Patch('bulk-save')
  bulkSave(
    @Param('projectId') projectId: string,
    @Body() body: { items: { id?: string; name: string; color: string; isUser: boolean; sortOrder: number }[] },
  ) {
    return this.rolesService.bulkSave(projectId, body.items ?? []);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
