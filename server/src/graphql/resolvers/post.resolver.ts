import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../../config/prisma.js";
import { s3 } from "../../config/s3.js";
import {
  createNotification,
  NOTIFICATION_ICON,
  NOTIFICATION_TYPE,
} from "../../services/notifications.js";
import { emitPostActivity } from "../../realtime/postActivity.js";
import { checkAchievements } from "../../achievements/service.js";
import { hardDeletePost } from "../../services/postDeletion.js";
import {
  checkUploadForPlagiarism,
  indexPostContent,
  removePostIndex,
} from "../../services/plagiarism/plagiarism-service.js";
import { createPlagiarismCase } from "../../services/plagiarism-case.service.js";
import { normalizePricingInput } from "./purchase.resolver.js";

type CreatePostArgs = {
  fileBase64: string;
  thumbnailBase64?: string;
  fileName: string;
  mimeType: string;
  title: string;
  categories: string[];
  description?: string;
  year?: number;
  isFree?: boolean;
  price?: number;
};

type UpdatePostArgs = {
  postId: string;
  title: string;
  categories: string[];
  description?: string;
  year?: number;
  isFree?: boolean;
  price?: number;
};

type PinPostArgs = {
  postId: string;
};

type TogglePostCommentsArgs = {
  postId: string;
};

type TrackFeedInteractionArgs = {
  postId?: string | null;
  interactionType: string;
  signalKind?: string | null;
  category?: string | null;
  searchTerm?: string | null;
  durationMs?: number | null;
  metadata?: string | Record<string, unknown> | null;
};

type GraphQLContext = {
  user?: {
    sub?: string;
  };
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");

const normalizeCategories = (categories: unknown): string[] => {
  if (!Array.isArray(categories)) {
    return [];
  }

  const normalized = categories
    .map((category) => (typeof category === "string" ? category.trim() : ""))
    .filter(Boolean)
    .map((category) => category.toLowerCase());

  return Array.from(new Set(normalized));
};

const buildPrivateS3Url = (key: string) =>
  `https://${process.env.AWS_S3_PRIVATE_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
const buildCloudFrontUrl = (key: string) =>
  `${(process.env.CLOUDFRONT_URL ?? "").replace(/\/$/, "")}/${key}`;
const POST_FILE_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_POST_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const FEED_INTERACTION_SIGNAL_WEIGHTS: Record<
  string,
  { authorWeight: number; categoryWeight: number; keywordWeight: number }
> = {
  SEARCH: { authorWeight: 0, categoryWeight: 5, keywordWeight: 10 },
  OPEN_PREVIEW: { authorWeight: 2, categoryWeight: 3, keywordWeight: 0 },
  LONG_VIEW: { authorWeight: 6, categoryWeight: 9, keywordWeight: 0 },
  SCROLL_PAST: { authorWeight: 0, categoryWeight: 0, keywordWeight: 0 },
  DOWNLOAD: { authorWeight: 8, categoryWeight: 12, keywordWeight: 0 },
  SHARE: { authorWeight: 6, categoryWeight: 8, keywordWeight: 4 },
  LIKE: { authorWeight: 4, categoryWeight: 6, keywordWeight: 0 },
  COMMENT: { authorWeight: 4, categoryWeight: 6, keywordWeight: 0 },
  COMMENT_REPLY: { authorWeight: 3, categoryWeight: 5, keywordWeight: 0 },
  TAG_CLICK: { authorWeight: 0, categoryWeight: 9, keywordWeight: 8 },
  NOT_INTERESTED: { authorWeight: 10, categoryWeight: 14, keywordWeight: 6 },
  DISMISS: { authorWeight: 7, categoryWeight: 10, keywordWeight: 4 },
};

// Penalty applied to a specific post's score when the viewer has previously seen it.
// "Opened" interactions (LONG_VIEW, OPEN_PREVIEW) cap at 150 so they can overcome
// the followBoost of 90 — ensuring a viewed post from a followed author still drops.
// SCROLL_PAST is a softer signal capped at 35.
const SEEN_POST_PENALTIES: Record<string, number> = {
  LONG_VIEW: 95,
  OPEN_PREVIEW: 55,
  SCROLL_PAST: 15,
};
const SEEN_OPENED_CAP = 150;
const SEEN_SCROLL_CAP = 35;

const normalizeFeedSignalKind = (value?: string | null) => {
  const normalized = String(value || "positive")
    .trim()
    .toLowerCase();
  if (normalized === "negative" || normalized === "context") {
    return normalized;
  }

  return "positive";
};

const recordFeedInteraction = async (
  viewerId: string | undefined,
  input: TrackFeedInteractionArgs,
) => {
  if (!viewerId) {
    return false;
  }

  const interactionType = String(input.interactionType || "")
    .trim()
    .toUpperCase();
  if (!interactionType) {
    return false;
  }

  const normalizedPostId = input.postId?.trim() || null;
  const signalKind = normalizeFeedSignalKind(input.signalKind);
  const category = input.category?.trim().toLowerCase() || null;
  const searchTerm = input.searchTerm?.trim().toLowerCase() || null;
  const durationMs =
    typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : null;

  let metadata: Record<string, unknown> | null = null;
  if (typeof input.metadata === "string" && input.metadata.trim()) {
    try {
      const parsed = JSON.parse(input.metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = {
        note: input.metadata.trim().slice(0, 500),
      };
    }
  } else if (
    input.metadata &&
    typeof input.metadata === "object" &&
    !Array.isArray(input.metadata)
  ) {
    metadata = input.metadata;
  }

  await (prisma as any).feedInteraction.create({
    data: {
      userId: viewerId,
      postId: normalizedPostId,
      interactionType,
      signalKind,
      category,
      searchTerm,
      durationMs,
      metadata,
    },
  });

  return true;
};

const extractS3Key = (fileUrl: string) => {
  try {
    const parsed = new URL(fileUrl);
    // Only presign URLs that belong to this app's S3 or CloudFront — never external URLs.
    const isS3 = /\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/.test(parsed.hostname);
    const cfRaw = process.env.CLOUDFRONT_URL ?? '';
    const cfHost = cfRaw ? (() => { try { return new URL(cfRaw).hostname; } catch { return ''; } })() : '';
    if (!isS3 && !(cfHost && parsed.hostname === cfHost)) return null;
    const key = parsed.pathname.replace(/^\/+/, "");
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
};

const getInaccessibleAuthorIds = async (viewerId?: string) => {
  if (!viewerId) {
    return [];
  }

  const blockers = await prisma.user.findMany({
    where: {
      blockedUserIds: {
        has: viewerId,
      },
    },
    select: { id: true },
  });

  return Array.from(new Set(blockers.map((user) => user.id)));
};

const getBlockedUserIdsForViewer = async (viewerId?: string) => {
  if (!viewerId) {
    return [];
  }

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { blockedUserIds: true },
  });

  return Array.isArray(viewer?.blockedUserIds) ? viewer.blockedUserIds : [];
};

const getMutedUserIdsForViewer = async (viewerId?: string) => {
  if (!viewerId) {
    return [];
  }

  const mutedUsers = await (prisma as any).mute.findMany({
    where: { muterId: viewerId },
    select: { mutedId: true },
  });

  return mutedUsers.map((entry: { mutedId: string }) => entry.mutedId);
};

const getPrivatePostAuthorIds = async (viewerId?: string) => {
  const privateAuthors = await (prisma as any).user.findMany({
    where: {
      visibilityPublicPosts: false,
      deleted: false,
      disabled: false,
      ...(viewerId
        ? {
            id: { not: viewerId },
            NOT: {
              followerRelations: {
                some: { followerId: viewerId },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return privateAuthors.map((u: any) => u.id);
};

const getPrivateCommentAuthorIds = async (viewerId?: string) => {
  const privateCommentAuthors = await (prisma as any).user.findMany({
    where: {
      visibilityPublicComments: false,
      deleted: false,
      disabled: false,
      ...(viewerId
        ? {
            id: { not: viewerId },
            NOT: {
              followerRelations: {
                some: { followerId: viewerId },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return privateCommentAuthors.map((u: any) => u.id);
};

const buildVisiblePostWhere = (
  uninterestedPostIds?: string[],
  inaccessibleAuthorIds?: string[],
) => ({
  deleted: false,
  ...(Array.isArray(uninterestedPostIds) && uninterestedPostIds.length > 0
    ? {
        id: {
          notIn: uninterestedPostIds,
        },
      }
    : {}),
  ...(Array.isArray(inaccessibleAuthorIds) && inaccessibleAuthorIds.length > 0
    ? {
        authorId: {
          notIn: inaccessibleAuthorIds,
        },
      }
    : {}),
  author: {
    is: {
      deleted: false,
      disabled: false,
    },
  },
});

const buildPostInclude = (viewerId?: string) => {
  const include: any = {
    author: true,
    _count: {
      select: {
        likes: true,
        comments: true,
      },
    },
  };

  if (viewerId) {
    include.likes = {
      where: { userId: viewerId },
      select: { userId: true },
    };
    include.purchases = {
      where: { userId: viewerId },
      select: { id: true },
    };
  }

  return include;
};

const mapPostForGraphQL = (post: any, viewerId?: string) => ({
  ...post,
  likeCount: post?._count?.likes ?? 0,
  commentCount: post?._count?.comments ?? 0,
  viewerHasLiked: viewerId ? (post?.likes?.length ?? 0) > 0 : false,
  viewerHasPurchased: viewerId
    ? post?.isFree
      ? false
      : (post?.purchases?.length ?? 0) > 0 || post?.authorId === viewerId
    : false,
  viewCount: post?.viewCount ?? 0,
  isFree: post?.isFree ?? true,
  price: post?.price ?? 0,
});

type FeedViewerSignals = {
  followingIds: Set<string>;
  categoryWeights: Map<string, number>;
  authorWeights: Map<string, number>;
  keywordWeights: Map<string, number>;
  // postId → { penalty, opened }
  // opened=true means OPEN_PREVIEW or LONG_VIEW fired (higher cap than scroll-past-only)
  seenPostIds: Map<string, { penalty: number; opened: boolean }>;
  isNewUser: boolean;
};

type RankedFeedCandidate = {
  post: any;
  score: number;
  isFollowed: boolean;
};

const incrementWeight = (
  map: Map<string, number>,
  key: string | null | undefined,
  amount: number,
) => {
  const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
  if (!normalizedKey) {
    return;
  }

  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + amount);
};

const addCategoryWeights = (
  map: Map<string, number>,
  categories: unknown,
  amount: number,
) => {
  for (const category of normalizeCategories(categories)) {
    incrementWeight(map, category, amount);
  }
};

const buildViewerFeedSignals = async (
  viewerId?: string,
): Promise<FeedViewerSignals> => {
  if (!viewerId) {
    return {
      followingIds: new Set<string>(),
      categoryWeights: new Map<string, number>(),
      authorWeights: new Map<string, number>(),
      keywordWeights: new Map<string, number>(),
      seenPostIds: new Map<string, { penalty: number; opened: boolean }>(),
      isNewUser: true,
    };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: {
      followingRelations: {
        select: { followingId: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      likes: {
        select: {
          post: {
            select: {
              authorId: true,
              categories: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      comments: {
        select: {
          post: {
            select: {
              authorId: true,
              categories: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      posts: {
        where: { deleted: false },
        select: { categories: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      archive: {
        select: {
          savedPosts: {
            select: {
              post: {
                select: {
                  authorId: true,
                  categories: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
      workspace: {
        select: {
          savedPosts: {
            select: {
              post: {
                select: {
                  authorId: true,
                  categories: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
      feedInteractions: {
        select: {
          postId: true,
          interactionType: true,
          signalKind: true,
          category: true,
          searchTerm: true,
          durationMs: true,
          post: {
            select: {
              authorId: true,
              categories: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  });

  const followingIds = new Set(
    (viewer?.followingRelations ?? []).map((entry) => entry.followingId),
  );
  const categoryWeights = new Map<string, number>();
  const authorWeights = new Map<string, number>();
  const keywordWeights = new Map<string, number>();

  for (const relation of viewer?.followingRelations ?? []) {
    incrementWeight(authorWeights, relation.followingId, 18);
  }

  for (const like of viewer?.likes ?? []) {
    incrementWeight(authorWeights, like.post?.authorId, 12);
    addCategoryWeights(categoryWeights, like.post?.categories, 8);
  }

  for (const comment of viewer?.comments ?? []) {
    incrementWeight(authorWeights, comment.post?.authorId, 8);
    addCategoryWeights(categoryWeights, comment.post?.categories, 5);
  }

  for (const savedPost of viewer?.archive?.savedPosts ?? []) {
    incrementWeight(authorWeights, savedPost.post?.authorId, 10);
    addCategoryWeights(categoryWeights, savedPost.post?.categories, 10);
  }

  for (const savedPost of viewer?.workspace?.savedPosts ?? []) {
    incrementWeight(authorWeights, savedPost.post?.authorId, 10);
    addCategoryWeights(categoryWeights, savedPost.post?.categories, 10);
  }

  for (const post of viewer?.posts ?? []) {
    addCategoryWeights(categoryWeights, post.categories, 4);
  }

  const seenPostIds = new Map<string, { penalty: number; opened: boolean }>();

  for (const interaction of viewer?.feedInteractions ?? []) {
    const interactionType = String(interaction.interactionType || "")
      .trim()
      .toUpperCase();
    const weighting = FEED_INTERACTION_SIGNAL_WEIGHTS[interactionType] ?? {
      authorWeight: 2,
      categoryWeight: 3,
      keywordWeight: 2,
    };
    const signalKind = normalizeFeedSignalKind(interaction.signalKind);
    const multiplier =
      signalKind === "negative" ? -1 : signalKind === "context" ? 0.5 : 1;

    incrementWeight(
      authorWeights,
      interaction.post?.authorId,
      weighting.authorWeight * multiplier,
    );
    addCategoryWeights(
      categoryWeights,
      interaction.post?.categories,
      weighting.categoryWeight * multiplier,
    );
    incrementWeight(
      categoryWeights,
      interaction.category,
      weighting.categoryWeight * 0.75 * multiplier,
    );
    incrementWeight(
      keywordWeights,
      interaction.searchTerm,
      weighting.keywordWeight * multiplier,
    );
    incrementWeight(
      keywordWeights,
      interaction.category,
      weighting.keywordWeight * 0.6 * multiplier,
    );

    // Accumulate seen penalties for specific posts
    const seenPenalty = SEEN_POST_PENALTIES[interactionType];
    if (seenPenalty && interaction.postId && signalKind !== "negative") {
      const isOpened = interactionType === "OPEN_PREVIEW" || interactionType === "LONG_VIEW";
      const existing = seenPostIds.get(interaction.postId) ?? { penalty: 0, opened: false };
      const wasOpened = existing.opened || isOpened;
      const cap = wasOpened ? SEEN_OPENED_CAP : SEEN_SCROLL_CAP;
      seenPostIds.set(interaction.postId, {
        penalty: Math.min(existing.penalty + seenPenalty, cap),
        opened: wasOpened,
      });
    }
  }

  const interactionCount =
    (viewer?.followingRelations?.length ?? 0) +
    (viewer?.likes?.length ?? 0) +
    (viewer?.comments?.length ?? 0) +
    (viewer?.archive?.savedPosts?.length ?? 0) +
    (viewer?.workspace?.savedPosts?.length ?? 0);

  return {
    followingIds,
    categoryWeights,
    authorWeights,
    keywordWeights,
    seenPostIds,
    isNewUser: interactionCount < 5,
  };
};

const scorePostForFeed = (
  post: any,
  viewerId: string | undefined,
  signals: FeedViewerSignals,
) => {
  const authorId = typeof post?.authorId === "string" ? post.authorId : "";
  const categories = normalizeCategories(post?.categories);
  const matchedCategoryWeight = categories.reduce(
    (total, category) => total + (signals.categoryWeights.get(category) ?? 0),
    0,
  );
  const matchedCategoryCount = categories.filter((category) =>
    signals.categoryWeights.has(category),
  ).length;
  const likeCount = post?._count?.likes ?? 0;
  const commentCount = post?._count?.comments ?? 0;
  const searchableText = [
    post?.title,
    post?.description,
    ...(Array.isArray(post?.categories) ? post.categories : []),
    post?.author?.username,
    post?.author?.displayName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const keywordBoost = Array.from(signals.keywordWeights.entries()).reduce(
    (total, [keyword, weight]) =>
      keyword && searchableText.includes(keyword) ? total + weight : total,
    0,
  );
  const createdAtMs = new Date(post?.createdAt ?? Date.now()).getTime();
  const ageHours = Number.isFinite(createdAtMs)
    ? Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60))
    : 72;
  const authorAffinityBoost = authorId
    ? (signals.authorWeights.get(authorId.toLowerCase()) ?? 0)
    : 0;
  const engagementBoost =
    Math.min(likeCount, 30) * 1.4 + Math.min(commentCount, 20) * 1.8;
  const freshnessBoost = Math.max(0, 72 - ageHours) * 0.75;
  const interestBoost = matchedCategoryWeight + matchedCategoryCount * 6;
  const explorationBoost = matchedCategoryCount > 0 ? 10 : signals.isNewUser ? 8 : 0;
  const pinnedBoost = post?.pinned ? 20 : 0;
  const ownPostPenalty = viewerId && authorId === viewerId ? 18 : 0;
  const seenPenalty = post?.id ? (signals.seenPostIds.get(post.id)?.penalty ?? 0) : 0;

  return (
    authorAffinityBoost +
    interestBoost +
    Math.max(-40, Math.min(keywordBoost, 40)) +
    engagementBoost +
    freshnessBoost +
    explorationBoost +
    pinnedBoost -
    ownPostPenalty -
    seenPenalty
  );
};

const pickNextFeedCandidate = (
  pool: RankedFeedCandidate[],
  lastAuthorId?: string | null,
): RankedFeedCandidate | null => {
  if (pool.length === 0) {
    return null;
  }

  const preferredIndex = lastAuthorId
    ? pool.findIndex((candidate) => candidate.post?.authorId !== lastAuthorId)
    : 0;
  const nextIndex = preferredIndex >= 0 ? preferredIndex : 0;

  return pool.splice(nextIndex, 1)[0] ?? null;
};

// Pure score-ranked feed with author diversity (no follow ratio enforcement).
const buildScoredFeed = (
  rankedCandidates: RankedFeedCandidate[],
  limit: number,
  offset: number,
) => {
  const sorted = [...rankedCandidates].sort((a, b) => b.score - a.score);
  const result: any[] = [];
  const targetSize = offset + limit;
  let lastAuthorId: string | null = null;

  while (result.length < targetSize && sorted.length > 0) {
    const next = pickNextFeedCandidate(sorted, lastAuthorId);
    if (!next) break;
    result.push(next.post);
    lastAuthorId = next.post?.authorId ?? null;
  }

  return result;
};

const getMixedFeedPosts = async (
  viewerId: string | undefined,
  safeLimit: number,
  safeOffset: number,
  uninterestedPostIds: string[],
  inaccessibleAuthorIds: string[],
) => {
  const signals = await buildViewerFeedSignals(viewerId);
  const topInterestCategories = Array.from(signals.categoryWeights.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([category]) => category);
  const candidateTake = Math.min(
    Math.max((safeOffset + safeLimit) * 5, 60),
    240,
  );
  const feedExcludedAuthorIds = Array.from(
    new Set([...inaccessibleAuthorIds, ...(viewerId ? [viewerId] : [])]),
  );
  const visiblePostWhere = buildVisiblePostWhere(
    uninterestedPostIds,
    feedExcludedAuthorIds,
  );

  const [recentCandidates, followedCandidates, interestCandidates] =
    await Promise.all([
      prisma.post.findMany({
        where: visiblePostWhere,
        include: buildPostInclude(viewerId),
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] as any,
        take: candidateTake,
      }),
      signals.followingIds.size > 0
        ? prisma.post.findMany({
            where: {
              ...visiblePostWhere,
              authorId: {
                in: Array.from(signals.followingIds),
                ...(feedExcludedAuthorIds.length > 0
                  ? {
                      notIn: feedExcludedAuthorIds,
                    }
                  : {}),
              },
            },
            include: buildPostInclude(viewerId),
            orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] as any,
            take: candidateTake,
          })
        : Promise.resolve([]),
      topInterestCategories.length > 0
        ? prisma.post.findMany({
            where: {
              ...visiblePostWhere,
              categories: {
                hasSome: topInterestCategories,
              },
            },
            include: buildPostInclude(viewerId),
            orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] as any,
            take: candidateTake,
          })
        : Promise.resolve([]),
    ]);

  const dedupedPosts = Array.from(
    new Map(
      [...recentCandidates, ...followedCandidates, ...interestCandidates].map(
        (post) => [post.id, post],
      ),
    ).values(),
  );
  const rankedCandidates = dedupedPosts.map((post) => ({
    post,
    score: scorePostForFeed(post, viewerId, signals),
    isFollowed: signals.followingIds.has(post.authorId ?? ""),
  }));
  const mixedPosts = buildScoredFeed(rankedCandidates, safeLimit, safeOffset);

  return mixedPosts
    .slice(safeOffset, safeOffset + safeLimit)
    .map((post) => mapPostForGraphQL(post, viewerId));
};

const buildPostVersionSnapshot = (
  post: {
    id: string;
    title: string;
    categories: string[];
    description?: string | null;
    year?: number | null;
    fileUrl: string;
    thumbnailUrl?: string | null;
    fileType?: string | null;
  },
  versionNumber: number,
  editorId?: string | null,
) => ({
  postId: post.id,
  versionNumber,
  title: post.title,
  categories: post.categories,
  description: post.description ?? null,
  year: post.year ?? null,
  fileUrl: post.fileUrl,
  thumbnailUrl: post.thumbnailUrl ?? null,
  fileType: post.fileType ?? "pdf",
  editorId: editorId ?? null,
});

const mapPostVersionForGraphQL = (version: any) => ({
  ...version,
  postId: version.postId,
});

const buildCommentInclude = (viewerId?: string) => {
  const include: any = {
    author: true,
    post: {
      include: {
        author: true,
      },
    },
    parent: {
      include: {
        author: true,
      },
    },
    _count: {
      select: {
        commentLikes: true,
        replies: true,
      },
    },
  };

  if (viewerId) {
    include.commentLikes = {
      where: { userId: viewerId },
      select: { userId: true },
    };
  }

  return include;
};

const mapCommentForGraphQL = (comment: any, viewerId?: string) => ({
  ...comment,
  likeCount: comment?._count?.commentLikes ?? 0,
  replyCount: comment?._count?.replies ?? 0,
  viewerHasLiked: viewerId ? (comment?.commentLikes?.length ?? 0) > 0 : false,
});

const sanitizeAuthorIdentity = (author: any) => {
  if (!author) return null;
  if (author.deleted) {
    return {
      ...author,
      displayName: "Deleted",
      username: "deleted",
      profilePicture: null,
      profilePictureUrl: null,
      subscriptionPlan: null,
    };
  }
  if (author.disabled) {
    return {
      ...author,
      displayName: "Disabled User",
      username: "disabled",
    };
  }
  return author;
};

export const PostResolver = {
  Query: {
    post: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const viewerId = ctx.user?.sub;
      const normalizedId = id?.trim();
      if (!normalizedId) {
        throw new Error("Post id is required");
      }

      const [blockedIds, privateIds] = await Promise.all([
        getInaccessibleAuthorIds(viewerId),
        getPrivatePostAuthorIds(viewerId),
      ]);
      const allHiddenIds = Array.from(new Set([...blockedIds, ...privateIds]));

      const post = await prisma.post.findFirst({
        where: {
          id: normalizedId,
          ...buildVisiblePostWhere(undefined, allHiddenIds),
        },
        include: buildPostInclude(viewerId),
      });

      return post ? mapPostForGraphQL(post, viewerId) : null;
    },
    postRenderedHtml: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedId = id?.trim();
      if (!normalizedId) return null;

      const post = await prisma.post.findFirst({
        where: {
          id: normalizedId,
          ...buildVisiblePostWhere(),
        },
        select: { id: true, fileType: true, renderedHtmlUrl: true },
      });

      if (!post || post.fileType === "pdf" || !post.renderedHtmlUrl) {
        return null;
      }

      const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
      if (!privateBucket) return null;

      try {
        const parsedUrl = new URL(post.renderedHtmlUrl);
        const key = parsedUrl.pathname.slice(1);
        const result = await s3.send(
          new GetObjectCommand({ Bucket: privateBucket, Key: key }),
        );
        return (await result.Body?.transformToString("utf-8")) ?? null;
      } catch (err) {
        console.error(`[postRenderedHtml] S3 fetch failed for post ${normalizedId}:`, err);
        return null;
      }
    },
    postVersions: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const inaccessibleAuthorIds = await getInaccessibleAuthorIds(viewerId);
      const post = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: { id: true, deleted: true, authorId: true },
      });

      if (!post || post.deleted) {
        throw new Error("Post not found");
      }

      if (post.authorId && inaccessibleAuthorIds.includes(post.authorId)) {
        throw new Error("Post not found");
      }

      const versions = await (prisma as any).postVersion.findMany({
        where: { postId: normalizedPostId },
        include: {
          editor: true,
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      });

      return versions.map((version: any) => mapPostVersionForGraphQL(version));
    },
    posts: async (
      _: unknown,
      {
        authorUsername,
        limit = 50,
        offset = 0,
      }: {
        authorUsername?: string | null;
        limit?: number;
        offset?: number;
      },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const normalizedAuthorUsername = String(authorUsername || "").trim();
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);
      const viewer = viewerId
        ? await prisma.user.findUnique({
            where: { id: viewerId },
            select: { uninterestedPostIds: true, blockedUserIds: true },
          })
        : null;
      const uninterestedPostIds = Array.isArray(viewer?.uninterestedPostIds)
        ? viewer.uninterestedPostIds
        : [];
      const [blockedByIds, blockedIds, privatePostIds, mutedUserIds] =
        await Promise.all([
          getInaccessibleAuthorIds(viewerId),
          getBlockedUserIdsForViewer(viewerId),
          getPrivatePostAuthorIds(viewerId),
          getMutedUserIdsForViewer(viewerId),
        ]);
      const inaccessibleAuthorIds = normalizedAuthorUsername
        ? Array.from(new Set([...blockedByIds]))
        : Array.from(
            new Set([
              ...blockedByIds,
              ...blockedIds,
              ...privatePostIds,
              ...mutedUserIds,
            ]),
          );

      if (!normalizedAuthorUsername) {
        return getMixedFeedPosts(
          viewerId,
          safeLimit,
          safeOffset,
          uninterestedPostIds,
          inaccessibleAuthorIds,
        );
      }

      const posts = await prisma.post.findMany({
        where: {
          deleted: false,
          ...(inaccessibleAuthorIds.length > 0
            ? {
                authorId: {
                  notIn: inaccessibleAuthorIds,
                },
              }
            : {}),
          author: {
            username: {
              equals: normalizedAuthorUsername,
              mode: "insensitive",
            },
            deleted: false,
            disabled: false,
          },
        },
        include: buildPostInclude(viewerId),
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] as any,
        take: safeLimit,
        skip: safeOffset,
      });

      return posts.map((post) => mapPostForGraphQL(post, viewerId));
    },
    trendingPosts: async (
      _: unknown,
      { limit = 5 }: { limit?: number },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
      const [inaccessibleIds, blockedIds] = await Promise.all([
        getInaccessibleAuthorIds(viewerId),
        getBlockedUserIdsForViewer(viewerId),
      ]);
      const excludedAuthorIds = [...new Set([...inaccessibleIds, ...blockedIds])];
      return prisma.post.findMany({
        where: {
          deleted: false,
          ...(excludedAuthorIds.length > 0
            ? { authorId: { notIn: excludedAuthorIds } }
            : {}),
          author: { deleted: false, disabled: false },
        },
        orderBy: { viewCount: "desc" },
        take: safeLimit,
      });
    },

    searchPosts: async (
      _: unknown,
      { query, limit = 12, offset = 0, author }: { query: string; limit?: number; offset?: number; author?: string | null },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const normalizedQuery = String(query || "").trim();
      const authorUsername = author?.trim();

      if (!normalizedQuery) {
        return [];
      }

      const safeLimit = Math.max(1, Math.min(limit, 25));
      const safeOffset = Math.max(0, offset);
      const numericYear = Number.parseInt(normalizedQuery, 10);
      const [blockedIds, privateIds] = await Promise.all([
        getInaccessibleAuthorIds(viewerId),
        getPrivatePostAuthorIds(viewerId),
      ]);
      const inaccessibleAuthorIds = Array.from(
        new Set([...blockedIds, ...privateIds]),
      );

      const posts = await prisma.post.findMany({
        where: {
          ...buildVisiblePostWhere(undefined, inaccessibleAuthorIds),
          ...(authorUsername
            ? {
                AND: [
                  {
                    author: {
                      is: {
                        username: {
                          equals: authorUsername,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
          OR: [
            {
              title: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
            {
              categories: {
                has: normalizedQuery.toLowerCase(),
              },
            },
            {
              description: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
            ...(Number.isFinite(numericYear)
              ? [
                  {
                    year: numericYear,
                  },
                ]
              : []),
            {
              author: {
                is: {
                  deleted: false,
                  disabled: false,
                  OR: [
                    {
                      username: {
                        contains: normalizedQuery,
                        mode: "insensitive",
                      },
                    },
                    {
                      displayName: {
                        contains: normalizedQuery,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        include: buildPostInclude(viewerId),
        orderBy: {
          createdAt: "desc",
        },
        take: safeLimit,
        skip: safeOffset,
      });

      return posts.map((post) => mapPostForGraphQL(post, viewerId));
    },
    comments: async (
      _: unknown,
      {
        postId,
        parentCommentId = null,
        limit = 50,
        offset = 0,
      }: {
        postId: string;
        parentCommentId?: string | null;
        limit?: number;
        offset?: number;
      },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);
      const hiddenCommentAuthorIds = await getPrivateCommentAuthorIds(viewerId);

      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, deleted: true },
      });
      if (!post || post.deleted) {
        throw new Error("Post not found");
      }

      const comments = await (prisma as any).comment.findMany({
        where: {
          postId,
          parentId: parentCommentId,
          ...(hiddenCommentAuthorIds.length > 0
            ? {
                OR: [
                  {
                    authorId: {
                      notIn: hiddenCommentAuthorIds,
                    },
                  },
                  ...(viewerId
                    ? [
                        {
                          post: {
                            authorId: viewerId,
                          },
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
        include: buildCommentInclude(viewerId),
        orderBy: { createdAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
      });

      return comments.map((comment: any) =>
        mapCommentForGraphQL(comment, viewerId),
      );
    },
    recentlyDeletedPosts: async (
      _: unknown,
      { limit = 50, offset = 0 }: { limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const safeLimit = Math.min(Math.max(1, limit ?? 50), 100);
      const safeOffset = Math.max(0, offset ?? 0);
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const posts = await prisma.post.findMany({
        where: {
          authorId: viewerId,
          deleted: true,
          deletedAt: { gte: cutoff },
        },
        include: buildPostInclude(viewerId),
        orderBy: { deletedAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
      });

      return posts.map((post) => ({
        ...mapPostForGraphQL(post, viewerId),
        deletedAt: post.deletedAt instanceof Date ? post.deletedAt.toISOString() : null,
      }));
    },
  },
  Mutation: {
    createPost: async (_: unknown, args: CreatePostArgs, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
      const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
      const region = process.env.AWS_REGION;

      if (!privateBucket || !publicBucket || !region) {
        throw new Error("S3 bucket configuration is missing");
      }

      const {
        fileBase64,
        thumbnailBase64,
        fileName,
        mimeType,
        title,
        categories,
        description,
        year,
        isFree: isFreeInput,
        price: priceInput,
      } = args;

      const { isFree, price } = normalizePricingInput(isFreeInput, priceInput);

      const normalizedCategories = normalizeCategories(categories);

      if (!fileBase64 || !fileName || !mimeType || !title) {
        throw new Error("Missing required post fields");
      }

      if (normalizedCategories.length < 1 || normalizedCategories.length > 3) {
        throw new Error("Posts must have between 1 and 3 categories");
      }

      const normalizedMime = mimeType.toLowerCase();
      const normalizedName = fileName.toLowerCase();

      const DOCX_MIME =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const DOC_MIME = "application/msword";

      const isPdf =
        normalizedMime === "application/pdf" || normalizedName.endsWith(".pdf");
      const isDocx =
        normalizedMime === DOCX_MIME || normalizedName.endsWith(".docx");
      const isDoc =
        normalizedMime === DOC_MIME || normalizedName.endsWith(".doc");

      if (!isPdf && !isDocx && !isDoc) {
        throw new Error("Only PDF, DOCX, and DOC files are allowed");
      }

      const fileType = isPdf ? "pdf" : isDocx ? "docx" : "doc";
      const s3ContentType = isPdf
        ? "application/pdf"
        : isDocx
          ? DOCX_MIME
          : DOC_MIME;

      const fileBuffer = Buffer.from(fileBase64, "base64");
      if (!fileBuffer.length) {
        throw new Error("Uploaded file is empty");
      }

      if (isPdf) {
        const validPdf =
          fileBuffer.length >= 4 &&
          fileBuffer[0] === 0x25 && // %
          fileBuffer[1] === 0x50 && // P
          fileBuffer[2] === 0x44 && // D
          fileBuffer[3] === 0x46;   // F
        if (!validPdf) throw new Error("Invalid PDF file");
      } else {
        const { isValidWordBuffer } = await import(
          "../../services/document-converter.js"
        );
        if (!isValidWordBuffer(fileBuffer, fileType as "docx" | "doc")) {
          throw new Error(
            `The uploaded file does not appear to be a valid ${fileType.toUpperCase()} document`,
          );
        }
      }

      const key = `documents/${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: privateBucket,
          Key: key,
          Body: fileBuffer,
          ContentType: s3ContentType,
        }),
      );

      const fileUrl = buildPrivateS3Url(key);
      let thumbnailUrl: string | null = null;

      if (typeof thumbnailBase64 === "string" && thumbnailBase64.trim()) {
        try {
          const thumbnailBuffer = Buffer.from(thumbnailBase64, "base64");
          if (
            thumbnailBuffer.length > 0 &&
            thumbnailBuffer.length <= MAX_POST_THUMBNAIL_BYTES
          ) {
            const isWebp =
              thumbnailBuffer.length >= 12 &&
              thumbnailBuffer[0] === 0x52 &&
              thumbnailBuffer[1] === 0x49 &&
              thumbnailBuffer[2] === 0x46 &&
              thumbnailBuffer[3] === 0x46 &&
              thumbnailBuffer[8] === 0x57 &&
              thumbnailBuffer[9] === 0x45 &&
              thumbnailBuffer[10] === 0x42 &&
              thumbnailBuffer[11] === 0x50;
            const isJpeg =
              !isWebp &&
              thumbnailBuffer.length >= 3 &&
              thumbnailBuffer[0] === 0xff &&
              thumbnailBuffer[1] === 0xd8 &&
              thumbnailBuffer[2] === 0xff;

            if (isWebp || isJpeg) {
              const thumbnailExt = isWebp ? ".webp" : ".jpg";
              const thumbnailContentType = isWebp ? "image/webp" : "image/jpeg";
              const thumbnailBaseName =
                fileName.replace(/\.(pdf|docx?|doc)$/i, "") || "document";
              const thumbnailKey = `thumbnails/${Date.now()}-${randomUUID()}-${sanitizeFileName(
                thumbnailBaseName,
              )}${thumbnailExt}`;

              await s3.send(
                new PutObjectCommand({
                  Bucket: publicBucket,
                  Key: thumbnailKey,
                  Body: thumbnailBuffer,
                  ContentType: thumbnailContentType,
                }),
              );

              thumbnailUrl = buildCloudFrontUrl(thumbnailKey);
            }
          }
        } catch {
          thumbnailUrl = null;
        }
      }

      // Server-side PDF thumbnail fallback — runs when no client-provided thumbnail.
      if (!thumbnailUrl && isPdf) {
        try {
          const { pdfToThumbnailBuffer } = await import(
            "../../services/pdf-thumbnail.js"
          );
          const thumbBuffer = await pdfToThumbnailBuffer(fileBuffer);
          if (thumbBuffer) {
            const thumbKey = `thumbnails/${Date.now()}-${randomUUID()}.jpg`;
            await s3.send(
              new PutObjectCommand({
                Bucket: publicBucket,
                Key: thumbKey,
                Body: thumbBuffer,
                ContentType: "image/jpeg",
              }),
            );
            thumbnailUrl = buildCloudFrontUrl(thumbKey);
          }
        } catch (err) {
          console.error("[post] pdf thumbnail generation failed:", err);
        }
      }

      // Convert Word documents to HTML for in-browser rendering.
      // Stored as a private S3 object; URL saved alongside the original file.
      let renderedHtmlUrl: string | null = null;
      if (!isPdf) {
        try {
          const { convertWordToHtml, generateWordThumbnail } = await import(
            "../../services/document-converter.js"
          );
          const { html, text } = await convertWordToHtml(fileBuffer);
          const htmlKey = `documents/html/${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}.html`;
          await s3.send(
            new PutObjectCommand({
              Bucket: privateBucket,
              Key: htmlKey,
              Body: Buffer.from(html, "utf8"),
              ContentType: "text/html; charset=utf-8",
            }),
          );
          renderedHtmlUrl = buildPrivateS3Url(htmlKey);

          if (!thumbnailUrl && text.trim()) {
            const thumbBuffer = await generateWordThumbnail(text);
            if (thumbBuffer) {
              const thumbKey = `thumbnails/${Date.now()}-${randomUUID()}.webp`;
              await s3.send(
                new PutObjectCommand({
                  Bucket: publicBucket,
                  Key: thumbKey,
                  Body: thumbBuffer,
                  ContentType: "image/webp",
                }),
              );
              thumbnailUrl = buildCloudFrontUrl(thumbKey);
            }
          }
        } catch (err) {
          console.error("[post] word-to-html conversion failed:", err);
        }
      }

      const createdPost = await prisma.$transaction(async (tx) => {
        const nextPost = await tx.post.create({
          data: {
            fileUrl,
            thumbnailUrl,
            fileType,
            renderedHtmlUrl,
            title: title.trim(),
            categories: normalizedCategories,
            description: description?.trim() || null,
            year: Number.isFinite(year) ? year : null,
            isFree,
            price,
            authorId: ctx.user.sub,
          },
        });

        await (tx as any).postVersion.create({
          data: buildPostVersionSnapshot(nextPost, 1, ctx.user.sub),
        });

        return tx.post.findUnique({
          where: { id: nextPost.id },
          include: buildPostInclude(ctx.user.sub),
        });
      });

      if (!createdPost) {
        throw new Error("Failed to create post");
      }

      checkAchievements(ctx.user.sub, "post_created").catch(() => null);

      void (async () => {
        try {
          const plagiarismResult = await checkUploadForPlagiarism(
            fileBase64,
            s3ContentType,
            createdPost.id,
          );
          if (plagiarismResult) {
            const { overallVerdict, overallScore, matchesByPost } = plagiarismResult;
            if (overallVerdict !== "CLEAN") {
              console.warn(
                `[plagiarism] post=${createdPost.id} verdict=${overallVerdict} ` +
                `score=${(overallScore * 100).toFixed(1)}% ` +
                `top_match=${matchesByPost[0]?.postId ?? "none"}`,
              );
              await createPlagiarismCase(plagiarismResult, createdPost.id);
            }
          }
          // Index after check so our own content doesn't match itself.
          if (plagiarismResult !== null) {
            const { extractText } = await import("../../services/plagiarism/text-extractor.js");
            const text = await extractText(fileBase64, s3ContentType);
            if (text) await indexPostContent(createdPost.id, text);
          }
        } catch (err) {
          console.error("[plagiarism] background check failed:", err);
        }
      })();

      // Parse @mentions in post description and send notifications
      const postDescription = description?.trim();
      if (postDescription) {
        const descMentionMatches = postDescription.match(/@([A-Za-z0-9._]+)/g);
        if (descMentionMatches && descMentionMatches.length > 0) {
          const mentionedUsernames = [
            ...new Set(descMentionMatches.map((m) => m.slice(1).toLowerCase())),
          ].slice(0, 10);

          const mentionedUsers = await prisma.user.findMany({
            where: {
              username: { in: mentionedUsernames, mode: "insensitive" },
              deleted: false,
              disabled: false,
            },
            select: { id: true },
          });

          const actor = await prisma.user.findUnique({
            where: { id: ctx.user.sub },
            select: {
              displayName: true,
              username: true,
              profilePicture: true,
            },
          });
          const actorLabel =
            actor?.displayName?.trim() || actor?.username?.trim() || "Someone";

          for (const mentionedUser of mentionedUsers) {
            if (mentionedUser.id === ctx.user.sub) continue;

            await createNotification({
              userId: mentionedUser.id,
              actorId: ctx.user.sub,
              postId: createdPost.id,
              type: NOTIFICATION_TYPE.MENTION,
              title: `${actorLabel} mentioned you in a post`,
              description: postDescription,
              icon: NOTIFICATION_ICON.MENTION,
              profilePicture: actor?.profilePicture,
            });
          }
        }
      }

      return mapPostForGraphQL(createdPost, ctx.user.sub);
    },
    updatePost: async (
      _: unknown,
      args: UpdatePostArgs,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = args.postId?.trim();
      const normalizedTitle = args.title?.trim();
      const normalizedCategories = normalizeCategories(args.categories);
      const normalizedDescription = args.description?.trim() || null;
      const normalizedYear = Number.isFinite(args.year) ? args.year : null;
      const { isFree, price } = normalizePricingInput(args.isFree, args.price);

      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      if (!normalizedTitle || normalizedCategories.length < 1) {
        throw new Error("Title and at least one category are required");
      }

      if (normalizedCategories.length > 3) {
        throw new Error("Posts can have at most 3 categories");
      }

      const existingPost = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: {
          id: true,
          authorId: true,
          deleted: true,
          pinned: true,
          title: true,
          categories: true,
          description: true,
          year: true,
          fileUrl: true,
          thumbnailUrl: true,
        },
      });

      if (!existingPost || existingPost.deleted) {
        throw new Error("Post not found");
      }

      if (existingPost.authorId !== viewerId) {
        throw new Error("You can only edit your own posts");
      }

      const updatedPost = await prisma.$transaction(async (tx) => {
        const latestVersion = await (tx as any).postVersion.findFirst({
          where: { postId: normalizedPostId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });

        let nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

        if (!latestVersion) {
          await (tx as any).postVersion.create({
            data: buildPostVersionSnapshot(
              existingPost,
              nextVersionNumber,
              viewerId,
            ),
          });
          nextVersionNumber += 1;
        }

        const nextPost = await tx.post.update({
          where: { id: normalizedPostId },
          data: {
            title: normalizedTitle,
            categories: normalizedCategories,
            description: normalizedDescription,
            year: normalizedYear,
            isFree,
            price,
          },
        });

        await (tx as any).postVersion.create({
          data: buildPostVersionSnapshot(nextPost, nextVersionNumber, viewerId),
        });

        return tx.post.findUnique({
          where: { id: normalizedPostId },
          include: buildPostInclude(viewerId),
        });
      });

      if (!updatedPost) {
        throw new Error("Post not found");
      }

      return mapPostForGraphQL(updatedPost, viewerId);
    },
    pinPostToProfile: async (
      _: unknown,
      { postId }: PinPostArgs,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const existingPost = await (prisma as any).post.findUnique({
        where: { id: normalizedPostId },
        select: { id: true, authorId: true, pinned: true, deleted: true },
      });

      if (!existingPost || existingPost.deleted) {
        throw new Error("Post not found");
      }

      if (existingPost.authorId !== viewerId) {
        throw new Error("You can only pin your own posts");
      }

      if (existingPost.pinned) {
        await (prisma as any).post.update({
          where: { id: normalizedPostId },
          data: { pinned: false },
        });
      } else {
        await prisma.$transaction([
          (prisma as any).post.updateMany({
            where: {
              authorId: viewerId,
              deleted: false,
              pinned: true,
              NOT: { id: normalizedPostId },
            },
            data: { pinned: false },
          }),
          (prisma as any).post.update({
            where: { id: normalizedPostId },
            data: { pinned: true },
          }),
        ]);
      }

      const pinnedPost = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        include: buildPostInclude(viewerId),
      });

      if (!pinnedPost || pinnedPost.deleted) {
        throw new Error("Post not found");
      }

      return mapPostForGraphQL(pinnedPost, viewerId);
    },
    togglePostComments: async (
      _: unknown,
      { postId }: TogglePostCommentsArgs,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const existingPost = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: {
          id: true,
          authorId: true,
          commentsDisabled: true,
          deleted: true,
        },
      });

      if (!existingPost || existingPost.deleted) {
        throw new Error("Post not found");
      }

      if (existingPost.authorId !== viewerId) {
        throw new Error("You can only change comments on your own posts");
      }

      const updatedPost = await prisma.post.update({
        where: { id: normalizedPostId },
        data: { commentsDisabled: !existingPost.commentsDisabled },
        include: buildPostInclude(viewerId),
      });

      return mapPostForGraphQL(updatedPost, viewerId);
    },
    markPostNotInterested: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const post = await prisma.post.findFirst({
        where: {
          id: normalizedPostId,
          ...buildVisiblePostWhere(),
        },
        select: { id: true, authorId: true },
      });

      if (!post) {
        throw new Error("Post not found");
      }

      if (post.authorId === viewerId) {
        throw new Error("You cannot hide your own post");
      }

      const viewer = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { uninterestedPostIds: true },
      });

      const uninterestedPostIds = Array.isArray(viewer?.uninterestedPostIds)
        ? viewer.uninterestedPostIds
        : [];

      if (!uninterestedPostIds.includes(normalizedPostId)) {
        await prisma.user.update({
          where: { id: viewerId },
          data: {
            uninterestedPostIds: {
              push: normalizedPostId,
            },
          },
        });
      }

      await recordFeedInteraction(viewerId, {
        postId: normalizedPostId,
        interactionType: "NOT_INTERESTED",
        signalKind: "negative",
      });

      return true;
    },
    trackFeedInteraction: async (
      _: unknown,
      { input }: { input: TrackFeedInteractionArgs },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      let isFirstLongViewToday = false;
      if (input.interactionType === "LONG_VIEW" && input.postId?.trim()) {
        const postId = input.postId.trim();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const existingToday = await (prisma as any).feedInteraction.findFirst({
          where: {
            userId: viewerId,
            postId,
            interactionType: "LONG_VIEW",
            createdAt: { gte: todayStart },
          },
          select: { id: true },
        });

        isFirstLongViewToday = !existingToday;
      }

      const result = await recordFeedInteraction(viewerId, input);

      if (input.interactionType === "LONG_VIEW") {
        checkAchievements(viewerId, "document_viewed_long").catch(() => null);

        if (isFirstLongViewToday && input.postId?.trim()) {
          const postId = input.postId.trim();

          const [updatedPost, redirect] = await Promise.all([
            (prisma as any).post.update({
              where: { id: postId },
              data: { viewCount: { increment: 1 } },
              select: { viewCount: true, authorId: true },
            }),
            prisma.revenueRedirect.findFirst({
              where: { sourcePostId: postId, active: true },
              select: { beneficiaryUserId: true },
            }),
          ]);

          const VIEWS_PER_TOKEN = 5;
          if (
            updatedPost?.authorId &&
            updatedPost.authorId !== viewerId &&
            updatedPost.viewCount % VIEWS_PER_TOKEN === 0
          ) {
            const recipientId = redirect?.beneficiaryUserId ?? updatedPost.authorId;
            const isRedirected = Boolean(redirect?.beneficiaryUserId);
            await (prisma as any).$transaction([
              (prisma as any).user.update({
                where: { id: recipientId },
                data: {
                  tokenBalance: { increment: 1 },
                  tokensEarned: { increment: 1 },
                },
              }),
              (prisma as any).tokenTransaction.create({
                data: {
                  userId: recipientId,
                  type: isRedirected ? "VIEW_EARN_REDIRECT" : "VIEW_EARN",
                  amount: 1,
                  postId,
                  description: isRedirected
                    ? `Revenue redirect: view #${updatedPost.viewCount} of post ${postId}`
                    : `Earned from view #${updatedPost.viewCount}`,
                },
              }),
            ]);
          }
        }
      }
      if (input.interactionType === "SHARE") {
        checkAchievements(viewerId, "post_shared").catch(() => null);
      }
      return result;
    },
    deletePost: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const existingPost = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: { id: true, authorId: true, deleted: true },
      });

      if (!existingPost || existingPost.deleted) {
        throw new Error("Post not found");
      }

      if (existingPost.authorId !== viewerId) {
        throw new Error("You can only delete your own posts");
      }

      await prisma.post.update({
        where: { id: normalizedPostId },
        data: {
          deleted: true,
          deletedAt: new Date(),
          pinned: false,
        },
      });

      return true;
    },
    restorePost: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const post = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: { id: true, authorId: true, deleted: true, deletedAt: true },
      });

      if (!post || !post.deleted) {
        throw new Error("Post not found in recently deleted");
      }

      if (post.authorId !== viewerId) {
        throw new Error("You can only restore your own posts");
      }

      if (post.deletedAt && post.deletedAt < cutoff) {
        throw new Error("Post has already expired and cannot be restored");
      }

      await prisma.post.update({
        where: { id: normalizedPostId },
        data: { deleted: false, deletedAt: null },
      });

      return true;
    },
    permanentlyDeletePost: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) {
        throw new Error("Post id is required");
      }

      const post = await prisma.post.findUnique({
        where: { id: normalizedPostId },
        select: { id: true, authorId: true, deleted: true },
      });

      if (!post || !post.deleted) {
        throw new Error("Post not found in recently deleted");
      }

      if (post.authorId !== viewerId) {
        throw new Error("You can only delete your own posts");
      }

      await hardDeletePost(normalizedPostId);

      return true;
    },
    togglePostLike: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          title: true,
          authorId: true,
          commentsDisabled: true,
          deleted: true,
        },
      });
      if (!post || post.deleted) {
        throw new Error("Post not found");
      }

      if (post.commentsDisabled && post.authorId !== viewerId) {
        throw new Error("Comments are disabled for this post");
      }

      const existingLike = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId: viewerId,
            postId,
          },
        },
      });

      if (existingLike) {
        await prisma.like.delete({
          where: {
            userId_postId: {
              userId: viewerId,
              postId,
            },
          },
        });

        if (post.authorId && post.authorId !== viewerId) {
          const latestLikeNotification = await (
            prisma as any
          ).notification.findFirst({
            where: {
              userId: post.authorId,
              actorId: viewerId,
              type: NOTIFICATION_TYPE.POST_LIKE,
            },
            select: { id: true },
            orderBy: { time: "desc" },
          });

          if (latestLikeNotification?.id) {
            await (prisma as any).notification.delete({
              where: { id: latestLikeNotification.id },
            });
          }
        }
      } else {
        await prisma.like.create({
          data: {
            userId: viewerId,
            postId,
          },
        });

        checkAchievements(viewerId, "like_given").catch(() => null);
        if (post.authorId) {
          checkAchievements(post.authorId, "post_liked_received").catch(() => null);
        }

        if (post.authorId && post.authorId !== viewerId) {
          const actor = await prisma.user.findUnique({
            where: { id: viewerId },
            select: { displayName: true, username: true, profilePicture: true },
          });
          const actorLabel =
            actor?.displayName?.trim() || actor?.username?.trim() || "Someone";
          const postTitle = post.title?.trim() || "Untitled post";

          await createNotification({
            userId: post.authorId,
            actorId: viewerId,
            postId,
            type: NOTIFICATION_TYPE.POST_LIKE,
            title: `${actorLabel} liked your post`,
            description: postTitle,
            icon: NOTIFICATION_ICON.POST_LIKE,
            profilePicture: actor?.profilePicture,
          });
        }

        await recordFeedInteraction(viewerId, {
          postId,
          interactionType: "LIKE",
          signalKind: "positive",
        });
      }

      const updatedPost = await prisma.post.findUnique({
        where: { id: postId },
        include: buildPostInclude(viewerId),
      });
      if (!updatedPost || updatedPost.deleted) {
        throw new Error("Post not found");
      }

      const mappedPost = mapPostForGraphQL(updatedPost, viewerId);

      emitPostActivity({
        postId,
        reason: "post-like",
        postLikeCount: mappedPost.likeCount ?? 0,
        commentCount: mappedPost.commentCount ?? 0,
      });

      return mappedPost;
    },
    createComment: async (
      _: unknown,
      {
        postId,
        content,
        parentCommentId,
      }: {
        postId: string;
        content: string;
        parentCommentId?: string | null;
      },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedContent = content?.trim();
      if (!normalizedContent) {
        throw new Error("Comment content is required");
      }
      if (normalizedContent.length > 2000) {
        throw new Error("Comment content cannot exceed 2000 characters");
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, title: true, deleted: true, authorId: true },
      });
      if (!post || post.deleted) {
        throw new Error("Post not found");
      }

      const normalizedParentCommentId = parentCommentId?.trim() || null;
      if (normalizedParentCommentId) {
        const parentComment = await (prisma as any).comment.findUnique({
          where: { id: normalizedParentCommentId },
          select: { id: true, postId: true },
        });
        if (!parentComment) {
          throw new Error("Parent comment not found");
        }
        if (parentComment.postId !== postId) {
          throw new Error("Parent comment does not belong to this post");
        }
      }

      const comment = await (prisma as any).comment.create({
        data: {
          postId,
          authorId: viewerId,
          parentId: normalizedParentCommentId,
          content: normalizedContent,
        },
        include: buildCommentInclude(viewerId),
      });

      checkAchievements(viewerId, "comment_given").catch(() => null);

      await recordFeedInteraction(viewerId, {
        postId,
        interactionType: normalizedParentCommentId
          ? "COMMENT_REPLY"
          : "COMMENT",
        signalKind: "positive",
      });

      if (post.authorId && post.authorId !== viewerId) {
        const actor = await prisma.user.findUnique({
          where: { id: viewerId },
          select: { displayName: true, username: true, profilePicture: true },
        });
        const actorLabel =
          actor?.displayName?.trim() || actor?.username?.trim() || "Someone";

        await createNotification({
          userId: post.authorId,
          actorId: viewerId,
          postId,
          commentId: comment.id,
          type: NOTIFICATION_TYPE.COMMENT,
          title: normalizedParentCommentId
            ? `${actorLabel} replied on your post`
            : `${actorLabel} commented on your post`,
          description: normalizedContent,
          icon: NOTIFICATION_ICON.COMMENT,
          profilePicture: actor?.profilePicture,
        });
      }

      // Parse @mentions and send notifications
      const mentionMatches = normalizedContent.match(/@([A-Za-z0-9._]+)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const mentionedUsernames = [
          ...new Set(mentionMatches.map((m) => m.slice(1).toLowerCase())),
        ].slice(0, 10);

        const mentionedUsers = await prisma.user.findMany({
          where: {
            username: { in: mentionedUsernames, mode: "insensitive" },
            deleted: false,
            disabled: false,
          },
          select: { id: true, username: true },
        });

        const actor =
          (await prisma.user.findUnique({
            where: { id: viewerId },
            select: {
              displayName: true,
              username: true,
              profilePicture: true,
            },
          })) ?? null;
        const actorLabel =
          actor?.displayName?.trim() || actor?.username?.trim() || "Someone";

        for (const mentionedUser of mentionedUsers) {
          if (
            mentionedUser.id === viewerId ||
            mentionedUser.id === post.authorId
          ) {
            continue;
          }

          await createNotification({
            userId: mentionedUser.id,
            actorId: viewerId,
            postId,
            commentId: comment.id,
            type: NOTIFICATION_TYPE.MENTION,
            title: `${actorLabel} mentioned you in a comment`,
            description: normalizedContent,
            icon: NOTIFICATION_ICON.MENTION,
            profilePicture: actor?.profilePicture,
          });
        }
      }

      const mappedComment = mapCommentForGraphQL(comment, viewerId);
      const commentCount = await (prisma as any).comment.count({
        where: { postId },
      });
      const replyCount = normalizedParentCommentId
        ? await (prisma as any).comment.count({
            where: { parentId: normalizedParentCommentId },
          })
        : undefined;

      emitPostActivity({
        postId,
        reason: "comment-created",
        commentId: mappedComment.id,
        parentCommentId: mappedComment.parentId ?? null,
        commentCount,
        commentLikeCount: mappedComment.likeCount ?? 0,
        ...(typeof replyCount === "number" ? { replyCount } : {}),
      });

      return mappedComment;
    },
    toggleCommentLike: async (
      _: unknown,
      { commentId }: { commentId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const comment = await (prisma as any).comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, postId: true, content: true },
      });
      if (!comment) {
        throw new Error("Comment not found");
      }

      const hiddenCommentAuthorIds = await getPrivateCommentAuthorIds(viewerId);
      const commentPost = await (prisma as any).post.findUnique({
        where: { id: comment.postId },
        select: { authorId: true },
      });
      if (
        hiddenCommentAuthorIds.includes(comment.authorId) &&
        commentPost?.authorId !== viewerId
      ) {
        throw new Error("Comment not found");
      }

      const existingLike = await (prisma as any).commentLike.findUnique({
        where: {
          userId_commentId: {
            userId: viewerId,
            commentId,
          },
        },
      });

      if (existingLike) {
        await (prisma as any).commentLike.delete({
          where: {
            userId_commentId: {
              userId: viewerId,
              commentId,
            },
          },
        });

        if (comment.authorId && comment.authorId !== viewerId) {
          const latestLikeNotification = await (
            prisma as any
          ).notification.findFirst({
            where: {
              userId: comment.authorId,
              actorId: viewerId,
              type: NOTIFICATION_TYPE.COMMENT_LIKE,
            },
            select: { id: true },
            orderBy: { time: "desc" },
          });

          if (latestLikeNotification?.id) {
            await (prisma as any).notification.delete({
              where: { id: latestLikeNotification.id },
            });
          }
        }
      } else {
        await (prisma as any).commentLike.create({
          data: {
            userId: viewerId,
            commentId,
          },
        });

        if (comment.authorId && comment.authorId !== viewerId) {
          const actor = await prisma.user.findUnique({
            where: { id: viewerId },
            select: { displayName: true, username: true, profilePicture: true },
          });
          const actorLabel =
            actor?.displayName?.trim() || actor?.username?.trim() || "Someone";
          const commentPreview = comment.content?.trim() || "Your comment";

          await createNotification({
            userId: comment.authorId,
            actorId: viewerId,
            postId: comment.postId,
            commentId,
            type: NOTIFICATION_TYPE.COMMENT_LIKE,
            title: `${actorLabel} liked your comment`,
            description: commentPreview,
            icon: NOTIFICATION_ICON.COMMENT_LIKE,
            profilePicture: actor?.profilePicture,
          });
        }
      }

      const updatedComment = await (prisma as any).comment.findUnique({
        where: { id: commentId },
        include: buildCommentInclude(viewerId),
      });
      if (!updatedComment) {
        throw new Error("Comment not found");
      }

      const mappedComment = mapCommentForGraphQL(updatedComment, viewerId);

      emitPostActivity({
        postId: comment.postId,
        reason: "comment-like",
        commentId,
        parentCommentId: mappedComment.parentId ?? null,
        commentLikeCount: mappedComment.likeCount ?? 0,
      });

      return mappedComment;
    },

    deleteComment: async (
      _: unknown,
      { commentId }: { commentId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const comment = await (prisma as any).comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, postId: true },
      });
      if (!comment) {
        throw new Error("Comment not found");
      }

      const post = await prisma.post.findUnique({
        where: { id: comment.postId },
        select: { authorId: true },
      });

      const isCommentAuthor = comment.authorId === viewerId;
      const isPostOwner = post?.authorId === viewerId;
      if (!isCommentAuthor && !isPostOwner) {
        throw new Error("Not authorized to delete this comment");
      }

      await (prisma as any).comment.delete({ where: { id: commentId } });

      const commentCount = await (prisma as any).comment.count({
        where: { postId: comment.postId },
      });

      emitPostActivity({
        postId: comment.postId,
        reason: "comment-deleted",
        commentId,
        commentCount,
      });

      return true;
    },

    editComment: async (
      _: unknown,
      { commentId, content }: { commentId: string; content: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedContent = content?.trim();
      if (!normalizedContent) {
        throw new Error("Comment content is required");
      }
      if (normalizedContent.length > 2000) {
        throw new Error("Comment content cannot exceed 2000 characters");
      }

      const comment = await (prisma as any).comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, postId: true },
      });
      if (!comment) {
        throw new Error("Comment not found");
      }
      if (comment.authorId !== viewerId) {
        throw new Error("Not authorized to edit this comment");
      }

      const updated = await (prisma as any).comment.update({
        where: { id: commentId },
        data: { content: normalizedContent },
        include: buildCommentInclude(viewerId),
      });

      emitPostActivity({
        postId: comment.postId,
        reason: "comment-edited",
        commentId,
      });

      return mapCommentForGraphQL(updated, viewerId);
    },

    reportComment: async (
      _: unknown,
      { commentId, reason }: { commentId: string; reason: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const comment = await (prisma as any).comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, content: true },
      });
      if (!comment) {
        throw new Error("Comment not found");
      }
      if (comment.authorId === viewerId) {
        throw new Error("Cannot report your own comment");
      }

      const normalizedReason = reason?.trim() || "No reason provided";
      const contentPreview = (comment.content as string)?.slice(0, 200) || "";

      await prisma.report.create({
        data: {
          userId: viewerId,
          category: "content",
          title: "Comment report",
          description: `Comment ID: ${commentId}\nReason: ${normalizedReason}\nContent: ${contentPreview}`,
        },
      });

      return true;
    },
  },
  Post: {
    author: (post: any) => sanitizeAuthorIdentity(post.author),
    fileUrl: async (post: any) => {
      const rawFileUrl = post.fileUrl?.trim();
      if (!rawFileUrl) {
        return rawFileUrl;
      }

      const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
      if (!privateBucket) {
        return rawFileUrl;
      }

      const key = extractS3Key(rawFileUrl);
      if (!key) {
        return rawFileUrl;
      }

      try {
        return await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: privateBucket,
            Key: key,
          }),
          { expiresIn: POST_FILE_SIGNED_URL_TTL_SECONDS },
        );
      } catch {
        return rawFileUrl;
      }
    },
    thumbnailUrl: (post: any) => post.thumbnailUrl?.trim() || null,
    likeCount: (post: any) => post.likeCount ?? post?._count?.likes ?? 0,
    commentCount: (post: any) =>
      post.commentCount ?? post?._count?.comments ?? 0,
    commentsDisabled: (post: any) => Boolean(post.commentsDisabled),
    comments: async (
      post: { id: string },
      { limit = 20, offset = 0 }: { limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);
      const hiddenCommentAuthorIds = await getPrivateCommentAuthorIds(viewerId);

      const comments = await (prisma as any).comment.findMany({
        where: {
          postId: post.id,
          parentId: null,
          ...(hiddenCommentAuthorIds.length > 0
            ? {
                OR: [
                  {
                    authorId: {
                      notIn: hiddenCommentAuthorIds,
                    },
                  },
                  ...(viewerId
                    ? [
                        {
                          post: {
                            authorId: viewerId,
                          },
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
        include: buildCommentInclude(viewerId),
        orderBy: { createdAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
      });

      return comments.map((comment: any) =>
        mapCommentForGraphQL(comment, viewerId),
      );
    },
    viewerHasLiked: (post: any) => Boolean(post.viewerHasLiked),
    pinned: (post: any) => Boolean(post.pinned),
  },
  Comment: {
    post: async (comment: any) => {
      if (comment.post) {
        return mapPostForGraphQL(comment.post);
      }

      const post = await prisma.post.findUnique({
        where: { id: comment.postId },
        include: buildPostInclude(),
      });
      if (!post || post.deleted) {
        throw new Error("Post not found");
      }

      return mapPostForGraphQL(post);
    },
    author: (comment: any) => sanitizeAuthorIdentity(comment.author),
    parentId: (comment: any) => comment.parentId ?? null,
    parent: async (comment: any, _: unknown, ctx: GraphQLContext) => {
      if (!comment.parentId) {
        return null;
      }
      if (comment.parent) {
        return mapCommentForGraphQL(comment.parent, ctx.user?.sub);
      }

      const parentComment = await (prisma as any).comment.findUnique({
        where: { id: comment.parentId },
        include: buildCommentInclude(ctx.user?.sub),
      });
      if (!parentComment) {
        return null;
      }

      const hiddenCommentAuthorIds = await getPrivateCommentAuthorIds(
        ctx.user?.sub,
      );
      if (
        hiddenCommentAuthorIds.length > 0 &&
        hiddenCommentAuthorIds.includes(parentComment.authorId) &&
        parentComment.post?.authorId !== ctx.user?.sub
      ) {
        return null;
      }

      return mapCommentForGraphQL(parentComment, ctx.user?.sub);
    },
    replies: async (
      comment: { id: string },
      { limit = 20, offset = 0 }: { limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);
      const hiddenCommentAuthorIds = await getPrivateCommentAuthorIds(viewerId);

      const replies = await (prisma as any).comment.findMany({
        where: {
          parentId: comment.id,
          ...(hiddenCommentAuthorIds.length > 0
            ? {
                OR: [
                  {
                    authorId: {
                      notIn: hiddenCommentAuthorIds,
                    },
                  },
                  ...(viewerId
                    ? [
                        {
                          post: {
                            authorId: viewerId,
                          },
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
        include: buildCommentInclude(viewerId),
        orderBy: { createdAt: "asc" },
        take: safeLimit,
        skip: safeOffset,
      });

      return replies.map((reply: any) => mapCommentForGraphQL(reply, viewerId));
    },
    replyCount: (comment: any) =>
      comment.replyCount ?? comment?._count?.replies ?? 0,
    likeCount: (comment: any) =>
      comment.likeCount ?? comment?._count?.commentLikes ?? 0,
    viewerHasLiked: (comment: any) => Boolean(comment.viewerHasLiked),
  },
  PostVersion: {
    editor: (version: any) => sanitizeAuthorIdentity(version.editor),
  },
};
