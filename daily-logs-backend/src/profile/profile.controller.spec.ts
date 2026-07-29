import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
  let controller: ProfileController;

  const mockProfileService = {
    getProfileForUi: jest.fn().mockResolvedValue({
      jiraConnected: true,
      gitlabConnected: true,
    }),
    testJiraConnection: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
    saveJiraCredentials: jest.fn().mockResolvedValue({ jiraConnected: true }),
    disconnectJira: jest.fn().mockResolvedValue({ jiraConnected: false }),
    getGitLabAuthUrl: jest.fn().mockReturnValue('https://git.kiebot.com/oauth/authorize'),
    saveGitLabConnection: jest.fn().mockResolvedValue({ gitlabConnected: true }),
    disconnectGitLab: jest.fn().mockResolvedValue({ gitlabConnected: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: mockProfileService,
        },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get profile', async () => {
    const res = await controller.getProfile();
    expect(res).toEqual({ jiraConnected: true, gitlabConnected: true });
  });
});
