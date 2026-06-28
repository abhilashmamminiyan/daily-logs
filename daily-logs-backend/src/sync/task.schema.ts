import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class CommitInfo {
  @Prop({ required: true })
  sha: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  date: Date;
}

@Schema({ _id: false })
export class MergeRequestInfo {
  @Prop({ required: true })
  iid: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  web_url: string;

  @Prop({ required: true })
  date: Date;
}

@Schema({ timestamps: true })
export class Task extends Document<string> {
  @Prop({ required: true })
  declare _id: string; // The Jira Ticket ID (e.g., "KW-123")

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: [CommitInfo], default: [] })
  my_commits: CommitInfo[];

  @Prop({ type: [MergeRequestInfo], default: [] })
  my_merge_requests: MergeRequestInfo[];

  @Prop({ type: Object, default: null })
  latest_qa_comment: {
    author: string;
    body: string;
    date: Date;
  };

  @Prop({ default: false })
  requires_attention: boolean;
}

export const TaskSchema: MongooseSchema = SchemaFactory.createForClass(Task);
