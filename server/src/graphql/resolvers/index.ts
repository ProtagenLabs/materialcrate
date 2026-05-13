import { UserResolver } from "./user.resolver.js";
import { AdminResolver } from "./admin.resolver.js";
import { ArchiveResolver } from "./archive.resolver.js";
import { HubChatResolver } from "./hub-chat.resolver.js";
import { PostResolver } from "./post.resolver.js";
import { PurchaseResolver } from "./purchase.resolver.js";
import { WorkspaceResolver } from "./workspace.resolver.js";
import { NotificationResolver } from "./notification.resolver.js";
import { ReportResolver } from "./report.resolver.js";
import { SupportResolver } from "./support.resolver.js";
import { AiUsageResolver } from "./ai-usage.resolver.js";
import { AchievementResolver } from "./achievement.resolver.js";
import { ChatResolver } from "./chat.resolver.js";
import { PlagiarismResolver } from "./plagiarism.resolver.js";
import { DocumentRequestResolver } from "./documentRequest.resolver.js";

export const resolvers = {
  Query: {
    ...UserResolver.Query,
    ...ArchiveResolver.Query,
    ...HubChatResolver.Query,
    ...AiUsageResolver.Query,
    ...PostResolver.Query,
    ...PurchaseResolver.Query,
    ...WorkspaceResolver.Query,
    ...NotificationResolver.Query,
    ...ReportResolver.Query,
    ...AdminResolver.Query,
    ...AchievementResolver.Query,
    ...ChatResolver.Query,
    ...PlagiarismResolver.Query,
    ...DocumentRequestResolver.Query,
  },
  Mutation: {
    ...UserResolver.Mutation,
    ...ArchiveResolver.Mutation,
    ...HubChatResolver.Mutation,
    ...PostResolver.Mutation,
    ...PurchaseResolver.Mutation,
    ...WorkspaceResolver.Mutation,
    ...NotificationResolver.Mutation,
    ...ReportResolver.Mutation,
    ...SupportResolver.Mutation,
    ...AdminResolver.Mutation,
    ...AiUsageResolver.Mutation,
    ...ChatResolver.Mutation,
    ...PlagiarismResolver.Mutation,
    ...DocumentRequestResolver.Mutation,
  },
  Post: {
    ...PostResolver.Post,
  },
  Comment: {
    ...PostResolver.Comment,
  },
  PostVersion: {
    ...PostResolver.PostVersion,
  },
  User: {
    ...UserResolver.User,
    ...ArchiveResolver.User,
    ...WorkspaceResolver.User,
  },
  Archive: {
    ...ArchiveResolver.Archive,
  },
  ArchiveFolder: {
    ...ArchiveResolver.ArchiveFolder,
  },
  ArchiveSavedPost: {
    ...ArchiveResolver.ArchiveSavedPost,
  },
  HubChat: {
    ...HubChatResolver.HubChat,
  },
  Workspace: {
    ...WorkspaceResolver.Workspace,
  },
  WorkspaceFolder: {
    ...WorkspaceResolver.WorkspaceFolder,
  },
  WorkspaceSavedPost: {
    ...WorkspaceResolver.WorkspaceSavedPost,
  },
  DocumentRequest: {
    ...DocumentRequestResolver.DocumentRequest,
  },
  DocumentRequestFulfillment: {
    ...DocumentRequestResolver.DocumentRequestFulfillment,
  },
};
