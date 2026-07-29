import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncService } from './sync.service';
import { Task, TaskSchema } from './task.schema';
import { Profile, ProfileSchema } from '../profile/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
