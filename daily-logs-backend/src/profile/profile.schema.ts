import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Profile extends Document {
  @Prop({ default: '' })
  workEmail: string;

  // Jira Integration Fields
  @Prop({ default: '' })
  jiraHost: string;

  @Prop({ default: '' })
  jiraEmail: string;

  @Prop({ default: '' })
  jiraApiToken: string;

  @Prop({ default: '' })
  jiraOAuthToken: string;

  @Prop({ default: false })
  jiraConnected: boolean;

  // GitLab Integration Fields
  @Prop({ default: 'git.kiebot.com' })
  gitlabHost: string;

  @Prop({ default: '' })
  gitlabProjectId: string;

  @Prop({ default: '' })
  gitlabToken: string;

  @Prop({ default: '' })
  gitlabRefreshToken: string;

  @Prop({ default: '' })
  gitlabUsername: string;

  @Prop({ default: false })
  gitlabConnected: boolean;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
