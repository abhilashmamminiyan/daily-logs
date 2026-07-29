import { Controller, Get, Post, Body, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ProfileService, SaveJiraDto } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile() {
    return this.profileService.getProfileForUi();
  }

  @Post('jira/test')
  @HttpCode(HttpStatus.OK)
  async testJira(@Body() dto: SaveJiraDto) {
    return this.profileService.testJiraConnection(dto);
  }

  @Post('jira')
  async saveJira(@Body() dto: SaveJiraDto) {
    return this.profileService.saveJiraCredentials(dto);
  }

  @Post('jira/disconnect')
  async disconnectJira() {
    return this.profileService.disconnectJira();
  }

  @Get('gitlab/auth-url')
  getGitLabAuthUrl(
    @Query('host') host?: string,
    @Query('projectId') projectId?: string,
  ) {
    const url = this.profileService.getGitLabAuthUrl(host, projectId);
    return { url };
  }

  @Get('gitlab/callback')
  async gitLabCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (code) {
      await this.profileService.handleGitLabCallback(code, state);
    }
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3080';
    return res.redirect(`${frontendUrl}?gitlab_connected=true`);
  }

  @Post('gitlab/save')
  async saveGitLab(@Body() dto: { gitlabHost?: string; gitlabProjectId?: string; token?: string }) {
    return this.profileService.saveGitLabConnection(dto);
  }

  @Post('gitlab/disconnect')
  async disconnectGitLab() {
    return this.profileService.disconnectGitLab();
  }
}
