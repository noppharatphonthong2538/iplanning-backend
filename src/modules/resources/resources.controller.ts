import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ResourcesService } from './resources.service';

@Controller('projects/:projectId/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.resourcesService.list(projectId);
  }

  /** Bulk-save: pass the full desired list; deleted/upserted automatically */
  @Patch('bulk-save')
  bulkSave(
    @Param('projectId') projectId: string,
    @Body() body: { items: { role: string; count: number }[] },
  ) {
    return this.resourcesService.bulkSave(projectId, body.items ?? []);
  }
}
