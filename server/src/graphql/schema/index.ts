import { readFileSync } from "fs";
import { join } from "path";

export const typeDefs = [
  readFileSync(join("src/graphql/schema/user.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/post.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/purchase.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/archive.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/hub-chat.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/workspace.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/notification.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/report.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/support.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/admin.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/ai-usage.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/achievement.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/chat.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/plagiarism.graphql"), "utf8"),
  readFileSync(join("src/graphql/schema/documentRequest.graphql"), "utf8"),
];
