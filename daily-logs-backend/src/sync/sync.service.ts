import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Task } from './task.schema';
import { Profile } from '../profile/profile.schema';

interface JiraCommentAuthor {
  displayName: string;
  emailAddress: string;
}

interface JiraComment {
  author: JiraCommentAuthor;
  body: unknown;
  created: string;
}

interface JiraIssueFields {
  summary: string;
  status: {
    name: string;
  };
  comment?: {
    comments: JiraComment[];
  };
}

interface JiraIssue {
  key: string;
  fields: JiraIssueFields;
}

interface JiraSearchResponse {
  issues?: JiraIssue[];
}

interface GitLabCommit {
  short_id: string;
  message: string;
  created_at: string;
  author_email: string;
}

interface GitLabMergeRequest {
  iid: number;
  title: string;
  state: string;
  web_url: string;
  created_at: string;
  description?: string;
  source_branch: string;
  author: {
    username: string;
    name: string;
    public_email?: string;
  };
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  @Cron('*/30 * * * * *')
  async handleSyncCycle() {
    this.logger.log('--- Beginning DailyLogs Ingestion Cycle ---');
    await this.fetchJiraTickets();
    await this.fetchGitLabCommits();
    await this.fetchGitLabMergeRequests();
    this.logger.log('--- Ingestion Cycle Completed ---');
  }

  private async fetchJiraTickets() {
    const profile = await this.profileModel.findOne();
    if (!profile || !profile.jiraConnected || !profile.jiraHost || (!profile.jiraApiToken && !profile.jiraOAuthToken)) {
      this.logger.log('Jira sync skipped: Credentials not configured in user profile.');
      return;
    }

    const host = profile.jiraHost;
    const email = profile.jiraEmail;
    const token = profile.jiraApiToken || profile.jiraOAuthToken;
    const authHeader = Buffer.from(`${email}:${token}`).toString('base64');

    // Calculate Monday of this week at midnight
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1; // Handle Sunday edge case
    const monday = new Date(now.setDate(now.getDate() - distanceToMonday));
    monday.setHours(0, 0, 0, 0);
    const mondayString = monday.toISOString().split('T')[0]; // Yields "2026-06-22"

    // Target tickets assigned to you updated since Monday
    const jql = `assignee = currentUser() AND updated >= "${mondayString}"`;
    const url = `https://${host}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,comment`;

    try {
      const response = await axios.get<JiraSearchResponse>(url, {
        headers: {
          Authorization: `Basic ${authHeader}`,
          Accept: 'application/json',
        },
      });

      const issues = response.data.issues || [];
      const syncedIssueKeys = issues.map((issue) => issue.key);

      for (const issue of issues) {
        const comments = issue.fields.comment?.comments || [];
        const externalComments = comments.filter(
          (c) => c.author.emailAddress !== email,
        );

        let latestQa: { author: string; body: string; date: Date } | null =
          null;
        let requiresAttention = false;

        if (externalComments.length > 0) {
          const lastComment = externalComments[externalComments.length - 1];
          latestQa = {
            author: lastComment.author.displayName,
            body: this.extractTextFromAdf(lastComment.body),
            date: new Date(lastComment.created),
          };
          requiresAttention = true;
        }

        // Upsert the core ticket details into Mongo
        await this.taskModel.updateOne(
          { _id: issue.key },
          {
            $set: {
              title: issue.fields.summary,
              status: issue.fields.status.name,
              latest_qa_comment: latestQa,
              requires_attention: requiresAttention,
            },
          },
          { upsert: true },
        );
        this.logger.log(`Synced Jira Ticket: ${issue.key}`);
      }

      // Clean up old tickets that are no longer assigned and have no recent commits/MRs since Monday
      const deleteResult = await this.taskModel.deleteMany({
        _id: { $nin: [...syncedIssueKeys, 'NO-JIRA'] },
        'my_commits.date': { $not: { $gte: monday } },
        'my_merge_requests.date': { $not: { $gte: monday } },
      });
      if (deleteResult.deletedCount > 0) {
        this.logger.log(`Cleaned up ${deleteResult.deletedCount} unassigned and inactive tickets from database.`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Jira Sync Failed: ${errorMsg}`);
    }
  }

  private async fetchGitLabCommits() {
    const profile = await this.profileModel.findOne();
    if (!profile || !profile.gitlabConnected || !profile.gitlabProjectId || !profile.gitlabToken) {
      this.logger.log('GitLab sync skipped: Credentials/profile not configured in user profile.');
      return;
    }

    const projectId = profile.gitlabProjectId;
    const token = profile.gitlabToken;
    const authorEmail = profile.workEmail || '';
    const host = profile.gitlabHost || 'git.kiebot.com';

    // Calculate Monday of this week at midnight
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now.setDate(now.getDate() - distanceToMonday));
    monday.setHours(0, 0, 0, 0); // Reset to exact beginning of the day

    const url = `https://${host}/api/v4/projects/${projectId}/repository/commits?since=${monday.toISOString()}&all=true`;
    const headers = token.startsWith('glpat-')
      ? { 'PRIVATE-TOKEN': token }
      : { Authorization: `Bearer ${token}` };

    try {
      const response = await axios.get<GitLabCommit[]>(url, { headers });
      const myCommits = authorEmail
        ? response.data.filter((c) => c.author_email?.toLowerCase() === authorEmail.toLowerCase())
        : response.data;

      for (const commit of myCommits) {
        const message = commit.message.trim();
        // Regex to automatically extract ticket numbers like KW-123 (case-insensitive)
        const match = message.match(/[A-Z]+-\d+/i);
        const ticketId = match ? match[0].toUpperCase() : 'NO-JIRA';

        // Cleanly append the commit into the ticket array, ignoring it if it already exists (to prevent duplicates)
        await this.taskModel.updateOne(
          { _id: ticketId },
          {
            $setOnInsert: {
              title: ticketId === 'NO-JIRA' ? 'Non-Jira Contributions' : 'Unknown Ticket (Git Discovered)',
              status: 'Active',
            },
            $addToSet: {
              my_commits: {
                sha: commit.short_id,
                message: message,
                date: new Date(commit.created_at),
              },
            },
          },
          { upsert: true },
        );
        this.logger.log(
          `Mapped Commit [${commit.short_id}] onto Ticket ${ticketId}`,
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`GitLab Sync Failed: ${errorMsg}`);
    }
  }

  private extractTextFromAdf(adf: unknown): string {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;
    let text = '';
    if (typeof adf === 'object' && adf !== null) {
      const adfObj = adf as Record<string, any>;
      if (typeof adfObj.text === 'string') {
        text += adfObj.text;
      }
      if (Array.isArray(adfObj.content)) {
        text += adfObj.content.map((c) => this.extractTextFromAdf(c)).join(' ');
      }
    }
    return text.trim();
  }

  private async fetchGitLabMergeRequests() {
    const profile = await this.profileModel.findOne();
    if (!profile || !profile.gitlabConnected || !profile.gitlabProjectId || !profile.gitlabToken) {
      return;
    }

    const host = profile.gitlabHost || 'git.kiebot.com';
    const projectId = profile.gitlabProjectId;
    const token = profile.gitlabToken;
    const authorEmail = profile.workEmail || '';
    const gitlabUsername = profile.gitlabUsername || '';

    // Calculate Monday of this week at midnight
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now.setDate(now.getDate() - distanceToMonday));
    monday.setHours(0, 0, 0, 0);

    const url = `https://${host}/api/v4/projects/${projectId}/merge_requests?created_after=${monday.toISOString()}`;
    const headers = token.startsWith('glpat-')
      ? { 'PRIVATE-TOKEN': token }
      : { Authorization: `Bearer ${token}` };

    try {
      const response = await axios.get<GitLabMergeRequest[]>(url, { headers });

      const emailPrefix = authorEmail ? authorEmail.split('@')[0].toLowerCase() : '';
      const myMergeRequests = response.data.filter((mr) => {
        const username = mr.author?.username?.toLowerCase() || '';
        const name = mr.author?.name?.toLowerCase() || '';
        const publicEmail = mr.author?.public_email?.toLowerCase() || '';
        return (
          (gitlabUsername && username === gitlabUsername.toLowerCase()) ||
          (emailPrefix && (username.includes(emailPrefix) || name.includes(emailPrefix))) ||
          (authorEmail && publicEmail === authorEmail.toLowerCase())
        );
      });

      this.logger.log(
        `Found ${myMergeRequests.length} merge requests authored by you since Monday.`,
      );

      for (const mr of myMergeRequests) {
        const contentToSearch = `${mr.title} ${mr.description || ''} ${mr.source_branch}`;
        // Regex to automatically extract ticket numbers like KW-123 (case-insensitive)
        const match = contentToSearch.match(/[A-Z]+-\d+/i);
        const ticketId = match ? match[0].toUpperCase() : 'NO-JIRA';

        await this.taskModel.updateOne(
          { _id: ticketId },
          {
            $setOnInsert: {
              title: ticketId === 'NO-JIRA' ? 'Non-Jira Contributions' : 'Unknown Ticket (Git Discovered)',
              status: 'Active',
            },
            $addToSet: {
              my_merge_requests: {
                iid: mr.iid,
                title: mr.title,
                state: mr.state,
                web_url: mr.web_url,
                date: new Date(mr.created_at),
              },
            },
          },
          { upsert: true },
        );
        this.logger.log(
          `Mapped Merge Request [!${mr.iid}] onto Ticket ${ticketId}`,
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`GitLab Merge Request Sync Failed: ${errorMsg}`);
    }
  }
}
