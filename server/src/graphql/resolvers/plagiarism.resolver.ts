import { prisma } from "../../config/prisma.js";
import { createCaseEvent } from "../../services/plagiarism-case.service.js";
import { ChunkRepository } from "../../services/plagiarism/database/chunk-repository.js";

const chunkRepo = new ChunkRepository(prisma as any);

type GraphQLContext = {
  user?: { sub?: string };
  isAdmin?: boolean;
};

const isoDate = (d: Date | null | undefined) => d?.toISOString() ?? null;

const formatCase = (c: any, viewerRole: string) => ({
  id: c.id,
  originalPost: c.originalPost,
  suspectedPost: c.suspectedPost,
  similarityScore: c.similarityScore,
  verdict: c.verdict,
  status: c.status,
  matchedChunkCount: c.matchedChunkCount,
  totalChunkCount: c.totalChunkCount,
  revenueRedirectEnabled: c.revenueRedirectEnabled,
  matchSummaryJson: JSON.stringify(c.matchSummaryJson ?? {}),
  moderatorNote: c.moderatorNote ?? null,
  resolvedAt: isoDate(c.resolvedAt),
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  viewerRole,
  revenueRedirect: c.revenueRedirect ?? null,
  events: (c.events ?? []).map((e: any) => ({
    id: e.id,
    caseId: e.caseId,
    type: e.type,
    description: e.description,
    actorId: e.actorId ?? null,
    metadata: e.metadata ? JSON.stringify(e.metadata) : null,
    createdAt: e.createdAt.toISOString(),
  })),
  appeals: (c.appeals ?? []).map((a: any) => ({
    id: a.id,
    caseId: a.caseId,
    userId: a.userId,
    reason: a.reason,
    status: a.status,
    response: a.response ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  })),
});

const fetchCaseWithAccess = async (id: string, viewerId: string, isAdmin: boolean) => {
  const c = await prisma.plagiarismCase.findUnique({
    where: { id },
    include: {
      originalPost: {
        select: { id: true, title: true, thumbnailUrl: true, authorId: true, viewCount: true, isFree: true, price: true, createdAt: true },
      },
      suspectedPost: {
        select: { id: true, title: true, thumbnailUrl: true, authorId: true, viewCount: true, isFree: true, price: true, createdAt: true },
      },
      revenueRedirect: { select: { active: true, redirectPercentage: true, beneficiaryUserId: true } },
      events: { orderBy: { createdAt: "asc" } },
      appeals: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!c) throw new Error("Case not found.");

  const isOriginalAuthor = c.originalPost.authorId === viewerId;
  const isSuspectedCopier = c.suspectedPost.authorId === viewerId;

  if (!isOriginalAuthor && !isSuspectedCopier && !isAdmin) {
    throw new Error("Access denied.");
  }

  let viewerRole = "NONE";
  if (isAdmin) viewerRole = "MODERATOR";
  else if (isOriginalAuthor) viewerRole = "ORIGINAL_AUTHOR";
  else if (isSuspectedCopier) viewerRole = "SUSPECTED_COPIER";

  // Resolve author usernames for both posts
  const authorIds = [c.originalPost.authorId, c.suspectedPost.authorId].filter(Boolean) as string[];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, username: true } })
    : [];
  const usernameById = new Map(authors.map((u) => [u.id, u.username]));

  const enrichPost = (post: any) => ({
    ...post,
    authorUsername: post.authorId ? (usernameById.get(post.authorId) ?? null) : null,
    createdAt: post.createdAt.toISOString(),
  });

  return formatCase(
    { ...c, originalPost: enrichPost(c.originalPost), suspectedPost: enrichPost(c.suspectedPost) },
    viewerRole,
  );
};

export const PlagiarismResolver = {
  Query: {
    plagiarismCase: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");
      return fetchCaseWithAccess(id, viewerId, Boolean(ctx.isAdmin));
    },

    plagiarismCaseComparison: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const c = await prisma.plagiarismCase.findUnique({
        where: { id },
        select: {
          originalPost: { select: { id: true, authorId: true } },
          suspectedPost: { select: { id: true, authorId: true } },
          matchSummaryJson: true,
        },
      });

      if (!c) throw new Error("Case not found.");

      const isOriginalAuthor = c.originalPost.authorId === viewerId;
      const isSuspectedCopier = c.suspectedPost.authorId === viewerId;
      if (!isOriginalAuthor && !isSuspectedCopier && !ctx.isAdmin) {
        throw new Error("Access denied.");
      }

      const summary = c.matchSummaryJson as {
        chunkMatches?: Array<{
          newChunkIndex: number;
          matchedChunkId: string;
          matchedPostId: string;
          matchType: string;
          similarity: number;
        }>;
      };

      const chunkMatches = summary?.chunkMatches ?? [];

      const [originalChunks, suspectedChunks] = await Promise.all([
        chunkRepo.getChunksWithText(c.originalPost.id),
        chunkRepo.getChunksWithText(c.suspectedPost.id),
      ]);

      // Map matchedChunkId → originalChunkIndex
      const matchedChunkIds = chunkMatches.map((m) => m.matchedChunkId);
      const originalIdToIndex = new Map(
        (await chunkRepo.getChunkIndicesByIds(matchedChunkIds)).map((r) => [r.id, r.chunkIndex]),
      );

      // Build per-index lookup for suspected chunks: index → match info
      const suspectedMatchByIndex = new Map(
        chunkMatches.map((m) => [
          m.newChunkIndex,
          {
            matchedIndex: originalIdToIndex.get(m.matchedChunkId) ?? null,
            similarity: m.similarity,
            matchType: m.matchType,
          },
        ]),
      );

      // Build per-index lookup for original chunks: index → match info (from suspected side)
      const originalMatchByIndex = new Map<number, { matchedIndex: number; similarity: number; matchType: string }>();
      for (const m of chunkMatches) {
        const origIdx = originalIdToIndex.get(m.matchedChunkId);
        if (origIdx != null) {
          originalMatchByIndex.set(origIdx, {
            matchedIndex: m.newChunkIndex,
            similarity: m.similarity,
            matchType: m.matchType,
          });
        }
      }

      return {
        originalChunks: originalChunks.map((ch) => {
          const match = originalMatchByIndex.get(ch.chunkIndex);
          return {
            index: ch.chunkIndex,
            text: ch.text,
            chunkType: ch.chunkType,
            wordCount: ch.wordCount,
            isMatched: Boolean(match),
            matchedIndex: match?.matchedIndex ?? null,
            similarity: match?.similarity ?? null,
            matchType: match?.matchType ?? null,
          };
        }),
        suspectedChunks: suspectedChunks.map((ch) => {
          const match = suspectedMatchByIndex.get(ch.chunkIndex);
          return {
            index: ch.chunkIndex,
            text: ch.text,
            chunkType: ch.chunkType,
            wordCount: ch.wordCount,
            isMatched: Boolean(match),
            matchedIndex: match?.matchedIndex ?? null,
            similarity: match?.similarity ?? null,
            matchType: match?.matchType ?? null,
          };
        }),
      };
    },
  },

  Mutation: {
    submitCaseAppeal: async (
      _: unknown,
      { caseId, reason }: { caseId: string; reason: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const trimmedReason = reason?.trim();
      if (!trimmedReason || trimmedReason.length < 20) {
        throw new Error("Appeal reason must be at least 20 characters.");
      }

      const c = await prisma.plagiarismCase.findUnique({
        where: { id: caseId },
        select: {
          originalPost: { select: { authorId: true } },
          suspectedPost: { select: { authorId: true } },
          status: true,
        },
      });

      if (!c) throw new Error("Case not found.");

      const isParty =
        c.originalPost.authorId === viewerId || c.suspectedPost.authorId === viewerId;
      if (!isParty) throw new Error("Only parties to this case may submit an appeal.");

      if (c.status === "RESOLVED" || c.status === "DISMISSED") {
        throw new Error("This case has already been closed.");
      }

      const existingAppeal = await prisma.plagiarismAppeal.findFirst({
        where: { caseId, userId: viewerId, status: "PENDING" },
        select: { id: true },
      });
      if (existingAppeal) throw new Error("You already have a pending appeal for this case.");

      const appeal = await prisma.plagiarismAppeal.create({
        data: { caseId, userId: viewerId, reason: trimmedReason, status: "PENDING" },
      });

      await createCaseEvent(caseId, "APPEAL_SUBMITTED",
        "A party to this case has submitted an appeal for review.", { actorId: viewerId });

      return {
        ...appeal,
        createdAt: appeal.createdAt.toISOString(),
        updatedAt: appeal.updatedAt.toISOString(),
      };
    },

    moderateCase: async (
      _: unknown,
      { caseId, action, note }: { caseId: string; action: string; note?: string | null },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.isAdmin) throw new Error("Not authorized.");
      const viewerId = ctx.user?.sub ?? "system";

      const validActions = ["CONFIRM", "DISMISS", "RESTORE_REVENUE", "STOP_REVENUE"];
      if (!validActions.includes(action)) {
        throw new Error(`Invalid action. Must be one of: ${validActions.join(", ")}`);
      }

      const c = await prisma.plagiarismCase.findUnique({
        where: { id: caseId },
        select: { id: true, revenueRedirect: { select: { id: true } } },
      });
      if (!c) throw new Error("Case not found.");

      const updates: Record<string, unknown> = { moderatorId: viewerId };
      if (note?.trim()) updates.moderatorNote = note.trim();

      let eventDescription = "";

      if (action === "CONFIRM") {
        updates.status = "RESOLVED";
        updates.resolvedAt = new Date();
        eventDescription = "Moderator confirmed plagiarism. Case resolved.";
      } else if (action === "DISMISS") {
        updates.status = "DISMISSED";
        updates.resolvedAt = new Date();
        updates.revenueRedirectEnabled = false;
        eventDescription = "Moderator dismissed the case. No plagiarism confirmed.";
        // Deactivate any revenue redirect
        if (c.revenueRedirect) {
          await prisma.revenueRedirect.update({
            where: { caseId },
            data: { active: false },
          });
        }
      } else if (action === "RESTORE_REVENUE") {
        updates.revenueRedirectEnabled = true;
        if (c.revenueRedirect) {
          await prisma.revenueRedirect.update({ where: { caseId }, data: { active: true } });
        }
        eventDescription = "Moderator re-enabled revenue redirection to the original author.";
      } else if (action === "STOP_REVENUE") {
        updates.revenueRedirectEnabled = false;
        if (c.revenueRedirect) {
          await prisma.revenueRedirect.update({ where: { caseId }, data: { active: false } });
        }
        eventDescription = "Moderator stopped revenue redirection. Revenue now flows to the uploader.";
      }

      await prisma.plagiarismCase.update({ where: { id: caseId }, data: updates });

      await createCaseEvent(caseId, "MODERATION_ACTION", eventDescription, {
        actorId: viewerId,
        metadata: { action, note: note?.trim() ?? null },
      });

      return fetchCaseWithAccess(caseId, viewerId, true);
    },
  },
};
