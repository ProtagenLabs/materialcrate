import { prisma } from "../config/prisma.js";
import { createNotification, NOTIFICATION_TYPE, NOTIFICATION_ICON } from "../services/notifications.js";
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_MAP,
  RARITY_TOKEN_REWARD,
  type AchievementTrigger,
} from "./definitions.js";

/**
 * Check which achievements are newly unlockable for a user given a trigger,
 * persist them, and send a notification for each one.
 * Safe to call fire-and-forget — errors are caught internally.
 */
export async function checkAchievements(
  userId: string,
  trigger: AchievementTrigger,
): Promise<void> {
  try {
    const candidates = ACHIEVEMENT_DEFINITIONS.filter((a) =>
      a.triggers.includes(trigger),
    );
    if (candidates.length === 0) return;

    // Fetch already-unlocked achievement IDs for this user
    const existing = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    });
    const unlockedIds = new Set(existing.map((e) => e.achievementId));

    // Fetch user stats needed for condition checks (single query)
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        displayName: true,
        institution: true,
        program: true,
        profilePicture: true,
        createdAt: true,
        posts: {
          where: { deleted: false },
          select: { categories: true, likes: { select: { userId: true } } },
        },
        likes: { select: { postId: true } },
        comments: { select: { id: true } },
        followerRelations: { select: { followerId: true } },
        followingRelations: { select: { followingId: true } },
        archive: {
          select: { savedPosts: { select: { id: true } } },
        },
        hubChats: { select: { id: true } },
        feedInteractions: {
          where: { interactionType: "SHARE" },
          select: { id: true },
        },
      },
    });

    if (!user) return;

    const postCount = user.posts.length;
    const likeGivenCount = user.likes.length;
    const commentCount = user.comments.length;
    const followerCount = user.followerRelations.length;
    const followingCount = user.followingRelations.length;
    const savedCount = user.archive?.savedPosts?.length ?? 0;
    const hubChatCount = user.hubChats.length;
    const shareCount = user.feedInteractions.length;

    const maxLikesOnSinglePost = user.posts.reduce(
      (max: number, p: { likes: unknown[] }) => Math.max(max, p.likes.length),
      0,
    );

    const distinctCategories = new Set(
      user.posts.flatMap((p: { categories: string[] }) => p.categories),
    ).size;

    const hasLongView = trigger === "document_viewed_long"; // already checked by caller

    // Check if user is among first 500
    const earlyAdopterThreshold = 500;
    let isEarlyAdopter = false;
    if (!unlockedIds.has("early-adopter")) {
      const rank = await (prisma as any).user.count({
        where: { createdAt: { lte: user.createdAt }, deleted: false },
      });
      isEarlyAdopter = rank <= earlyAdopterThreshold;
    }

    const conditionMet: Record<string, boolean> = {
      welcome: true,
      "early-adopter": isEarlyAdopter,
      "verified-scholar": Boolean(user.emailVerified),
      "profile-complete": Boolean(
        user.displayName && user.institution && user.program && user.profilePicture,
      ),
      "first-post": postCount >= 1,
      "prolific-writer": postCount >= 10,
      "content-creator": postCount >= 25,
      "publishing-legend": postCount >= 50,
      "topic-diversity": distinctCategories >= 5,
      "first-like-given": likeGivenCount >= 1,
      "like-enthusiast": likeGivenCount >= 25,
      "first-comment": commentCount >= 1,
      "conversation-starter": commentCount >= 10,
      "engaged-member": commentCount >= 50,
      "first-follow": followingCount >= 1,
      "social-butterfly": followingCount >= 10,
      networker: followingCount >= 25,
      "well-connected": followerCount >= 10,
      "rising-star": followerCount >= 50,
      influencer: followerCount >= 100,
      "first-save": savedCount >= 1,
      "pdf-curator": savedCount >= 10,
      "library-builder": savedCount >= 25,
      "ai-explorer": hubChatCount >= 1,
      "research-assistant": hubChatCount >= 10,
      "study-buddy": hubChatCount >= 25,
      "popular-post": maxLikesOnSinglePost >= 10,
      "viral-post": maxLikesOnSinglePost >= 50,
      "community-darling": maxLikesOnSinglePost >= 100,
      "deep-reader": hasLongView,
      "share-master": shareCount >= 5,
    };

    const toUnlock = candidates.filter(
      (a) => !unlockedIds.has(a.id) && conditionMet[a.id],
    );

    if (toUnlock.length === 0) return;

    // Persist, grant the rarity-based token reward, and notify each new achievement.
    await Promise.all(
      toUnlock.map(async (achievement) => {
        const reward = RARITY_TOKEN_REWARD[achievement.rarity] ?? 0;

        try {
          // Creating the UserAchievement row first acts as the idempotency
          // guard — its unique (userId, achievementId) constraint prevents the
          // token reward from being granted twice for the same achievement.
          await prisma.$transaction([
            prisma.userAchievement.create({
              data: { userId, achievementId: achievement.id },
            }),
            ...(reward > 0
              ? [
                  prisma.user.update({
                    where: { id: userId },
                    data: {
                      tokenBalance: { increment: reward },
                      tokensEarned: { increment: reward },
                    },
                  }),
                  prisma.tokenTransaction.create({
                    data: {
                      userId,
                      type: "ACHIEVEMENT_REWARD",
                      amount: reward,
                      description: `Achievement unlocked: "${achievement.title}"`,
                    },
                  }),
                ]
              : []),
          ]);

          await createNotification({
            userId,
            type: NOTIFICATION_TYPE.ACHIEVEMENT_UNLOCKED,
            title: achievement.title,
            description:
              reward > 0
                ? `You've unlocked "${achievement.title}" and earned ${reward} tokens!`
                : `You've unlocked a new achievement: ${achievement.title}`,
            icon: NOTIFICATION_ICON.ACHIEVEMENT,
            achievementId: achievement.id,
          });
        } catch (err: unknown) {
          // Unique constraint = already unlocked concurrently, safe to ignore
          if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code: string }).code === "P2002"
          ) {
            return;
          }
          console.error(`Failed to unlock achievement ${achievement.id}:`, err);
        }
      }),
    );
  } catch (err) {
    console.error("checkAchievements error:", err);
  }
}
