import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { prisma } from "../../config/prisma.js";
import { s3 } from "../../config/s3.js";

// S3 storage metrics are always published to us-east-1 in CloudWatch
const cw = new CloudWatchClient({ region: "us-east-1" });

async function getBucketBytes(bucket: string): Promise<number> {
  if (!bucket) return 0;
  const now = new Date();
  const res = await cw.send(
    new GetMetricStatisticsCommand({
      Namespace: "AWS/S3",
      MetricName: "BucketSizeBytes",
      Dimensions: [
        { Name: "BucketName", Value: bucket },
        { Name: "StorageType", Value: "StandardStorage" },
      ],
      StartTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      EndTime: now,
      Period: 86400,
      Statistics: ["Average"],
    }),
  );
  const points = (res.Datapoints ?? []).sort(
    (a, b) => (b.Timestamp?.getTime() ?? 0) - (a.Timestamp?.getTime() ?? 0),
  );
  const bytes = points[0]?.Average ?? 0;
  if (bytes > 0) return bytes;

  // CloudWatch publishes once per day — fall back to listing objects directly
  console.warn(`[storage] no CloudWatch datapoints for "${bucket}", falling back to ListObjectsV2`);
  let total = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) total += obj.Size ?? 0;
    token = page.NextContinuationToken;
  } while (token);
  return total;
}

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
    adminStats: async (_: unknown, __: unknown, ctx: AdminContext) => {
      requireAdmin(ctx);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalUsers,
        newUsersToday,
        uploadsToday,
        pendingReviews,
        pendingPayouts,
        revenueAgg,
        uploadsByDay,
        revenueByMonth,
        recentPosts,
        recentUsers,
        recentReports,
        recentPayouts,
        latestReports,
        trendingDocs,
        privateBucketBytes,
        publicBucketBytes,
      ] = await Promise.all([
        prisma.user.count({ where: { deleted: false, isBot: false } }),
        prisma.user.count({ where: { deleted: false, isBot: false, createdAt: { gte: startOfToday } } }),
        prisma.post.count({ where: { deleted: false, createdAt: { gte: startOfToday } } }),
        (prisma as any).report.count({ where: { resolved: false } }),
        (prisma as any).tokenCashoutRequest.count({ where: { status: "pending" } }),
        (prisma as any).tokenCashoutRequest.aggregate({
          where: { status: { in: ["approved", "paid"] }, createdAt: { gte: startOfMonth } },
          _sum: { cashAmount: true },
        }),
        Promise.all(
          Array.from({ length: 7 }, (_, i) => {
            const day = new Date(startOfToday);
            day.setDate(day.getDate() - (6 - i));
            const nextDay = new Date(day);
            nextDay.setDate(nextDay.getDate() + 1);
            return prisma.post.count({ where: { deleted: false, createdAt: { gte: day, lt: nextDay } } });
          }),
        ),
        Promise.all(
          Array.from({ length: 12 }, async (_, i) => {
            const mStart = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            const mEnd = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 1);
            const agg = await (prisma as any).tokenCashoutRequest.aggregate({
              where: { status: { in: ["approved", "paid"] }, createdAt: { gte: mStart, lt: mEnd } },
              _sum: { cashAmount: true },
            });
            return (agg._sum.cashAmount as number) ?? 0;
          }),
        ),
        prisma.post.findMany({
          where: { deleted: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { author: { select: { username: true } } },
        }),
        prisma.user.findMany({
          where: { deleted: false, isBot: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { username: true, createdAt: true },
        }),
        (prisma as any).report.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { user: { select: { username: true } } },
        }),
        (prisma as any).tokenCashoutRequest.findMany({
          where: { status: "pending" },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { user: { select: { username: true } } },
        }),
        (prisma as any).report.findMany({
          where: { resolved: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { user: { select: { username: true } } },
        }),
        prisma.post.findMany({
          where: { deleted: false },
          orderBy: { viewCount: "desc" },
          take: 3,
          select: { id: true, title: true, categories: true, viewCount: true },
        }),
        getBucketBytes(process.env.AWS_S3_PRIVATE_BUCKET ?? "").catch((e) => { console.error("[storage] private bucket error:", e.message); return 0; }),
        getBucketBytes(process.env.AWS_S3_PUBLIC_BUCKET ?? "").catch((e) => { console.error("[storage] public bucket error:", e.message); return 0; }),
      ]);

      const activityItems = [
        ...recentPosts.map((p) => ({
          type: "upload",
          user: p.author?.username ?? "unknown",
          action: "uploaded",
          target: p.title,
          time: p.createdAt.toISOString(),
        })),
        ...recentUsers.map((u) => ({
          type: "signup",
          user: u.username,
          action: "joined MaterialCrate",
          target: "",
          time: u.createdAt.toISOString(),
        })),
        ...recentReports.map((r: any) => ({
          type: "report",
          user: r.user?.username ?? "unknown",
          action: "reported",
          target: r.title,
          time: r.createdAt.toISOString(),
        })),
        ...recentPayouts.map((p: any) => ({
          type: "payout",
          user: p.user?.username ?? "unknown",
          action: "requested payout of",
          target: `$${(p.cashAmount as number).toFixed(2)}`,
          time: p.createdAt.toISOString(),
        })),
      ]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 6);

      return {
        totalUsers,
        newUsersToday,
        uploadsToday,
        pendingReviews,
        pendingPayouts,
        revenueThisMonth: (revenueAgg._sum.cashAmount as number) ?? 0,
        storageBytes: privateBucketBytes + publicBucketBytes,
        uploadBars: uploadsByDay,
        revenueChart: revenueByMonth,
        recentActivity: activityItems,
        latestReports: (latestReports as any[]).map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          resolved: r.resolved,
          createdAt: r.createdAt.toISOString(),
          username: r.user?.username ?? "unknown",
        })),
        trendingDocs: trendingDocs.map((d, i) => ({
          id: d.id,
          rank: i + 1,
          title: d.title,
          category: d.categories[0] ?? "General",
          viewCount: d.viewCount,
        })),
      };
    },

    adminListAdmins: async (_: unknown, __: unknown, ctx: AdminContext) => {
      requireAdmin(ctx);
      const users = await (prisma as any).adminUser.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, role: true, name: true, createdAt: true },
      });
      return users.map((u: any) => ({ ...u, createdAt: toIso(u.createdAt) ?? "" }));
    },

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

    adminListPosts: async (
      _: unknown,
      { limit = 20, offset = 0, search, deleted }: { limit?: number; offset?: number; search?: string; deleted?: boolean },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const where: Record<string, unknown> = {};
      if (deleted !== undefined) where.deleted = deleted;
      if (search?.trim()) {
        where.OR = [
          { title: { contains: search.trim(), mode: "insensitive" } },
          { author: { username: { contains: search.trim(), mode: "insensitive" } } },
        ];
      }

      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          take: safeLimit,
          skip: safeOffset,
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { username: true } },
            _count: { select: { purchases: true, likes: true } },
          },
        }),
        prisma.post.count({ where }),
      ]);

      const postIds = posts.map((p) => p.id);
      const purchaseSums = postIds.length > 0
        ? await prisma.purchase.groupBy({
            by: ["postId"],
            where: { postId: { in: postIds } },
            _sum: { amount: true },
          })
        : [];

      const revenueMap = new Map(purchaseSums.map((s) => [s.postId, s._sum.amount ?? 0]));

      return {
        total,
        posts: posts.map((p) => ({
          id: p.id,
          title: p.title,
          authorId: p.authorId ?? null,
          authorUsername: p.author?.username ?? null,
          categories: p.categories,
          fileType: p.fileType,
          viewCount: p.viewCount,
          likeCount: p._count.likes,
          downloadCount: p._count.purchases,
          revenue: revenueMap.get(p.id) ?? 0,
          createdAt: p.createdAt.toISOString(),
          deleted: p.deleted,
          thumbnailUrl: p.thumbnailUrl ?? null,
        })),
      };
    },

    adminUploadStats: async (_: unknown, __: unknown, ctx: AdminContext) => {
      requireAdmin(ctx);

      const [totalActive, totalRemoved, fileTypeGroups, categoryRows] = await Promise.all([
        prisma.post.count({ where: { deleted: false } }),
        prisma.post.count({ where: { deleted: true } }),
        prisma.post.groupBy({ by: ["fileType"], where: { deleted: false }, _count: { _all: true } }),
        prisma.$queryRaw<{ cat: string; cnt: bigint }[]>`
          SELECT unnest(categories) AS cat, count(*) AS cnt
          FROM "Post"
          WHERE deleted = false
          GROUP BY cat
          ORDER BY cnt DESC
          LIMIT 30
        `,
      ]);

      const total = fileTypeGroups.reduce((s, g) => s + g._count._all, 0);
      const fileTypes = fileTypeGroups
        .sort((a, b) => b._count._all - a._count._all)
        .map((g) => ({
          type: g.fileType.toUpperCase(),
          count: g._count._all,
          percent: total > 0 ? Math.round((g._count._all / total) * 100) : 0,
        }));

      const categories = categoryRows.map((r) => ({
        name: r.cat,
        count: Number(r.cnt),
      }));

      return { totalActive, totalRemoved, categories, fileTypes };
    },

    adminGetPostUrls: async (_: unknown, { id }: { id: string }, ctx: AdminContext) => {
      requireAdmin(ctx);

      const post = await prisma.post.findUnique({
        where: { id },
        select: { fileUrl: true, fileType: true, renderedHtmlUrl: true },
      });
      if (!post) throw new Error("Post not found");

      const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET ?? "";

      // Generate a short-lived presigned URL so the Next.js proxy can fetch it
      let presignedFileUrl = post.fileUrl;
      try {
        const parsed = new URL(post.fileUrl);
        const key = parsed.pathname.slice(1);
        presignedFileUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: privateBucket, Key: key }),
          { expiresIn: 300 },
        );
      } catch { /* fall back to raw URL */ }

      // For Word docs, fetch rendered HTML from S3 server-side
      let renderedHtml: string | null = null;
      if (post.renderedHtmlUrl && post.fileType !== "pdf") {
        try {
          const parsed = new URL(post.renderedHtmlUrl);
          const key = parsed.pathname.slice(1);
          const result = await s3.send(new GetObjectCommand({ Bucket: privateBucket, Key: key }));
          renderedHtml = (await result.Body?.transformToString("utf-8")) ?? null;
        } catch {
          renderedHtml = null;
        }
      }

      return { fileUrl: presignedFileUrl, fileType: post.fileType, renderedHtml };
    },

    adminListPlagiarismCases: async (
      _: unknown,
      { status, limit = 50, offset = 0 }: { status?: string; limit?: number; offset?: number },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const where: Record<string, unknown> = {};
      if (status?.trim()) where.status = status.trim();

      const cases = await prisma.plagiarismCase.findMany({
        where,
        take: Math.min(Number(limit) || 50, 100),
        skip: Math.max(Number(offset) || 0, 0),
        orderBy: { createdAt: "desc" },
        include: {
          originalPost: { select: { title: true, author: { select: { username: true } } } },
          suspectedPost: { select: { title: true, author: { select: { username: true } } } },
        },
      });

      return cases.map((c) => ({
        id: c.id,
        originalPostId: c.originalPostId,
        originalTitle: c.originalPost.title,
        originalAuthor: c.originalPost.author?.username ?? null,
        suspectedPostId: c.suspectedPostId,
        suspectedTitle: c.suspectedPost.title,
        suspectedAuthor: c.suspectedPost.author?.username ?? null,
        similarityScore: c.similarityScore,
        verdict: c.verdict,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      }));
    },
  },
  Mutation: {
    adminCreateAdmin: async (
      _: unknown,
      { email, password, role, name }: { email: string; password: string; role: string; name?: string },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const VALID_ROLES = ["super_admin", "admin", "moderator", "viewer"];
      if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");

      const normalized = email.trim().toLowerCase();
      const exists = await (prisma as any).adminUser.findUnique({ where: { email: normalized } });
      if (exists) throw new Error("An admin with that email already exists");

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await (prisma as any).adminUser.create({
        data: { email: normalized, passwordHash, role, name: name?.trim() ?? null },
      });
      return { ...user, createdAt: toIso(user.createdAt) ?? "" };
    },

    adminUpdateAdmin: async (
      _: unknown,
      { id, role, name }: { id: string; role?: string; name?: string },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      if (role) {
        const VALID_ROLES = ["super_admin", "admin", "moderator", "viewer"];
        if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");

        // Prevent demoting the last super_admin
        if (role !== "super_admin") {
          const target = await (prisma as any).adminUser.findUnique({ where: { id }, select: { role: true } });
          if (target?.role === "super_admin") {
            const count = await (prisma as any).adminUser.count({ where: { role: "super_admin" } });
            if (count <= 1) throw new Error("Cannot demote the only super_admin");
          }
        }
      }

      const user = await (prisma as any).adminUser.update({
        where: { id },
        data: {
          ...(role ? { role } : {}),
          ...(name !== undefined ? { name: name?.trim() || null } : {}),
        },
      });
      return { ...user, createdAt: toIso(user.createdAt) ?? "" };
    },

    adminRemoveAdmin: async (
      _: unknown,
      { id }: { id: string },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const target = await (prisma as any).adminUser.findUnique({ where: { id }, select: { role: true } });
      if (!target) throw new Error("Admin not found");

      // Prevent deleting the last super_admin
      if (target.role === "super_admin") {
        const count = await (prisma as any).adminUser.count({ where: { role: "super_admin" } });
        if (count <= 1) throw new Error("Cannot remove the only super_admin");
      }

      await (prisma as any).adminUser.delete({ where: { id } });
      return true;
    },

    adminVerifyCredentials: async (
      _: unknown,
      { email, password }: { email: string; password: string },
      ctx: AdminContext,
    ) => {
      requireAdmin(ctx);

      const user = await (prisma as any).adminUser.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { passwordHash: true, role: true, name: true },
      });

      if (!user) {
        return { valid: false, role: null, name: null };
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return { valid: false, role: null, name: null };
      }

      return { valid: true, role: user.role, name: user.name ?? null };
    },

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

    adminDeletePost: async (_: unknown, { id }: { id: string }, ctx: AdminContext) => {
      requireAdmin(ctx);
      await prisma.post.update({ where: { id }, data: { deleted: true, deletedAt: new Date() } });
      return true;
    },

    adminRestorePost: async (_: unknown, { id }: { id: string }, ctx: AdminContext) => {
      requireAdmin(ctx);
      await prisma.post.update({ where: { id }, data: { deleted: false, deletedAt: null } });
      return true;
    },
  },
};
