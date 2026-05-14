import { prisma } from "../../config/prisma.js";
import {
  createNotification,
  NOTIFICATION_TYPE,
  NOTIFICATION_ICON,
} from "../../services/notifications.js";

type GraphQLContext = {
  user?: { sub?: string };
};

const BOUNTY_AUTO_RELEASE_DAYS = 7;

// ─── Feed helpers ────────────────────────────────────────────────────────────

type RequestFeedSignals = {
  followingIds: Set<string>;
  categoryWeights: Map<string, number>;
  authorWeights: Map<string, number>;
  isNewUser: boolean;
};

function incWeight(
  map: Map<string, number>,
  key: string | null | undefined,
  delta: number,
) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + delta);
}

function addCatWeights(
  map: Map<string, number>,
  cats: string[] | null | undefined,
  weight: number,
) {
  for (const cat of cats ?? []) incWeight(map, cat, weight);
}

async function buildRequestFeedSignals(
  viewerId?: string,
): Promise<RequestFeedSignals> {
  if (!viewerId) {
    return {
      followingIds: new Set(),
      categoryWeights: new Map(),
      authorWeights: new Map(),
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
        select: { post: { select: { authorId: true, categories: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      comments: {
        select: { post: { select: { authorId: true, categories: true } } },
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
            select: { post: { select: { authorId: true, categories: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
      workspace: {
        select: {
          savedPosts: {
            select: { post: { select: { authorId: true, categories: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
  });

  const followingIds = new Set(
    (viewer?.followingRelations ?? []).map((r) => r.followingId),
  );
  const categoryWeights = new Map<string, number>();
  const authorWeights = new Map<string, number>();

  for (const r of viewer?.followingRelations ?? [])
    incWeight(authorWeights, r.followingId, 18);
  for (const l of viewer?.likes ?? []) {
    incWeight(authorWeights, l.post?.authorId, 8);
    addCatWeights(categoryWeights, l.post?.categories, 8);
  }
  for (const c of viewer?.comments ?? []) {
    incWeight(authorWeights, c.post?.authorId, 5);
    addCatWeights(categoryWeights, c.post?.categories, 5);
  }
  for (const s of viewer?.archive?.savedPosts ?? []) {
    incWeight(authorWeights, s.post?.authorId, 10);
    addCatWeights(categoryWeights, s.post?.categories, 10);
  }
  for (const s of viewer?.workspace?.savedPosts ?? []) {
    incWeight(authorWeights, s.post?.authorId, 10);
    addCatWeights(categoryWeights, s.post?.categories, 10);
  }
  for (const p of viewer?.posts ?? []) addCatWeights(categoryWeights, p.categories, 4);

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
    isNewUser: interactionCount < 5,
  };
}

function scoreRequestForFeed(
  request: any,
  viewerId: string | undefined,
  signals: RequestFeedSignals,
): number {
  let score = 0;

  // Follow boost — requests from people you follow surface first
  if (signals.followingIds.has(request.authorId)) score += 50;

  // Author affinity from post interactions
  score += Math.min(signals.authorWeights.get(request.authorId) ?? 0, 40);

  // Category interest match
  const cats: string[] = request.categories ?? [];
  const catScore = cats.reduce(
    (sum, cat) => sum + (signals.categoryWeights.get(cat) ?? 0),
    0,
  );
  score += Math.min(catScore, 60);

  // Bounty visibility boost (logarithmic so large bounties don't dominate)
  if (request.bounty) score += Math.min(20 + Math.log(request.bounty) * 3, 35);

  // Open > solved > closed
  if (!request.solved && !request.closed) score += 15;
  else if (request.closed) score -= 20;

  // Freshness decay over 1 week
  const ageHours =
    (Date.now() - new Date(request.createdAt).getTime()) / 3_600_000;
  score += Math.max(0, (168 - ageHours) / 168) * 25;

  // Slight exploration boost for new users with no signals
  if (signals.isNewUser && cats.length > 0) score += 8;

  // Mild own-request penalty so the requester doesn't always see their own at top
  if (request.authorId === viewerId) score -= 10;

  return score;
}

export const DocumentRequestResolver = {
  Query: {
    documentRequest: async (
      _: unknown,
      { id }: { id: string },
      _ctx: GraphQLContext,
    ) => {
      const normalized = id?.trim();
      if (!normalized) throw new Error("Request id is required.");

      return prisma.documentRequest.findFirst({
        where: { id: normalized, deleted: false },
      });
    },

    documentRequests: async (
      _: unknown,
      {
        filter,
        feed = false,
        limit = 20,
        offset = 0,
      }: { filter?: string; feed?: boolean; limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      const safeLimit = Math.max(1, Math.min(limit ?? 20, 100));
      const safeOffset = Math.max(0, offset ?? 0);

      if (feed) {
        const viewerId = ctx.user?.sub;
        const poolSize = Math.min(safeLimit * 4 + safeOffset, 300);

        const [signals, candidates, total] = await Promise.all([
          buildRequestFeedSignals(viewerId),
          prisma.documentRequest.findMany({
            where: { deleted: false },
            orderBy: { createdAt: "desc" },
            take: poolSize,
          }),
          prisma.documentRequest.count({ where: { deleted: false } }),
        ]);

        const scored = candidates
          .map((r) => ({ r, score: scoreRequestForFeed(r, viewerId, signals) }))
          .sort((a, b) => b.score - a.score);

        const page = scored.slice(safeOffset, safeOffset + safeLimit).map((s) => s.r);

        return {
          requests: page,
          total,
          hasMore: safeOffset + page.length < total,
        };
      }

      const where: Record<string, unknown> = { deleted: false };

      if (filter === "open") {
        where.solved = false;
        where.closed = false;
      } else if (filter === "fulfilled") {
        where.solved = true;
      }

      const [requests, total] = await Promise.all([
        prisma.documentRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: safeLimit,
          skip: safeOffset,
        }),
        prisma.documentRequest.count({ where }),
      ]);

      return {
        requests,
        total,
        hasMore: safeOffset + requests.length < total,
      };
    },
  },

  Mutation: {
    createDocumentRequest: async (
      _: unknown,
      {
        title,
        description,
        categories,
        bounty,
      }: {
        title: string;
        description: string;
        categories: string[];
        bounty?: number | null;
      },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const trimmedTitle = title?.trim();
      const trimmedDesc = description?.trim();
      if (!trimmedTitle) throw new Error("Title is required.");
      if (!trimmedDesc) throw new Error("Description is required.");

      const normalizedBounty =
        typeof bounty === "number" && bounty > 0 ? Math.round(bounty) : null;

      if (normalizedBounty !== null) {
        const user = await prisma.user.findUnique({
          where: { id: viewerId },
          select: { tokenBalance: true },
        });
        if (!user) throw new Error("User not found.");
        if (user.tokenBalance < normalizedBounty) {
          throw new Error("Insufficient token balance for this bounty.");
        }

        const [request] = await prisma.$transaction([
          prisma.documentRequest.create({
            data: {
              authorId: viewerId,
              title: trimmedTitle,
              description: trimmedDesc,
              categories,
              bounty: normalizedBounty,
              bountyEscrowedAt: new Date(),
            },
          }),
          prisma.user.update({
            where: { id: viewerId },
            data: {
              tokenBalance: { decrement: normalizedBounty },
              tokensRedeemed: { increment: normalizedBounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: viewerId,
              type: "REQUEST_BOUNTY_ESCROW",
              amount: -normalizedBounty,
              description: `Bounty escrow: "${trimmedTitle}"`,
            },
          }),
        ]);

        return request;
      }

      return prisma.documentRequest.create({
        data: {
          authorId: viewerId,
          title: trimmedTitle,
          description: trimmedDesc,
          categories,
        },
      });
    },

    fulfillDocumentRequest: async (
      _: unknown,
      { requestId, postId }: { requestId: string; postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const [request, post] = await Promise.all([
        prisma.documentRequest.findFirst({
          where: { id: requestId, deleted: false },
          select: { id: true, authorId: true, solved: true, closed: true, title: true },
        }),
        prisma.post.findFirst({
          where: { id: postId, deleted: false },
          select: { id: true, authorId: true },
        }),
      ]);

      if (!request) throw new Error("Request not found.");
      if (request.solved || request.closed) {
        throw new Error("This request is no longer accepting fulfillments.");
      }
      if (!post) throw new Error("Post not found.");
      if (post.authorId !== viewerId) {
        throw new Error("You can only fulfill with your own posts.");
      }
      if (request.authorId === viewerId) {
        throw new Error("You cannot fulfill your own request.");
      }

      const existing = await prisma.documentRequestFulfillment.findUnique({
        where: { requestId_postId: { requestId, postId } },
      });
      if (existing) throw new Error("This post already fulfills this request.");

      const fulfillment = await prisma.documentRequestFulfillment.create({
        data: { requestId, postId, authorId: viewerId },
      });

      const requester = await prisma.user.findUnique({
        where: { id: request.authorId },
        select: { profilePicture: true },
      });

      await createNotification({
        userId: request.authorId,
        actorId: viewerId,
        requestId,
        type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_FULFILLED,
        title: "New fulfillment on your request",
        description: `Someone submitted a document for "${request.title}"`,
        icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
        profilePicture: requester?.profilePicture ?? null,
      });

      return fulfillment;
    },

    acceptFulfillment: async (
      _: unknown,
      { fulfillmentId }: { fulfillmentId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const fulfillment = await prisma.documentRequestFulfillment.findUnique({
        where: { id: fulfillmentId },
        select: { id: true, requestId: true, authorId: true },
      });
      if (!fulfillment) throw new Error("Fulfillment not found.");

      const request = await prisma.documentRequest.findFirst({
        where: { id: fulfillment.requestId, deleted: false },
        select: {
          id: true,
          authorId: true,
          bounty: true,
          solved: true,
          closed: true,
          title: true,
        },
      });
      if (!request) throw new Error("Request not found.");
      if (request.authorId !== viewerId) {
        throw new Error("Only the request author can accept a fulfillment.");
      }
      if (request.solved) throw new Error("A fulfillment has already been accepted.");
      if (request.closed) throw new Error("This request is closed.");

      const contributor = await prisma.user.findUnique({
        where: { id: fulfillment.authorId },
        select: { profilePicture: true },
      });

      if (request.bounty) {
        const [updatedRequest] = await prisma.$transaction([
          prisma.documentRequest.update({
            where: { id: request.id },
            data: {
              solved: true,
              acceptedFulfillmentId: fulfillmentId,
              bountyReleasedAt: new Date(),
            },
          }),
          prisma.user.update({
            where: { id: fulfillment.authorId },
            data: {
              tokenBalance: { increment: request.bounty },
              tokensEarned: { increment: request.bounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: fulfillment.authorId,
              type: "REQUEST_BOUNTY_RELEASE",
              amount: request.bounty,
              description: `Bounty award: "${request.title}"`,
            },
          }),
        ]);

        await createNotification({
          userId: fulfillment.authorId,
          actorId: viewerId,
          requestId: request.id,
          type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_ACCEPTED,
          title: "Your fulfillment was accepted!",
          description: `You earned ${request.bounty} tokens for fulfilling "${request.title}"`,
          icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
          profilePicture: contributor?.profilePicture ?? null,
        });

        return updatedRequest;
      }

      const updatedRequest = await prisma.documentRequest.update({
        where: { id: request.id },
        data: { solved: true, acceptedFulfillmentId: fulfillmentId },
      });

      await createNotification({
        userId: fulfillment.authorId,
        actorId: viewerId,
        requestId: request.id,
        type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_ACCEPTED,
        title: "Your fulfillment was accepted!",
        description: `Your document was accepted for "${request.title}"`,
        icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
        profilePicture: contributor?.profilePicture ?? null,
      });

      return updatedRequest;
    },

    toggleFulfillmentLike: async (
      _: unknown,
      { fulfillmentId }: { fulfillmentId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const fulfillment = await prisma.documentRequestFulfillment.findUnique({
        where: { id: fulfillmentId },
        select: { id: true, authorId: true, requestId: true, likeCount: true },
      });
      if (!fulfillment) throw new Error("Fulfillment not found.");

      const existing = await prisma.documentRequestFulfillmentLike.findUnique({
        where: { userId_fulfillmentId: { userId: viewerId, fulfillmentId } },
      });

      if (existing) {
        await prisma.$transaction([
          prisma.documentRequestFulfillmentLike.delete({
            where: { userId_fulfillmentId: { userId: viewerId, fulfillmentId } },
          }),
          prisma.documentRequestFulfillment.update({
            where: { id: fulfillmentId },
            data: { likeCount: { decrement: 1 } },
          }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.documentRequestFulfillmentLike.create({
            data: { userId: viewerId, fulfillmentId },
          }),
          prisma.documentRequestFulfillment.update({
            where: { id: fulfillmentId },
            data: { likeCount: { increment: 1 } },
          }),
        ]);

        if (fulfillment.authorId !== viewerId) {
          const liker = await prisma.user.findUnique({
            where: { id: viewerId },
            select: { profilePicture: true },
          });
          await createNotification({
            userId: fulfillment.authorId,
            actorId: viewerId,
            requestId: fulfillment.requestId,
            type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_FULFILLMENT_LIKED,
            title: "Someone liked your fulfillment",
            description: "Your submitted document received a like",
            icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
            profilePicture: liker?.profilePicture ?? null,
          });
        }
      }

      return prisma.documentRequestFulfillment.findUnique({
        where: { id: fulfillmentId },
      });
    },

    closeDocumentRequest: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const request = await prisma.documentRequest.findFirst({
        where: { id, deleted: false },
        select: {
          id: true,
          authorId: true,
          bounty: true,
          solved: true,
          closed: true,
          title: true,
        },
      });
      if (!request) throw new Error("Request not found.");
      if (request.authorId !== viewerId) {
        throw new Error("Only the request author can close it.");
      }
      if (request.closed) throw new Error("Request is already closed.");
      if (request.solved) throw new Error("Cannot close an already solved request.");

      const fulfillments = await prisma.documentRequestFulfillment.findMany({
        where: { requestId: id },
        select: { authorId: true },
      });
      const uniqueContributorIds = [
        ...new Set(fulfillments.map((f) => f.authorId).filter((a) => a !== viewerId)),
      ];

      if (request.bounty) {
        const [updatedRequest] = await prisma.$transaction([
          prisma.documentRequest.update({
            where: { id },
            data: { closed: true, bountyReleasedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: viewerId },
            data: {
              tokenBalance: { increment: request.bounty },
              tokensRedeemed: { decrement: request.bounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: viewerId,
              type: "REQUEST_BOUNTY_REFUND",
              amount: request.bounty,
              description: `Bounty refund: "${request.title}"`,
            },
          }),
        ]);

        await Promise.allSettled(
          uniqueContributorIds.map((contributorId) =>
            createNotification({
              userId: contributorId,
              actorId: viewerId,
              requestId: id,
              type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_CLOSED,
              title: "A request you responded to was closed",
              description: `The request "${request.title}" was closed by the author`,
              icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
            }),
          ),
        );

        return updatedRequest;
      }

      const updatedRequest = await prisma.documentRequest.update({
        where: { id },
        data: { closed: true },
      });

      await Promise.allSettled(
        uniqueContributorIds.map((contributorId) =>
          createNotification({
            userId: contributorId,
            actorId: viewerId,
            requestId: id,
            type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_CLOSED,
            title: "A request you responded to was closed",
            description: `The request "${request.title}" was closed by the author`,
            icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
          }),
        ),
      );

      return updatedRequest;
    },

    deleteDocumentRequest: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const request = await prisma.documentRequest.findFirst({
        where: { id, deleted: false },
        select: { id: true, authorId: true, bounty: true, solved: true, title: true },
      });
      if (!request) throw new Error("Request not found.");
      if (request.authorId !== viewerId) {
        throw new Error("Only the request author can delete it.");
      }

      // Refund escrow if bounty was not yet released
      if (request.bounty && !request.solved) {
        await prisma.$transaction([
          prisma.documentRequest.update({
            where: { id },
            data: { deleted: true, deletedAt: new Date(), bountyReleasedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: viewerId },
            data: {
              tokenBalance: { increment: request.bounty },
              tokensRedeemed: { decrement: request.bounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: viewerId,
              type: "REQUEST_BOUNTY_REFUND",
              amount: request.bounty,
              description: `Bounty refund (deleted): "${request.title}"`,
            },
          }),
        ]);
      } else {
        await prisma.documentRequest.update({
          where: { id },
          data: { deleted: true, deletedAt: new Date() },
        });
      }

      return true;
    },
  },

  DocumentRequest: {
    author: async (parent: { authorId: string }) => {
      return prisma.user.findUnique({ where: { id: parent.authorId } });
    },

    fulfillments: async (parent: { id: string }) => {
      return prisma.documentRequestFulfillment.findMany({
        where: { requestId: parent.id },
        orderBy: [{ likeCount: "desc" }, { createdAt: "asc" }],
      });
    },

    acceptedFulfillment: async (
      parent: { acceptedFulfillmentId?: string | null },
    ) => {
      if (!parent.acceptedFulfillmentId) return null;
      return prisma.documentRequestFulfillment.findUnique({
        where: { id: parent.acceptedFulfillmentId },
      });
    },

    responseCount: async (parent: { id: string }) => {
      return prisma.documentRequestFulfillment.count({
        where: { requestId: parent.id },
      });
    },

    viewerHasFulfilled: async (
      parent: { id: string },
      _: unknown,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) return false;
      const fulfillment = await prisma.documentRequestFulfillment.findFirst({
        where: { requestId: parent.id, authorId: viewerId },
        select: { id: true },
      });
      return fulfillment !== null;
    },

    viewerIsAuthor: (parent: { authorId: string }, _: unknown, ctx: GraphQLContext) => {
      return parent.authorId === ctx.user?.sub;
    },

    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),

    bountyEscrowedAt: (parent: { bountyEscrowedAt?: Date | null }) =>
      parent.bountyEscrowedAt?.toISOString() ?? null,

    bountyReleasedAt: (parent: { bountyReleasedAt?: Date | null }) =>
      parent.bountyReleasedAt?.toISOString() ?? null,
  },

  DocumentRequestFulfillment: {
    author: async (parent: { authorId: string }) => {
      return prisma.user.findUnique({ where: { id: parent.authorId } });
    },

    post: async (parent: { postId: string }) => {
      return prisma.post.findUnique({ where: { id: parent.postId } });
    },

    isAccepted: async (
      parent: { id: string; requestId: string },
    ) => {
      const request = await prisma.documentRequest.findUnique({
        where: { id: parent.requestId },
        select: { acceptedFulfillmentId: true },
      });
      return request?.acceptedFulfillmentId === parent.id;
    },

    viewerHasLiked: async (
      parent: { id: string },
      _: unknown,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) return false;
      const like = await prisma.documentRequestFulfillmentLike.findUnique({
        where: {
          userId_fulfillmentId: { userId: viewerId, fulfillmentId: parent.id },
        },
        select: { userId: true },
      });
      return like !== null;
    },

    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },
};
