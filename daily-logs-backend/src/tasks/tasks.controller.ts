import { Controller, Get } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // GET http://localhost:3000/tasks
  @Get()
  async getAllTasks() {
    return this.tasksService.getActiveTasks();
  }

  // GET http://localhost:3000/tasks/standup
  @Get('standup')
  async getStandupNotes() {
    return this.tasksService.generateDailyStandupReport();
  }
}
