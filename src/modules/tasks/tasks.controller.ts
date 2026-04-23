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
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('projects/:projectId/tasks')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() createTaskDto: any,
  ) {
    return this.tasksService.create(projectId, createTaskDto);
  }

  @Get('projects/:projectId/tasks')
  findByProject(@Param('projectId') projectId: string) {
    return this.tasksService.findByProject(projectId);
  }

  @Get('tasks/:id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Put('tasks/:id')
  update(@Param('id') id: string, @Body() updateTaskDto: any) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Patch('projects/:projectId/tasks/reorder')
  reorderTasks(
    @Param('projectId') _projectId: string,
    @Body() body: { items: { id: string; taskCode: string; sortOrder: number }[] },
  ) {
    return this.tasksService.reorderTasks(body.items ?? []);
  }

  @Patch('projects/:projectId/tasks/plan-reorder')
  planReorderTasks(
    @Param('projectId') projectId: string,
    @Body() body: { items: { id: string; planOrder: number }[]; clearDepIds?: string[]; filterDepsIds?: string[] },
  ) {
    return this.tasksService.planReorderTasks(
      projectId,
      body.items ?? [],
      body.clearDepIds ?? [],
      body.filterDepsIds ?? [],
    );
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
