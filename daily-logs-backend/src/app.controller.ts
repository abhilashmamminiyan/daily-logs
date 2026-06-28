import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { SyncService } from './sync/sync.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly syncService: SyncService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('sync/trigger')
  async triggerSync() {
    await this.syncService.handleSyncCycle();
    return { status: 'success', message: 'Sync cycle completed successfully' };
  }
}
