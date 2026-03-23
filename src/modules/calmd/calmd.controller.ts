import {
  Controller, Get, Post, Put, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CalmdService } from './calmd.service';

@Controller()
export class CalmdController {
  constructor(private readonly calmdService: CalmdService) {}

  // ── Role endpoints ──────────────────────────────────────────────
  @Post('projects/:projectId/calmd')
  @HttpCode(HttpStatus.CREATED)
  createRole(
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.calmdService.createRole(projectId, dto);
  }

  @Get('projects/:projectId/calmd')
  findByProject(@Param('projectId') projectId: string) {
    return this.calmdService.findByProject(projectId);
  }

  @Get('calmd/:id')
  findOne(@Param('id') id: string) {
    return this.calmdService.findOne(id);
  }

  @Delete('calmd/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRole(@Param('id') id: string) {
    return this.calmdService.removeRole(id);
  }

  // ── Item endpoints ──────────────────────────────────────────────
  @Post('calmd/:roleId/items')
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @Param('roleId') roleId: string,
    @Body() dto: any,
  ) {
    return this.calmdService.createItem(roleId, dto);
  }

  @Put('calmd/items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.calmdService.updateItem(id, dto);
  }

  @Delete('calmd/items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(@Param('id') id: string) {
    return this.calmdService.removeItem(id);
  }
}
