import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../config/prisma.js";
import { s3 } from "../../config/s3.js";

type AdminContext = {
  isAdmin?: boolean;
  user?: { sub?: string };
};

type CreateBotArgs = {
  username: string;
  displayName: string;
  institution?: string;
  program?: string;
  profilePicture?: string;
};

type CreatePostAsBotArgs = {
  botId: string;
  fileBase64: string;
  thumbnailBase64?: string;
  fileName: string;
  mimeType: string;
  title: string;
  categories: string[];
  description?: string;
  year?: number;
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");

const buildPrivateS3Url = (key: string) =>
  `https://${process.env.AWS_S3_PRIVATE_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
const buildCloudFrontUrl = (key: string) =>
  `${(process.env.CLOUDFRONT_URL ?? "").replace(/\/$/, "")}/${key}`;

const MAX_POST_THUMBNAIL_BYTES = 2 * 1024 * 1024;

function requireAdmin(ctx: AdminContext) {
  if (!ctx.isAdmin) {
    throw new Error("Not authorized");
  }
}

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const AdminResolver = {
  Query: {
    adminListBots: async (_: unknown, __: unknown, ctx: AdminContext) => {
      requireAdmin(ctx);
      return prisma.user.findMany({
        where: { isBot: true, deleted: false },
        orderBy: { createdAt: "desc" },
      });
    },

    adminListCashoutRequests: async (
      _: unknown,
      {
        status,
        limit = 50,
        offset = 0,
      }: { status?: string | null; limit?: number; offset?: number },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const where: any = {};
      if (status && status.trim()) {
        where.status = status.trim().toLowerCase();
      }

      const requests = await (prisma as any).tokenCashoutRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(limit) || 50, 200),
        skip: Math.max(Number(offset) || 0, 0),
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
              tokenBalance: true,
              tokensEarned: true,
            },
          },
        },
      });

      return requests.map((r: any) => ({
        ...r,
        payoutDetails:
          typeof r.payoutDetails === "object"
            ? JSON.stringify(r.payoutDetails)
            : String(r.payoutDetails ?? "{}"),
        createdAt: toIso(r.createdAt) ?? "",
        reviewedAt: toIso(r.reviewedAt),
      }));
    },
  },
  Mutation: {
    adminReviewCashoutRequest: async (
      _: unknown,
      {
        id,
        status,
        adminNote,
      }: { id: string; status: string; adminNote?: string | null },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const normalizedId = String(id || "").trim();
      const normalizedStatus = String(status || "")
        .trim()
        .toLowerCase();

      const VALID_STATUSES = ["approved", "paid", "rejected", "pending"];
      if (!normalizedId || !VALID_STATUSES.includes(normalizedStatus)) {
        throw new Error(
          "Invalid id or status. Must be: approved | paid | rejected | pending",
        );
      }

      const existing = await (prisma as any).tokenCashoutRequest.findUnique({
        where: { id: normalizedId },
        select: { id: true, status: true, userId: true, tokensAmount: true },
      });

      if (!existing) {
        throw new Error("Cashout request not found");
      }

      // If rejecting a pending request, refund the tokens
      if (normalizedStatus === "rejected" && existing.status === "pending") {
        await (prisma as any).$transaction([
          (prisma as any).tokenCashoutRequest.update({
            where: { id: normalizedId },
            data: {
              status: normalizedStatus,
              adminNote: adminNote?.trim() || null,
              reviewedAt: new Date(),
            },
          }),
          (prisma as any).user.update({
            where: { id: existing.userId },
            data: {
              tokenBalance: { increment: existing.tokensAmount },
              tokensRedeemed: { decrement: existing.tokensAmount },
            },
          }),
          (prisma as any).tokenTransaction.create({
            data: {
              userId: existing.userId,
              type: "CASHOUT_REFUND",
              amount: existing.tokensAmount,
              description: `Cashout request rejected — tokens refunded`,
            },
          }),
        ]);
      } else {
        await (prisma as any).tokenCashoutRequest.update({
          where: { id: normalizedId },
          data: {
            status: normalizedStatus,
            adminNote: adminNote?.trim() || null,
            reviewedAt: new Date(),
          },
        });
      }

      return true;
    },
    adminCreateBot: async (
      _: unknown,
      args: CreateBotArgs,
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const username = args.username.trim();
      const displayName = args.displayName.trim();

      if (!username || !displayName) {
        throw new Error("Username and display name are required");
      }

      const existing = await (prisma as any).user.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          deleted: false,
        },
      });

      if (existing) {
        throw new Error("Username already in use");
      }

      const placeholderPassword = await bcrypt.hash(randomUUID(), 12);
      const profilePicture =
        args.profilePicture ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

      const bot = await prisma.user.create({
        data: {
          username,
          displayName,
          email: `bot-${username.toLowerCase()}@materialcrate.bot`,
          password: placeholderPassword,
          isBot: true,
          emailVerified: true,
          institution: args.institution ?? null,
          program: args.program ?? null,
          profilePicture,
          workspace: { create: { name: "My Workspace" } },
        } as any,
      });

      return bot;
    },

    adminCreatePostAsBot: async (
      _: unknown,
      args: CreatePostAsBotArgs,
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const bot = await prisma.user.findUnique({
        where: { id: args.botId },
        select: { id: true, isBot: true, deleted: true },
      });

      if (!bot || !bot.isBot || bot.deleted) {
        throw new Error("Bot not found");
      }

      const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
      const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;

      if (!privateBucket || !publicBucket) {
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
      } = args;

      if (!fileBase64 || !fileName || !mimeType || !title) {
        throw new Error("Missing required post fields");
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
            const thumbnailBaseName =
              fileName.replace(/\.(pdf|docx?|doc)$/i, "") || "document";
            const thumbnailKey = `thumbnails/${Date.now()}-${randomUUID()}-${sanitizeFileName(thumbnailBaseName)}.webp`;

            await s3.send(
              new PutObjectCommand({
                Bucket: publicBucket,
                Key: thumbnailKey,
                Body: thumbnailBuffer,
                ContentType: "image/webp",
              }),
            );

            thumbnailUrl = buildCloudFrontUrl(thumbnailKey);
          }
        } catch {
          thumbnailUrl = null;
        }
      }

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
          console.error("[admin] word-to-html conversion failed:", err);
        }
      }

      const normalizedCategories = categories
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter(Boolean)
        .map((c) => c.toLowerCase());

      if (normalizedCategories.length < 1 || normalizedCategories.length > 3) {
        throw new Error("Posts must have between 1 and 3 categories");
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
            authorId: bot.id,
          },
        });

        await (tx as any).postVersion.create({
          data: {
            postId: nextPost.id,
            versionNumber: 1,
            title: nextPost.title,
            categories: nextPost.categories,
            description: nextPost.description,
            year: nextPost.year,
            fileUrl: nextPost.fileUrl,
            thumbnailUrl: nextPost.thumbnailUrl,
            fileType: nextPost.fileType,
            editorId: bot.id,
          },
        });

        return tx.post.findUnique({
          where: { id: nextPost.id },
          include: {
            author: true,
            likes: true,
            comments: true,
            _count: { select: { likes: true, comments: true } },
          },
        });
      });

      if (!createdPost) {
        throw new Error("Failed to create post");
      }

      return {
        ...createdPost,
        likeCount: createdPost._count?.likes ?? 0,
        commentCount: createdPost._count?.comments ?? 0,
        viewerHasLiked: false,
      };
    },
  },
};
