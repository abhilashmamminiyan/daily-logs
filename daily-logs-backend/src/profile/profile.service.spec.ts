import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService } from './profile.service';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Profile } from './profile.schema';

describe('ProfileService', () => {
  let service: ProfileService;

  const mockProfile = {
    workEmail: 'test@example.com',
    jiraHost: 'test.atlassian.net',
    jiraEmail: 'test@example.com',
    jiraApiToken: 'secret',
    jiraConnected: true,
    gitlabHost: 'git.kiebot.com',
    gitlabProjectId: '123',
    gitlabToken: 'glpat-token',
    gitlabConnected: true,
    toObject: jest.fn().mockReturnValue({
      workEmail: 'test@example.com',
      jiraHost: 'test.atlassian.net',
      jiraEmail: 'test@example.com',
      jiraApiToken: 'secret',
      jiraConnected: true,
      gitlabHost: 'git.kiebot.com',
      gitlabProjectId: '123',
      gitlabToken: 'glpat-token',
      gitlabConnected: true,
    }),
    save: jest.fn().mockResolvedValue(true),
  };

  const mockProfileModel = {
    findOne: jest.fn().mockResolvedValue(mockProfile),
    create: jest.fn().mockResolvedValue(mockProfile),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'GITLAB_CLIENT_ID') return 'test-client-id';
              return null;
            }),
          },
        },
        {
          provide: getModelToken(Profile.name),
          useValue: mockProfileModel,
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return profile with masked sensitive tokens for UI', async () => {
    const uiProfile = await service.getProfileForUi();
    expect(uiProfile.jiraApiToken).toBe('••••••••');
    expect(uiProfile.gitlabToken).toBe('••••••••');
    expect(uiProfile.hasJiraToken).toBe(true);
    expect(uiProfile.hasGitLabToken).toBe(true);
  });

  it('should disconnect Jira', async () => {
    const res = await service.disconnectJira();
    expect(mockProfile.jiraConnected).toBe(false);
    expect(mockProfile.jiraApiToken).toBe('');
    expect(res).toBeDefined();
  });

  it('should disconnect GitLab', async () => {
    const res = await service.disconnectGitLab();
    expect(mockProfile.gitlabConnected).toBe(false);
    expect(mockProfile.gitlabToken).toBe('');
    expect(res).toBeDefined();
  });
});
