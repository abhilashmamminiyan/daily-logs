import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Task } from './task.schema';

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JIRA_HOST') return 'test-jira.atlassian.net';
              if (key === 'JIRA_EMAIL') return 'test@example.com';
              if (key === 'JIRA_API_TOKEN') return 'test-token';
              if (key === 'GITLAB_HOST') return 'git.kiebot.com';
              if (key === 'GITLAB_PROJECT_ID') return '12345';
              if (key === 'GITLAB_TOKEN') return 'gitlab-token';
              if (key === 'MY_WORK_EMAIL') return 'test@example.com';
              return null;
            }),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: {
            updateOne: jest.fn(),
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
