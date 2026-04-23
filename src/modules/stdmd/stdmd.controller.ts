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
import { StdmdService } from './stdmd.service';

@Controller()
export class StdmdController {
  constructor(private readonly stdmdService: StdmdService) {}

  @Post('projects/:projectId/stdmd')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() createStdmdDto: any,
  ) {
    return this.stdmdService.create(projectId, createStdmdDto);
  }

  @Get('projects/:projectId/stdmd')
  findByProject(@Param('projectId') projectId: string) {
    return this.stdmdService.findByProject(projectId);
  }

  @Get('stdmd/:id')
  findOne(@Param('id') id: string) {
    return this.stdmdService.findOne(id);
  }

  @Put('stdmd/:id')
  update(@Param('id') id: string, @Body() updateStdmdDto: any) {
    return this.stdmdService.update(id, updateStdmdDto);
  }

  @Delete('stdmd/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.stdmdService.remove(id);
  }

  @Patch('projects/:projectId/stdmd/reorder-groups')
  reorderByGroups(
    @Param('projectId') projectId: string,
    @Body() body: { groupOrder: string[] },
  ) {
    return this.stdmdService.reorderByGroups(projectId, body.groupOrder ?? []);
  }

  /** Bulk-assign sequential sortOrders by passing the full ordered list of row IDs.
   *  Used after within-group row drag-and-drop to persist the new order. */
  @Patch('projects/:projectId/stdmd/reorder-rows')
  reorderRows(
    @Param('projectId') projectId: string,
    @Body() body: { orderedIds: string[] },
  ) {
    return this.stdmdService.reorderRows(projectId, body.orderedIds ?? []);
  }
}
