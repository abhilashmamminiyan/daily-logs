import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Profile } from './profile.schema';

export class SaveJiraDto {
  jiraHost: string;
  jiraEmail: string;
  jiraApiToken: string;
}

export interface GitLabConnectDto {
  gitlabHost?: string;
  gitlabProjectId?: string;
  token?: string;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    private configService: ConfigService,
  ) {}

  /**
   * Retrieves or initializes the single user Profile record.
   */
  async getOrCreateProfile(): Promise<Profile> {
    let profile = await this.profileModel.findOne();
    if (!profile) {
      profile = await this.profileModel.create({
        workEmail: '',
        jiraHost: '',
        jiraEmail: '',
        jiraApiToken: '',
        jiraConnected: false,
        gitlabHost: 'git.kiebot.com',
        gitlabProjectId: '',
        gitlabToken: '',
        gitlabUsername: '',
        gitlabConnected: false,
      });
    }
    return profile;
  }

  /**
   * Safe getter for UI (masks sensitive tokens)
   */
  async getProfileForUi() {
    const profile = await this.getOrCreateProfile();
    const obj = profile.toObject();
    return {
      ...obj,
      jiraApiToken: obj.jiraApiToken ? '••••••••' : '',
      jiraOAuthToken: obj.jiraOAuthToken ? '••••••••' : '',
      gitlabToken: obj.gitlabToken ? '••••••••' : '',
      hasJiraToken: Boolean(obj.jiraApiToken || obj.jiraOAuthToken),
      hasGitLabToken: Boolean(obj.gitlabToken),
    };
  }

  /**
   * Tests Jira credentials against Atlassian REST API
   */
  async testJiraConnection(dto: SaveJiraDto): Promise<{ success: boolean; message: string; displayName?: string }> {
    const { jiraHost, jiraEmail, jiraApiToken } = dto;
    if (!jiraHost || !jiraEmail || !jiraApiToken) {
      throw new BadRequestException('Jira Host, Email, and API Token are required.');
    }

    const hostClean = jiraHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const authHeader = Buffer.from(`${jiraEmail.trim()}:${jiraApiToken.trim()}`).toString('base64');
    const url = `https://${hostClean}/rest/api/3/myself`;

    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Basic ${authHeader}`,
          Accept: 'application/json',
        },
        timeout: 10000,
      });
      return {
        success: true,
        message: `Successfully authenticated as ${res.data.displayName || res.data.emailAddress}`,
        displayName: res.data.displayName,
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.errorMessages?.[0] || err.message || 'Failed to authenticate with Jira';
      this.logger.error(`Jira test connection failed: ${errorMsg}`);
      return {
        success: false,
        message: errorMsg,
      };
    }
  }

  /**
   * Connects & saves Jira credentials in MongoDB
   */
  async saveJiraCredentials(dto: SaveJiraDto) {
    const testResult = await this.testJiraConnection(dto);
    if (!testResult.success) {
      throw new BadRequestException(`Jira connection test failed: ${testResult.message}`);
    }

    const profile = await this.getOrCreateProfile();
    const hostClean = dto.jiraHost.replace(/^https?:\/\//, '').replace(/\/$/, '');

    profile.jiraHost = hostClean;
    profile.jiraEmail = dto.jiraEmail.trim();
    profile.jiraApiToken = dto.jiraApiToken.trim();
    profile.jiraConnected = true;

    await profile.save();
    this.logger.log(`Jira credentials saved successfully for ${profile.jiraEmail}`);
    return this.getProfileForUi();
  }

  /**
   * Disconnects Jira integration
   */
  async disconnectJira() {
    const profile = await this.getOrCreateProfile();
    profile.jiraHost = '';
    profile.jiraEmail = '';
    profile.jiraApiToken = '';
    profile.jiraOAuthToken = '';
    profile.jiraConnected = false;
    await profile.save();
    return this.getProfileForUi();
  }

  /**
   * Generates GitLab OAuth Authorization URL
   */
  getGitLabAuthUrl(gitlabHost?: string, projectId?: string): string {
    const host = (gitlabHost || 'git.kiebot.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const clientId = this.configService.get<string>('GITLAB_CLIENT_ID') || 'devpulse-client-id';
    const redirectUri = encodeURIComponent(`${process.env.BACKEND_URL || 'http://localhost:5080'}/profile/gitlab/callback`);
    const stateObj = JSON.stringify({ host, projectId: projectId || '' });
    const state = encodeURIComponent(Buffer.from(stateObj).toString('base64'));

    return `https://${host}/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&state=${state}&scope=read_user+api+read_repository`;
  }

  /**
   * Handles GitLab OAuth Callback
   */
  async handleGitLabCallback(code: string, stateEncoded: string): Promise<Profile> {
    let host = 'git.kiebot.com';
    let projectId = '';

    if (stateEncoded) {
      try {
        const decoded = Buffer.from(decodeURIComponent(stateEncoded), 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        if (parsed.host) host = parsed.host;
        if (parsed.projectId) projectId = parsed.projectId;
      } catch (e) {
        this.logger.warn('Could not parse state from GitLab OAuth callback');
      }
    }

    const hostClean = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const clientId = this.configService.get<string>('GITLAB_CLIENT_ID') || 'devpulse-client-id';
    const clientSecret = this.configService.get<string>('GITLAB_SECRET') || '';
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:5080'}/profile/gitlab/callback`;

    let token = code;
    let username = '';
    let email = '';

    try {
      // Exchange code for access token if clientSecret exists, or use code directly if personal token test mode
      if (clientSecret) {
        const tokenRes = await axios.post(`https://${hostClean}/oauth/token`, {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        });
        token = tokenRes.data.access_token;
      }

      // Fetch User details from GitLab
      const userRes = await axios.get(`https://${hostClean}/api/v4/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      username = userRes.data.username || userRes.data.name || '';
      email = userRes.data.email || userRes.data.public_email || '';
    } catch (err: any) {
      this.logger.error(`GitLab OAuth exchange failed: ${err.message}`);
    }

    const profile = await this.getOrCreateProfile();
    profile.gitlabHost = hostClean;
    if (projectId) profile.gitlabProjectId = projectId;
    profile.gitlabToken = token;
    profile.gitlabUsername = username || profile.gitlabUsername || 'GitLab User';
    if (email) profile.workEmail = email;
    profile.gitlabConnected = true;

    await profile.save();
    return profile;
  }

  /**
   * Direct GitLab Connect / Token Save (Supports Token or Social Connect Direct Connect)
   */
  async saveGitLabConnection(dto: { gitlabHost?: string; gitlabProjectId?: string; token?: string }) {
    const profile = await this.getOrCreateProfile();
    const hostClean = (dto.gitlabHost || profile.gitlabHost || 'git.kiebot.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const tokenToUse = dto.token || profile.gitlabToken;

    if (dto.gitlabProjectId) {
      profile.gitlabProjectId = dto.gitlabProjectId.trim();
    }
    profile.gitlabHost = hostClean;

    if (tokenToUse) {
      try {
        // Verify token with GitLab API
        const userRes = await axios.get(`https://${hostClean}/api/v4/user`, {
          headers: { 'PRIVATE-TOKEN': tokenToUse },
          timeout: 10000,
        });
        profile.gitlabToken = tokenToUse.trim();
        profile.gitlabUsername = userRes.data.username || userRes.data.name || 'GitLab User';
        if (userRes.data.email || userRes.data.public_email) {
          profile.workEmail = userRes.data.email || userRes.data.public_email;
        }
        profile.gitlabConnected = true;
      } catch (e: any) {
        // Fallback check with Bearer token header if OAuth token format
        try {
          const userRes = await axios.get(`https://${hostClean}/api/v4/user`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
            timeout: 10000,
          });
          profile.gitlabToken = tokenToUse.trim();
          profile.gitlabUsername = userRes.data.username || userRes.data.name || 'GitLab User';
          profile.gitlabConnected = true;
        } catch (err2: any) {
          this.logger.warn(`GitLab token validation failed: ${e.message}`);
          if (dto.token) {
            throw new BadRequestException('Failed to validate GitLab connection token with GitLab instance.');
          }
        }
      }
    } else {
      // Mark connected if host & project ID are set
      profile.gitlabConnected = Boolean(profile.gitlabHost && profile.gitlabProjectId);
    }

    await profile.save();
    return this.getProfileForUi();
  }

  /**
   * Disconnects GitLab integration
   */
  async disconnectGitLab() {
    const profile = await this.getOrCreateProfile();
    profile.gitlabToken = '';
    profile.gitlabRefreshToken = '';
    profile.gitlabUsername = '';
    profile.gitlabConnected = false;
    await profile.save();
    return this.getProfileForUi();
  }
}
