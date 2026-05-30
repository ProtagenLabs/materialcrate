export type AchievementRarity = "common" | "uncommon" | "rare" | "legendary";

export type AchievementTrigger =
  | "signup"
  | "email_verified"
  | "profile_updated"
  | "post_created"
  | "like_given"
  | "comment_given"
  | "follow_given"
  | "post_saved"
  | "ai_used"
  | "post_liked_received"
  | "follower_gained"
  | "document_viewed_long"
  | "post_shared";

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  triggers: AchievementTrigger[];
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // ── Common ────────────────────────────────────────────────────────────────
  {
    id: "welcome",
    title: "Welcome Aboard",
    description: "Created your Material Crate account.",
    icon: "🎉",
    rarity: "common",
    triggers: ["signup"],
  },
  {
    id: "verified-scholar",
    title: "Verified Scholar",
    description: "Verified your email address.",
    icon: "✅",
    rarity: "common",
    triggers: ["email_verified"],
  },
  {
    id: "profile-complete",
    title: "Full Picture",
    description:
      "Completed your profile with a display name, institution, program, and profile picture.",
    icon: "👤",
    rarity: "common",
    triggers: ["profile_updated"],
  },
  {
    id: "first-post",
    title: "First Upload",
    description: "Published your very first post.",
    icon: "📄",
    rarity: "common",
    triggers: ["post_created"],
  },
  {
    id: "first-like-given",
    title: "Generous Reader",
    description: "Liked your first post.",
    icon: "❤️",
    rarity: "common",
    triggers: ["like_given"],
  },
  {
    id: "first-comment",
    title: "First Words",
    description: "Left your very first comment.",
    icon: "💬",
    rarity: "common",
    triggers: ["comment_given"],
  },
  {
    id: "first-follow",
    title: "Making Connections",
    description: "Followed your first user.",
    icon: "🤝",
    rarity: "common",
    triggers: ["follow_given"],
  },
  {
    id: "first-save",
    title: "Bookmarked",
    description: "Saved your first post.",
    icon: "🔖",
    rarity: "common",
    triggers: ["post_saved"],
  },
  {
    id: "ai-explorer",
    title: "AI Explorer",
    description: "Started your first AI conversation in Hub.",
    icon: "✨",
    rarity: "common",
    triggers: ["ai_used"],
  },
  {
    id: "early-adopter",
    title: "Early Adopter",
    description: "Joined among the first 500 users on Material Crate.",
    icon: "🚀",
    rarity: "legendary",
    triggers: ["signup"],
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: "prolific-writer",
    title: "Prolific Writer",
    description: "Published 10 posts.",
    icon: "✍️",
    rarity: "uncommon",
    triggers: ["post_created"],
  },
  {
    id: "like-enthusiast",
    title: "Like Enthusiast",
    description: "Liked 25 posts.",
    icon: "👍",
    rarity: "uncommon",
    triggers: ["like_given"],
  },
  {
    id: "conversation-starter",
    title: "Conversation Starter",
    description: "Left 10 comments.",
    icon: "🗣️",
    rarity: "uncommon",
    triggers: ["comment_given"],
  },
  {
    id: "social-butterfly",
    title: "Social Butterfly",
    description: "Followed 10 users.",
    icon: "🦋",
    rarity: "uncommon",
    triggers: ["follow_given"],
  },
  {
    id: "well-connected",
    title: "Well Connected",
    description: "Gained 10 followers.",
    icon: "🌐",
    rarity: "uncommon",
    triggers: ["follower_gained"],
  },
  {
    id: "pdf-curator",
    title: "PDF Curator",
    description: "Saved 10 posts.",
    icon: "📚",
    rarity: "uncommon",
    triggers: ["post_saved"],
  },
  {
    id: "research-assistant",
    title: "Research Assistant",
    description: "Had 10 AI conversations in Hub.",
    icon: "🧪",
    rarity: "uncommon",
    triggers: ["ai_used"],
  },
  {
    id: "topic-diversity",
    title: "Renaissance Learner",
    description: "Posted content across 5 different categories.",
    icon: "🌍",
    rarity: "uncommon",
    triggers: ["post_created"],
  },
  {
    id: "popular-post",
    title: "Popular Post",
    description: "Received 10 likes on a single post.",
    icon: "🔥",
    rarity: "uncommon",
    triggers: ["post_liked_received"],
  },
  {
    id: "deep-reader",
    title: "Deep Reader",
    description: "Spent substantial time studying a document.",
    icon: "📖",
    rarity: "uncommon",
    triggers: ["document_viewed_long"],
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: "content-creator",
    title: "Content Creator",
    description: "Published 25 posts.",
    icon: "🖊️",
    rarity: "rare",
    triggers: ["post_created"],
  },
  {
    id: "engaged-member",
    title: "Engaged Member",
    description: "Left 50 comments.",
    icon: "💡",
    rarity: "rare",
    triggers: ["comment_given"],
  },
  {
    id: "networker",
    title: "Networker",
    description: "Followed 25 users.",
    icon: "📡",
    rarity: "rare",
    triggers: ["follow_given"],
  },
  {
    id: "rising-star",
    title: "Rising Star",
    description: "Gained 50 followers.",
    icon: "⭐",
    rarity: "rare",
    triggers: ["follower_gained"],
  },
  {
    id: "library-builder",
    title: "Library Builder",
    description: "Saved 25 posts.",
    icon: "🏛️",
    rarity: "rare",
    triggers: ["post_saved"],
  },
  {
    id: "study-buddy",
    title: "Study Buddy",
    description: "Had 25 AI conversations in Hub.",
    icon: "🤖",
    rarity: "rare",
    triggers: ["ai_used"],
  },
  {
    id: "viral-post",
    title: "Viral Post",
    description: "Received 50 likes on a single post.",
    icon: "📈",
    rarity: "rare",
    triggers: ["post_liked_received"],
  },
  {
    id: "share-master",
    title: "Share Master",
    description: "Shared 5 posts with others.",
    icon: "🔗",
    rarity: "rare",
    triggers: ["post_shared"],
  },

  // ── Legendary ─────────────────────────────────────────────────────────────
  {
    id: "publishing-legend",
    title: "Publishing Legend",
    description: "Published 50 posts.",
    icon: "🏆",
    rarity: "legendary",
    triggers: ["post_created"],
  },
  {
    id: "influencer",
    title: "Influencer",
    description: "Gained 100 followers.",
    icon: "👑",
    rarity: "legendary",
    triggers: ["follower_gained"],
  },
  {
    id: "community-darling",
    title: "Community Darling",
    description: "Received 100 likes on a single post.",
    icon: "💎",
    rarity: "legendary",
    triggers: ["post_liked_received"],
  },
];

export const ACHIEVEMENT_MAP = new Map(
  ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a]),
);

export const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

// Token reward granted when an achievement is unlocked, by rarity tier.
export const RARITY_TOKEN_REWARD: Record<AchievementRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  legendary: 100,
};
