import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Task } from './task.schema';
import { Profile } from '../profile/profile.schema';

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => null),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: {
            updateOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(Profile.name),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              jiraConnected: true,
              jiraHost: 'test.atlassian.net',
              jiraEmail: 'test@example.com',
              jiraApiToken: 'token',
              gitlabConnected: true,
              gitlabHost: 'git.kiebot.com',
              gitlabProjectId: '123',
              gitlabToken: 'token',
              workEmail: 'test@example.com',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
