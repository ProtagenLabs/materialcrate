import { prisma } from "../../config/prisma.js";

type GraphQLContext = {
  user?: { sub?: string };
};

export const viewerCanAccessDocument = async (
  post: { id: string; isFree: boolean; authorId?: string | null },
  viewerId?: string,
): Promise<boolean> => {
  if (post.isFree) return true;
  if (!viewerId) return false;
  if (post.authorId === viewerId) return true;

  const purchase = await prisma.purchase.findUnique({
    where: { userId_postId: { userId: viewerId, postId: post.id } },
    select: { id: true },
  });

  return purchase !== null;
};

export const normalizePricingInput = (
  isFreeInput: boolean | null | undefined,
  priceInput: number | null | undefined,
): { isFree: boolean; price: number } => {
  const isFree = isFreeInput !== false;
  const price = typeof priceInput === "number" ? priceInput : 0;

  if (!isFree && price <= 0) {
    throw new Error("Paid posts must have a price greater than 0.");
  }
  if (!isFree && !Number.isFinite(price)) {
    throw new Error("Price must be a valid number.");
  }
  if (price < 0) {
    throw new Error("Price cannot be negative.");
  }
  if (isFree && price !== 0) {
    throw new Error("Free posts must have a price of 0.");
  }

  return { isFree, price: isFree ? 0 : price };
};

export const PurchaseResolver = {
  Query: {
    documentAccess: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) throw new Error("Post id is required.");

      const post = await prisma.post.findFirst({
        where: { id: normalizedPostId, deleted: false },
        select: {
          id: true,
          isFree: true,
          price: true,
          fileUrl: true,
          authorId: true,
        },
      });

      if (!post) throw new Error("Post not found.");

      const canAccess = await viewerCanAccessDocument(post, viewerId);

      if (canAccess) {
        return { locked: false, price: post.price, message: null, fileUrl: post.fileUrl };
      }

      return {
        locked: true,
        price: post.price,
        message: "Purchase required to access this document.",
        fileUrl: null,
      };
    },

    myPurchases: async (
      _: unknown,
      { limit = 20, offset = 0 }: { limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);

      const purchases = await prisma.purchase.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
      });

      return purchases.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      }));
    },
  },

  Mutation: {
    purchasePost: async (
      _: unknown,
      { postId }: { postId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated.");

      const normalizedPostId = postId?.trim();
      if (!normalizedPostId) throw new Error("Post id is required.");

      const post = await prisma.post.findFirst({
        where: { id: normalizedPostId, deleted: false },
        select: { id: true, isFree: true, price: true, authorId: true },
      });

      if (!post) throw new Error("Post not found.");
      if (post.isFree) throw new Error("This document is free — no purchase needed.");
      if (post.authorId === viewerId) {
        throw new Error("You cannot purchase your own post.");
      }

      const existing = await prisma.purchase.findUnique({
        where: { userId_postId: { userId: viewerId, postId: normalizedPostId } },
      });

      if (existing) {
        throw new Error("You have already purchased access to this document.");
      }

      const purchase = await prisma.purchase.create({
        data: {
          userId: viewerId,
          postId: normalizedPostId,
          amount: post.price,
        },
      });

      return { ...purchase, createdAt: purchase.createdAt.toISOString() };
    },
  },
};
