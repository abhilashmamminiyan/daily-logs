import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task } from '../sync/task.schema';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private taskModel: Model<Task>) {}

  // Fetch all active tasks tracked in the system
  async getActiveTasks() {
    return this.taskModel.find().sort({ updatedAt: -1 }).exec();
  }

  // The Standup Auto-Generator Core Logic
  async generateDailyStandupReport() {
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now.setDate(now.getDate() - distanceToMonday));
    monday.setHours(0, 0, 0, 0);

    // Determine the boundary for "yesterday's" work (weekend-aware)
    const yesterdayStart = new Date();
    const day = yesterdayStart.getDay();
    if (day === 1) { // Monday
      yesterdayStart.setDate(yesterdayStart.getDate() - 3); // Friday
    } else if (day === 0) { // Sunday
      yesterdayStart.setDate(yesterdayStart.getDate() - 2); // Friday
    } else {
      yesterdayStart.setDate(yesterdayStart.getDate() - 1); // Yesterday
    }
    yesterdayStart.setHours(0, 0, 0, 0);

    // Find tasks that have your commits, merge requests, or were updated in Jira since Monday
    const recentTasks = await this.taskModel
      .find({
        $or: [
          { 'my_commits.date': { $gte: monday } },
          { 'my_merge_requests.date': { $gte: monday } },
          { updatedAt: { $gte: monday } },
        ],
      })
      .exec();

    const yesterdayLines: string[] = [];
    const todayLines: string[] = [];
    const blockerLines: string[] = [];

    recentTasks.forEach((task) => {
      // 1. Check if you committed code or worked on merge requests for this task since yesterdayStart
      const recentCommits = task.my_commits.filter(
        (c) => new Date(c.date) >= yesterdayStart,
      );
      const recentMRs = task.my_merge_requests?.filter(
        (mr) => new Date(mr.date) >= yesterdayStart,
      ) || [];

      if (recentCommits.length > 0 || recentMRs.length > 0) {
        const details: string[] = [];
        
        if (recentCommits.length > 0) {
          const commitDetails = recentCommits
            .map((c) => {
              const subject = c.message.split('\n')[0].trim();
              return `commit: "${subject}"`;
            })
            .join(', ');
          details.push(`Pushed ${commitDetails}`);
        }

        if (recentMRs.length > 0) {
          const mrDetails = recentMRs
            .map((mr) => `MR !${mr.iid} ("${mr.title}")`)
            .join(', ');
          details.push(`Worked on ${mrDetails}`);
        }

        yesterdayLines.push(`- **${task._id}**: ${details.join(' and ')}`);
      }

      // 2. Map current status to your today/progress items (exclude NO-JIRA pseudo-task)
      if (task._id !== 'NO-JIRA') {
        if (task.status === 'In Progress' || task.status === 'In Code Review') {
          todayLines.push(
            `- **${task._id}**: Continue development/review lifecycle (Current Status: ${task.status})`,
          );
        } else if (task.status === 'To Do') {
          todayLines.push(
            `- **${task._id}**: Pick up item from the backlog queue`,
          );
        }

        // 3. Automatically elevate attention/QA items to blockers
        if (task.requires_attention && task.latest_qa_comment) {
          blockerLines.push(
            `- **${task._id}**: QA Attention Required! ${task.latest_qa_comment.author} added: "${String(task.latest_qa_comment.body)}"`,
          );
        }
      }
    });

    // Fallbacks if your day was quiet
    if (yesterdayLines.length === 0) {
      yesterdayLines.push(
        '- Handled administrative tasks and ticket maintenance.',
      );
    }
    if (todayLines.length === 0) {
      todayLines.push(
        '- Reviewing current backlog and taking new assignments.',
      );
    }
    if (blockerLines.length === 0) {
      blockerLines.push('- No active blocking issues or missed QA items.');
    }

    // Build the copy-pasteable template text block
    return {
      formattedText: [
        `🌅 **Yesterday:**\n${yesterdayLines.join('\n')}`,
        `🚀 **Today:**\n${todayLines.join('\n')}`,
        `🚨 **Blockers / QA Flagged Items:**\n${blockerLines.join('\n')}`,
      ].join('\n\n'),
      rawTasks: recentTasks,
    };
  }
}
