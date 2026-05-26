import { GraphQLError } from "graphql";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { s3 } from "../../config/s3.js";
import {
  beginPendingEmailChange,
  getVisiblePendingEmail,
  resendPendingEmailChange,
  sendPasswordChangedEmail,
  sendVerificationEmailForUser,
  verifyEmailCode,
  verifyPendingEmailChange,
} from "../../auth/emailVerification.js";
import { sendAccountDeletedEmail } from "../../email/accountDeletedEmail.js";
import { sendAccountRecoveredEmail } from "../../email/accountRecoveredEmail.js";
import { sendWelcomeEmail } from "../../email/welcomeEmail.js";
import { sendLoginEmail } from "../../email/loginEmail.js";
import { checkAchievements } from "../../achievements/service.js";
import { ensureWorkspaceForUserId } from "./workspace.resolver.js";
import {
  createNotification,
  NOTIFICATION_ICON,
  NOTIFICATION_TYPE,
} from "../../services/notifications.js";
import { emitFollowActivity } from "../../realtime/postActivity.js";

const createToken = (userId: string, email: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ sub: userId, email }, secret, { expiresIn: "7d" });
};

const DICEBEAR_STYLES = [
  "adventurer", "adventurer-neutral", "avataaars", "avataaars-neutral",
  "big-ears", "big-ears-neutral", "big-smile", "bottts", "bottts-neutral",
  "croodles", "croodles-neutral", "dylan", "fun-emoji", "glass", "icons",
  "identicon", "initials", "lorelei", "lorelei-neutral", "micah", "miniavs",
  "notionists", "notionists-neutral", "open-peeps", "personas",
  "pixel-art", "pixel-art-neutral", "rings", "shapes", "thumbs",
];

const randomDicebearUrl = (username: string) => {
  const style = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
  return `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(username)}&size=200`;
};

const RESERVED_USERNAMES = new Set(["deleted", "disabled"]);
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const ACCOUNT_RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SOCIAL_PROVIDER_MAP = {
  google: "GOOGLE",
} as const;

type SocialProviderKey = keyof typeof SOCIAL_PROVIDER_MAP;
type SocialProviderValue = (typeof SOCIAL_PROVIDER_MAP)[SocialProviderKey];

const normalizeSocialProvider = (provider: unknown): SocialProviderValue => {
  const normalized = String(provider || "")
    .trim()
    .toLowerCase();
  if (normalized === "google") return SOCIAL_PROVIDER_MAP.google;
  throw new Error("Unsupported social provider");
};

const sanitizeUsernameCandidate = (value: string) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  return normalized.slice(0, 24);
};

const generateUniqueUsername = async (baseValue: string) => {
  const safeBase =
    sanitizeUsernameCandidate(baseValue) ||
    `user${Math.floor(Math.random() * 900000 + 100000)}`;
  let candidate = safeBase;
  let suffix = 0;

  while (suffix < 1000) {
    if (!RESERVED_USERNAMES.has(candidate.toLowerCase())) {
      const existing = await (prisma as any).user.findFirst({
        where: { username: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    suffix += 1;
    candidate = `${safeBase}${suffix}`.slice(0, 30);
  }

  throw new Error("Could not generate a unique username");
};

const normalizeEmailAddress = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const findUserByEmailInsensitive = (email: string) =>
  (prisma as any).user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

const PAID_SUBSCRIPTION_PLANS = new Set(["pro", "premium"]);
const PROFILE_FIELD_VISIBILITY_VALUES = [
  "everyone",
  "followers",
  "only_you",
] as const;

type ProfileFieldVisibility = (typeof PROFILE_FIELD_VISIBILITY_VALUES)[number];

const PROFILE_FIELD_VISIBILITY_SET = new Set<ProfileFieldVisibility>(
  PROFILE_FIELD_VISIBILITY_VALUES,
);

const hasPaidSubscriptionPlan = (plan: unknown) =>
  PAID_SUBSCRIPTION_PLANS.has(
    String(plan || "")
      .trim()
      .toLowerCase(),
  );

const normalizeProfileFieldVisibility = (
  value: unknown,
): ProfileFieldVisibility => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return PROFILE_FIELD_VISIBILITY_SET.has(normalized as ProfileFieldVisibility)
    ? (normalized as ProfileFieldVisibility)
    : "everyone";
};

const canViewerSeeProfileField = async (
  user: { id?: string | null },
  visibility: unknown,
  viewerId?: string | null,
) => {
  const normalizedVisibility = normalizeProfileFieldVisibility(visibility);

  if (viewerId && user.id === viewerId) {
    return true;
  }

  if (normalizedVisibility === "everyone") {
    return true;
  }

  if (!viewerId || !user.id || normalizedVisibility === "only_you") {
    return false;
  }

  const follow = await (prisma as any).follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: viewerId,
        followingId: user.id,
      },
    },
    select: { followerId: true },
  });

  return Boolean(follow);
};

const getDeletedAccountRestoreDeadline = (deletedAt: unknown) => {
  if (!deletedAt) return null;
  const parsed =
    deletedAt instanceof Date ? deletedAt : new Date(String(deletedAt));
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + ACCOUNT_RESTORE_WINDOW_MS);
};

const getDeletedAccountRestoreState = (user: any) => {
  if (!user?.deleted) {
    return {
      canRestore: false,
      restoreDeadline: null,
    };
  }

  const restoreDeadline = getDeletedAccountRestoreDeadline(user.deletedAt);
  if (!restoreDeadline) {
    return {
      canRestore: false,
      restoreDeadline: null,
    };
  }

  return {
    canRestore: restoreDeadline.getTime() > Date.now(),
    restoreDeadline,
  };
};

const buildAuthPayload = async (
  user: any,
  options?: {
    restoreRequired?: boolean;
    restoreDeadline?: Date | null;
  },
) => {
  const token = createToken(user.id, user.email);
  return {
    token,
    user,
    verificationEmailSent: true,
    verificationEmailError: null,
    restoreRequired: Boolean(options?.restoreRequired),
    restoreDeadline: toIsoStringOrNull(options?.restoreDeadline),
    verificationRequired: false,
    verificationDeadline: null,
  };
};

const ensureUserCanLogin = async (user: any) => {
  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.deleted) {
    const { canRestore, restoreDeadline } = getDeletedAccountRestoreState(user);
    if (canRestore) {
      const error = new Error("Account restoration required");
      Object.assign(error, {
        restoreRequired: true,
        restoreDeadline: toIsoStringOrNull(restoreDeadline),
      });
      throw error;
    }

    throw new Error("Account has been permanently deleted");
  }

  if (user.disabled) {
    const now = new Date();
    const disabledUntil = user.disabledUntil
      ? new Date(user.disabledUntil)
      : null;

    if (disabledUntil && now >= disabledUntil) {
      const reactivated = await (prisma as any).user.update({
        where: { id: user.id },
        data: {
          disabled: false,
          disabledAt: null,
          disabledUntil: null,
        },
      });
      return reactivated;
    }

    throw new Error("Account is disabled");
  }

  return user;
};

const includeProviderInLinkedSeos = (
  linkedSEOs: unknown,
  provider: SocialProviderValue,
) => {
  const existing = Array.isArray(linkedSEOs)
    ? linkedSEOs.filter((value): value is string => typeof value === "string")
    : [];
  if (existing.includes(provider)) {
    return existing;
  }
  return [...existing, provider];
};

const createNotificationSafely = async (
  context: string,
  input: Parameters<typeof createNotification>[0],
) => {
  try {
    return await createNotification(input);
  } catch (error) {
    console.error(`[${context}] Failed to create notification`, {
      userId: input.userId,
      actorId: input.actorId,
      type: input.type,
      error,
    });
    return null;
  }
};

const deleteNotificationsSafely = async (
  context: string,
  where: Record<string, unknown>,
) => {
  try {
    await (prisma as any).notification.deleteMany({ where });
  } catch (error) {
    console.error(`[${context}] Failed to delete notifications`, {
      where,
      error,
    });
  }
};

const emitFollowActivityForUser = async ({
  userId,
  reason,
  actorId,
}: {
  userId: string;
  reason: "followed" | "unfollowed" | "follow-request-accepted";
  actorId?: string | null;
}) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return;
  }

  try {
    const [followersCount, followingCount] = await Promise.all([
      (prisma as any).follow.count({
        where: { followingId: normalizedUserId },
      }),
      (prisma as any).follow.count({
        where: { followerId: normalizedUserId },
      }),
    ]);

    emitFollowActivity({
      userId: normalizedUserId,
      reason,
      actorId: actorId?.trim() || null,
      followersCount,
      followingCount,
    });
  } catch (error) {
    console.error("Failed to emit follow activity", {
      userId: normalizedUserId,
      reason,
      actorId,
      error,
    });
  }
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");

const buildCloudFrontUrl = (key: string) =>
  `${(process.env.CLOUDFRONT_URL ?? "").replace(/\/$/, "")}/${key}`;
const MAX_PROFILE_PICTURE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROFILE_PICTURE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PROFILE_PICTURE_MAX_DIMENSION = 512;
const PROFILE_PICTURE_WEBP_QUALITY = 82;
const DEFAULT_PROFILE_BACKGROUND =
  "bg-linear-to-br from-[#E1761F] via-[#ffecdc] to-stone-200";
const MAX_PROFILE_BACKGROUND_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_BACKGROUND_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const extractS3Key = (fileUrl: string) => {
  try {
    const parsed = new URL(fileUrl);
    const key = parsed.pathname.replace(/^\/+/, "");
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
};

const toIsoStringOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const getBlockedUserIdsForViewer = async (viewerId?: string) => {
  if (!viewerId) {
    return [];
  }

  const viewer = await (prisma as any).user.findUnique({
    where: { id: viewerId },
    select: { blockedUserIds: true },
  });

  return Array.isArray(viewer?.blockedUserIds) ? viewer.blockedUserIds : [];
};

export const UserResolver = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: any) => {
      if (!ctx.user?.sub) return null;
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.sub },
      });
      if (!user) return null;
      await ensureWorkspaceForUserId(user.id, ctx.user.sub);
      return user;
    },

    user: async (_: unknown, { id }: { id: string }) => {
      return prisma.user.findUnique({ where: { id } });
    },

    userByUsername: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        return null;
      }

      const viewerId = ctx.user?.sub;

      return (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
          ...(viewerId
            ? {
                NOT: {
                  blockedUserIds: {
                    has: viewerId,
                  },
                },
              }
            : {}),
        },
      });
    },

    searchUsers: async (
      _: unknown,
      { query, limit = 12, offset = 0 }: { query: string; limit?: number; offset?: number },
      ctx: any,
    ) => {
      const normalizedQuery = String(query || "").trim();
      if (!normalizedQuery) {
        return [];
      }

      const safeLimit = Math.max(1, Math.min(limit, 25));
      const safeOffset = Math.max(0, offset);
      const viewerId = ctx.user?.sub;

      return (prisma as any).user.findMany({
        where: {
          deleted: false,
          disabled: false,
          ...(viewerId
            ? {
                NOT: {
                  blockedUserIds: {
                    has: viewerId,
                  },
                },
              }
            : {}),
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
            {
              institution: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
            {
              program: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }],
        take: safeLimit,
        skip: safeOffset,
      });
    },

    usernameAvailable: async (
      _: unknown,
      { username }: { username: string },
    ) => {
      const trimmedUsername = username?.trim();
      if (!trimmedUsername) return false;

      if (!USERNAME_REGEX.test(trimmedUsername)) {
        return false;
      }

      if (RESERVED_USERNAMES.has(trimmedUsername.toLowerCase())) {
        return false;
      }

      const existing = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: trimmedUsername,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      return !existing;
    },
    emailAvailable: async (_: unknown, { email }: { email: string }) => {
      const trimmedEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!trimmedEmail) return false;

      const existing = await (prisma as any).user.findFirst({
        where: {
          email: {
            equals: trimmedEmail,
            mode: "insensitive",
          },
          deleted: false,
        },
        select: { id: true },
      });

      return !existing;
    },

    pendingFollowRequestId: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) return null;

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) return null;

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: { equals: normalizedUsername, mode: "insensitive" },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });
      if (!targetUser) return null;

      const request = await (prisma as any).followRequest.findFirst({
        where: {
          requesterId: viewerId,
          targetId: targetUser.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      return request?.id ?? null;
    },

    pendingFollowRequestForActor: async (
      _: unknown,
      { actorId }: { actorId: string },
      ctx: any,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) return null;

      const normalizedActorId = String(actorId || "").trim();
      if (!normalizedActorId) return null;

      const request = await (prisma as any).followRequest.findFirst({
        where: {
          requesterId: normalizedActorId,
          targetId: viewerId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      return request?.id ?? null;
    },

    myTokenTransactions: async (
      _: unknown,
      { limit = 20, offset = 0 }: { limit?: number; offset?: number },
      ctx: any,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated");

      const transactions = await (prisma as any).tokenTransaction.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(limit) || 20, 50),
        skip: Math.max(Number(offset) || 0, 0),
        select: {
          id: true,
          type: true,
          amount: true,
          description: true,
          postId: true,
          createdAt: true,
        },
      });

      return transactions.map((t: any) => ({
        ...t,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      }));
    },

    myTokenCashoutRequests: async (_: unknown, _args: unknown, ctx: any) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated");

      const requests = await (prisma as any).tokenCashoutRequest.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tokensAmount: true,
          cashAmount: true,
          status: true,
          payoutMethod: true,
          payoutDetails: true,
          adminNote: true,
          createdAt: true,
        },
      });

      return requests.map((r: any) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }));
    },
  },

  Mutation: {
    signup: async (_: unknown, args: any) => {
      const { email, password, username, displayName, institution, program } =
        args;
      const normalizedEmail = normalizeEmailAddress(email);
      const normalizedUsername = username?.trim();
      const normalizedDisplayName = displayName?.trim();

      if (
        !normalizedEmail ||
        !password ||
        !normalizedUsername ||
        !normalizedDisplayName
      ) {
        throw new Error(
          "Email, password, username, and display name are required",
        );
      }

      if (RESERVED_USERNAMES.has(normalizedUsername.toLowerCase())) {
        throw new Error("This username is reserved");
      }

      const existing = await (prisma as any).user.findFirst({
        where: {
          deleted: false,
          disabled: false,
          OR: [
            {
              email: {
                equals: normalizedEmail,
                mode: "insensitive",
              },
            },
            {
              username: {
                equals: normalizedUsername,
                mode: "insensitive",
              },
            },
          ],
        },
      });

      if (existing) {
        throw new Error("Email or username already in use");
      }

      const hashed = await bcrypt.hash(password, 12);
      const createUserData = {
        email: normalizedEmail,
        password: hashed,
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        institution: institution ?? null,
        program: program ?? null,
        profilePicture: randomDicebearUrl(normalizedUsername),
      };

      const user = await prisma.user
        .create({
          data: {
            ...(createUserData as any),
            workspace: {
              create: {
                name: "My Workspace",
              },
            },
          },
        })
        .catch((error) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new Error("Email or username already in use");
          }

          throw error;
        });

      let verificationEmailSent = true;
      let verificationEmailError: string | null = null;

      try {
        await sendVerificationEmailForUser(user.id, user.email);
      } catch (error) {
        verificationEmailSent = false;
        verificationEmailError =
          error instanceof Error
            ? error.message
            : "Failed to send verification email";
        console.error(
          "Failed to send verification email during signup:",
          error,
        );
      }

      checkAchievements(user.id, "signup").catch(() => null);

      const token = createToken(user.id, user.email);
      return {
        token,
        user,
        verificationEmailSent,
        verificationEmailError,
        restoreRequired: false,
        restoreDeadline: null,
      };
    },

    login: async (_: unknown, args: any, ctx: any) => {
      const { email, password } = args;
      const normalizedEmail = normalizeEmailAddress(email);

      if (!normalizedEmail || !password) {
        throw new Error("Email and password are required");
      }

      const user = await findUserByEmailInsensitive(normalizedEmail);
      if (!user || !user.password) {
        throw new Error("Invalid credentials");
      }

      if (user.disabled) {
        const now = new Date();
        const disabledUntil = user.disabledUntil
          ? new Date(user.disabledUntil)
          : null;

        if (disabledUntil && now >= disabledUntil) {
          await (prisma as any).user.update({
            where: { id: user.id },
            data: {
              disabled: false,
              disabledAt: null,
              disabledUntil: null,
            },
          });
          user.disabled = false;
        } else {
          throw new Error("Account is disabled");
        }
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        throw new Error("Invalid credentials");
      }

      if (user.deleted) {
        const { canRestore, restoreDeadline } =
          getDeletedAccountRestoreState(user);
        if (!canRestore) {
          throw new Error("Account has been permanently deleted");
        }

        return buildAuthPayload(user, {
          restoreRequired: true,
          restoreDeadline,
        });
      }

      if (!user.emailVerified) {
        const verificationDeadline = new Date(
          user.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        throw new GraphQLError("Email is not verified", {
          extensions: {
            code: "EMAIL_NOT_VERIFIED",
            verificationDeadline: verificationDeadline.toISOString(),
          },
        });
      }

      await ensureWorkspaceForUserId(user.id, user.id);

      sendLoginEmail(user.email, user.displayName, ctx.ip ?? null).catch(
        (error) => {
          console.error("Failed to send login notification email:", error);
        },
      );

      return buildAuthPayload(user);
    },
    socialAuth: async (_: unknown, args: any) => {
      const provider = normalizeSocialProvider(args.provider);
      const providerUserId = String(args.providerUserId || "").trim();
      const email = normalizeEmailAddress(args.email);
      const displayName = String(args.displayName || "").trim();

      if (!providerUserId || !email) {
        throw new Error("providerUserId and email are required");
      }

      const derivedDisplayName =
        displayName || email.split("@")[0]?.trim() || "User";

      const existingSeoAccount = await (prisma as any).seoAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId,
          },
        },
        include: {
          user: true,
        },
      });

      if (existingSeoAccount?.user) {
        if (existingSeoAccount.user.deleted) {
          const { canRestore, restoreDeadline } = getDeletedAccountRestoreState(
            existingSeoAccount.user,
          );
          if (!canRestore) {
            throw new Error("Account has been permanently deleted");
          }

          return buildAuthPayload(existingSeoAccount.user, {
            restoreRequired: true,
            restoreDeadline,
          });
        }

        const activeUser = await ensureUserCanLogin(existingSeoAccount.user);
        const refreshedUser = await (prisma as any).user.update({
          where: { id: activeUser.id },
          data: {
            displayName: activeUser.displayName || derivedDisplayName,
            emailVerified: true,
            linkedSEOs: includeProviderInLinkedSeos(
              activeUser.linkedSEOs,
              provider,
            ),
          },
        });

        await ensureWorkspaceForUserId(refreshedUser.id, refreshedUser.id);
        return buildAuthPayload(refreshedUser);
      }

      const existingUserByEmail = await findUserByEmailInsensitive(email);

      if (existingUserByEmail) {
        if (existingUserByEmail.deleted) {
          const { canRestore, restoreDeadline } =
            getDeletedAccountRestoreState(existingUserByEmail);
          if (!canRestore) {
            throw new Error("Account has been permanently deleted");
          }

          return buildAuthPayload(existingUserByEmail, {
            restoreRequired: true,
            restoreDeadline,
          });
        }

        const activeUser = await ensureUserCanLogin(existingUserByEmail);

        await (prisma as any).seoAccount
          .create({
            data: {
              userId: activeUser.id,
              provider,
              providerUserId,
            },
          })
          .catch((error: unknown) => {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              return null;
            }

            throw error;
          });

        const updatedUser = await (prisma as any).user.update({
          where: { id: activeUser.id },
          data: {
            displayName: activeUser.displayName || derivedDisplayName,
            emailVerified: true,
            linkedSEOs: includeProviderInLinkedSeos(
              activeUser.linkedSEOs,
              provider,
            ),
          },
        });

        await ensureWorkspaceForUserId(updatedUser.id, updatedUser.id);
        return buildAuthPayload(updatedUser);
      }

      const emailLocalPart = email.split("@")[0] || "user";
      const username = await generateUniqueUsername(emailLocalPart);
      const generatedPassword = randomBytes(32).toString("hex");
      const password = await bcrypt.hash(generatedPassword, 12);

      const createdUser = await (prisma as any).user.create({
        data: {
          email,
          password,
          username,
          displayName: derivedDisplayName,
          emailVerified: true,
          linkedSEOs: [provider],
          profilePicture: randomDicebearUrl(username),
          seoAccounts: {
            create: {
              provider,
              providerUserId,
            },
          },
          workspace: {
            create: {
              name: "My Workspace",
            },
          },
        },
      });

      return buildAuthPayload(createdUser);
    },

    verifyEmailCode: async (
      _: unknown,
      { email, code }: { email: string; code: string },
    ) => {
      if (!email || !code) {
        throw new Error("Email and code are required");
      }

      const user = await verifyEmailCode(email, code);
      checkAchievements(user.id, "email_verified").catch(() => null);
      sendWelcomeEmail(user.email, user.displayName).catch((error) => {
        console.error("Failed to send welcome email after verification:", error);
      });
      return true;
    },

    resendVerificationEmail: async (
      _: unknown,
      { email }: { email: string },
    ) => {
      if (!email) {
        throw new Error("Email is required");
      }

      const user = await (prisma as any).user.findFirst({
        where: { email, deleted: false, disabled: false },
      });

      if (!user) {
        return true;
      }

      if (user.emailVerified) {
        return true;
      }

      await sendVerificationEmailForUser(user.id, user.email);
      return true;
    },
    requestEmailChange: async (
      _: unknown,
      { newEmail }: { newEmail: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      try {
        await beginPendingEmailChange(ctx.user.sub, newEmail);
      } catch (error) {
        console.error("[requestEmailChange] Failed", {
          userId: ctx.user.sub,
          newEmail,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : error,
        });
        throw error;
      }

      return true;
    },
    changePassword: async (
      _: unknown,
      {
        currentPassword,
        newPassword,
      }: { currentPassword?: string | null; newPassword: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const currentPasswordValue = String(currentPassword || "");
      const newPasswordValue = String(newPassword || "");

      if (!newPasswordValue) {
        throw new Error("New password is required");
      }

      if (newPasswordValue.length < 8) {
        throw new Error("New password must be at least 8 characters");
      }

      if (currentPasswordValue && currentPasswordValue === newPasswordValue) {
        throw new Error(
          "New password must be different from your current password",
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.user.sub },
        select: {
          id: true,
          email: true,
          password: true,
          linkedSEOs: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const canCreatePasswordWithoutCurrent =
        Array.isArray(user.linkedSEOs) && user.linkedSEOs.length > 0;

      if (!currentPasswordValue && !canCreatePasswordWithoutCurrent) {
        throw new Error("Current password is required");
      }

      if (currentPasswordValue) {
        const passwordMatches = await bcrypt.compare(
          currentPasswordValue,
          user.password,
        );

        if (!passwordMatches) {
          throw new Error("Current password is incorrect");
        }
      }

      const nextPasswordHash = await bcrypt.hash(newPasswordValue, 12);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: nextPasswordHash,
        },
      });

      try {
        await sendPasswordChangedEmail(user.email);
      } catch (error) {
        console.error("[changePassword] Failed to send confirmation email", {
          userId: user.id,
          email: user.email,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : error,
        });
      }

      return true;
    },
    verifyPendingEmailChange: async (
      _: unknown,
      { code }: { code: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      if (!code) {
        throw new Error("Verification code is required");
      }

      return verifyPendingEmailChange(ctx.user.sub, code);
    },
    resendPendingEmailChange: async (_: unknown, __: unknown, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      return resendPendingEmailChange(ctx.user.sub);
    },
    deleteMyAccount: async (_: unknown, __: unknown, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.user.sub },
        select: { id: true, email: true },
      });
      if (!user) {
        throw new Error("User not found");
      }

      const deletedAt = new Date();
      const restoreDeadline = new Date(
        deletedAt.getTime() + ACCOUNT_RESTORE_WINDOW_MS,
      );

      await (prisma as any).user.update({
        where: { id: user.id },
        data: {
          deleted: true,
          deletedAt,
          disabled: false,
          disabledAt: null,
          disabledUntil: null,
        },
      });

      void sendAccountDeletedEmail(user.email, restoreDeadline).catch(
        (error) => {
          console.error("[deleteMyAccount] Failed to send deletion email", {
            userId: user.id,
            error,
          });
        },
      );

      return true;
    },
    restoreDeletedAccount: async (_: unknown, __: unknown, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.user.sub },
      });
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.deleted) {
        return user;
      }

      const { canRestore } = getDeletedAccountRestoreState(user);
      if (!canRestore) {
        throw new Error("Account has been permanently deleted");
      }

      const restoredUser = await (prisma as any).user.update({
        where: { id: user.id },
        data: {
          deleted: false,
          deletedAt: null,
        },
      });

      void sendAccountRecoveredEmail(restoredUser.email).catch((error) => {
        console.error("[restoreDeletedAccount] Failed to send recovery email", {
          userId: restoredUser.id,
          error,
        });
      });

      return restoredUser;
    },
    disableMyAccount: async (
      _: unknown,
      { until }: { until?: string | null },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const disabledUntil = until ? new Date(until) : null;
      if (disabledUntil && Number.isNaN(disabledUntil.getTime())) {
        throw new Error("Invalid disable until date");
      }

      await (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          disabled: true,
          disabledAt: new Date(),
          disabledUntil,
        },
      });

      return true;
    },
    reactivateMyAccount: async (_: unknown, __: unknown, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      await (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          disabled: false,
          disabledAt: null,
          disabledUntil: null,
        },
      });

      return true;
    },
    updateVisibilitySettings: async (
      _: unknown,
      {
        visibilityPublicProfile,
        visibilityPublicPosts,
        visibilityPublicComments,
        visibilityOnlineStatus,
      }: {
        visibilityPublicProfile: boolean;
        visibilityPublicPosts: boolean;
        visibilityPublicComments: boolean;
        visibilityOnlineStatus: boolean;
      },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedVisibilityPublicPosts = visibilityPublicProfile
        ? visibilityPublicPosts
        : false;

      return (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          visibilityPublicProfile,
          visibilityPublicPosts: normalizedVisibilityPublicPosts,
          visibilityPublicComments,
          visibilityOnlineStatus,
        },
      });
    },
    updateEmailNotificationSettings: async (
      _: unknown,
      {
        emailNotificationsAccountActivity,
        emailNotificationsWeeklySummary,
        emailNotificationsProductUpdates,
        emailNotificationsMarketing,
        emailNotificationsUploadReminder,
      }: {
        emailNotificationsAccountActivity: boolean;
        emailNotificationsWeeklySummary: boolean;
        emailNotificationsProductUpdates: boolean;
        emailNotificationsMarketing: boolean;
        emailNotificationsUploadReminder: boolean;
      },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      return (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          emailNotificationsAccountActivity,
          emailNotificationsWeeklySummary,
          emailNotificationsProductUpdates,
          emailNotificationsMarketing,
          emailNotificationsUploadReminder,
        },
      });
    },
    updatePushNotificationSettings: async (
      _: unknown,
      {
        pushNotificationsLikes,
        pushNotificationsComments,
        pushNotificationsFollows,
        pushNotificationsMentions,
      }: {
        pushNotificationsLikes: boolean;
        pushNotificationsComments: boolean;
        pushNotificationsFollows: boolean;
        pushNotificationsMentions: boolean;
      },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      return (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          pushNotificationsLikes,
          pushNotificationsComments,
          pushNotificationsFollows,
          pushNotificationsMentions,
        },
      });
    },
    updateTheme: async (_: unknown, { theme }: { theme: string }, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const VALID_THEMES = ["system", "light", "dark", "sepia"];
      const normalizedTheme = String(theme || "")
        .trim()
        .toLowerCase();
      if (!VALID_THEMES.includes(normalizedTheme)) {
        throw new Error(
          "Invalid theme. Must be one of: system, light, dark, sepia",
        );
      }

      return (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: { theme: normalizedTheme },
      });
    },
    followUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true, visibilityPublicProfile: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      if (targetUser.id === ctx.user.sub) {
        throw new Error("You cannot follow yourself");
      }

      const actor = await (prisma as any).user.findUnique({
        where: { id: ctx.user.sub },
        select: { displayName: true, username: true, profilePicture: true },
      });
      const actorLabel =
        actor?.displayName?.trim() || actor?.username?.trim() || "Someone";
      const actorHandle = actor?.username?.trim()
        ? `@${actor.username.trim()}`
        : actorLabel;

      // Private profile: create a follow request instead of a direct follow
      if (!targetUser.visibilityPublicProfile) {
        // Check if already following
        const existingFollow = await (prisma as any).follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: ctx.user.sub,
              followingId: targetUser.id,
            },
          },
        });
        if (existingFollow) {
          return { followed: true, pending: false };
        }

        // Upsert follow request (reset if previously declined/expired)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await (prisma as any).followRequest.upsert({
          where: {
            requesterId_targetId: {
              requesterId: ctx.user.sub,
              targetId: targetUser.id,
            },
          },
          update: {
            status: "PENDING",
            expiresAt,
          },
          create: {
            requesterId: ctx.user.sub,
            targetId: targetUser.id,
            status: "PENDING",
            expiresAt,
          },
        });

        await createNotificationSafely("followUser", {
          userId: targetUser.id,
          actorId: ctx.user.sub,
          type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
          title: `${actorLabel} requested to follow you`,
          description: actorHandle,
          icon: NOTIFICATION_ICON.FOLLOW_REQUEST,
          profilePicture: actor?.profilePicture,
        });

        return { followed: false, pending: true };
      }

      // Public profile: direct follow
      await (prisma as any).follow.upsert({
        where: {
          followerId_followingId: {
            followerId: ctx.user.sub,
            followingId: targetUser.id,
          },
        },
        update: {},
        create: {
          followerId: ctx.user.sub,
          followingId: targetUser.id,
        },
      });

      if (targetUser.id !== ctx.user.sub) {
        await createNotificationSafely("followUser", {
          userId: targetUser.id,
          actorId: ctx.user.sub,
          type: NOTIFICATION_TYPE.FOLLOW,
          title: `${actorLabel} followed you`,
          description: actorHandle,
          icon: NOTIFICATION_ICON.FOLLOW,
          profilePicture: actor?.profilePicture,
        });
        checkAchievements(targetUser.id, "follower_gained").catch(() => null);
      }
      checkAchievements(ctx.user.sub, "follow_given").catch(() => null);

      await Promise.all([
        emitFollowActivityForUser({
          userId: targetUser.id,
          reason: "followed",
          actorId: ctx.user.sub,
        }),
        emitFollowActivityForUser({
          userId: ctx.user.sub,
          reason: "followed",
          actorId: targetUser.id,
        }),
      ]);

      return { followed: true, pending: false };
    },
    unfollowUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      await (prisma as any).follow.deleteMany({
        where: {
          followerId: ctx.user.sub,
          followingId: targetUser.id,
        },
      });

      // Also remove any pending follow request
      await (prisma as any).followRequest.deleteMany({
        where: {
          requesterId: ctx.user.sub,
          targetId: targetUser.id,
        },
      });

      await deleteNotificationsSafely("unfollowUser", {
        userId: targetUser.id,
        actorId: ctx.user.sub,
        type: {
          in: [NOTIFICATION_TYPE.FOLLOW, NOTIFICATION_TYPE.FOLLOW_REQUEST],
        },
      });

      await Promise.all([
        emitFollowActivityForUser({
          userId: targetUser.id,
          reason: "unfollowed",
          actorId: ctx.user.sub,
        }),
        emitFollowActivityForUser({
          userId: ctx.user.sub,
          reason: "unfollowed",
          actorId: targetUser.id,
        }),
      ]);

      return true;
    },
    acceptFollowRequest: async (
      _: unknown,
      { requestId }: { requestId: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedId = String(requestId || "").trim();
      if (!normalizedId) {
        throw new Error("requestId is required");
      }

      const request = await (prisma as any).followRequest.findUnique({
        where: { id: normalizedId },
        select: {
          id: true,
          requesterId: true,
          targetId: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!request || request.targetId !== ctx.user.sub) {
        throw new Error("Follow request not found");
      }

      if (request.status !== "PENDING") {
        throw new Error("Follow request is no longer pending");
      }

      if (new Date(request.expiresAt) < new Date()) {
        await (prisma as any).followRequest.update({
          where: { id: normalizedId },
          data: { status: "EXPIRED" },
        });
        throw new Error("Follow request has expired");
      }

      // Accept: create the follow, mark request accepted
      await (prisma as any).follow.upsert({
        where: {
          followerId_followingId: {
            followerId: request.requesterId,
            followingId: request.targetId,
          },
        },
        update: {},
        create: {
          followerId: request.requesterId,
          followingId: request.targetId,
        },
      });

      await (prisma as any).followRequest.update({
        where: { id: normalizedId },
        data: { status: "ACCEPTED" },
      });

      // Remove the follow request notification
      await deleteNotificationsSafely("acceptFollowRequest", {
        userId: ctx.user.sub,
        actorId: request.requesterId,
        type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
      });

      // Notify the requester that their request was accepted
      const actor = await (prisma as any).user.findUnique({
        where: { id: ctx.user.sub },
        select: { displayName: true, username: true, profilePicture: true },
      });
      const actorLabel =
        actor?.displayName?.trim() || actor?.username?.trim() || "Someone";
      const actorHandle = actor?.username?.trim()
        ? `@${actor.username.trim()}`
        : actorLabel;

      await createNotificationSafely("acceptFollowRequest", {
        userId: request.requesterId,
        actorId: ctx.user.sub,
        type: NOTIFICATION_TYPE.FOLLOW,
        title: `${actorLabel} accepted your follow request`,
        description: actorHandle,
        icon: NOTIFICATION_ICON.FOLLOW,
        profilePicture: actor?.profilePicture,
      });

      await Promise.all([
        emitFollowActivityForUser({
          userId: request.targetId,
          reason: "follow-request-accepted",
          actorId: request.requesterId,
        }),
        emitFollowActivityForUser({
          userId: request.requesterId,
          reason: "follow-request-accepted",
          actorId: request.targetId,
        }),
      ]);

      return true;
    },
    declineFollowRequest: async (
      _: unknown,
      { requestId }: { requestId: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedId = String(requestId || "").trim();
      if (!normalizedId) {
        throw new Error("requestId is required");
      }

      const request = await (prisma as any).followRequest.findUnique({
        where: { id: normalizedId },
        select: { id: true, requesterId: true, targetId: true },
      });

      if (!request || request.targetId !== ctx.user.sub) {
        throw new Error("Follow request not found");
      }

      await (prisma as any).followRequest.update({
        where: { id: normalizedId },
        data: { status: "DECLINED" },
      });

      // Remove the follow request notification
      await deleteNotificationsSafely("declineFollowRequest", {
        userId: ctx.user.sub,
        actorId: request.requesterId,
        type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
      });

      return true;
    },
    cancelFollowRequest: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      await (prisma as any).followRequest.deleteMany({
        where: {
          requesterId: ctx.user.sub,
          targetId: targetUser.id,
        },
      });

      await deleteNotificationsSafely("cancelFollowRequest", {
        userId: targetUser.id,
        actorId: ctx.user.sub,
        type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
      });

      return true;
    },
    muteUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      if (targetUser.id === ctx.user.sub) {
        throw new Error("You cannot mute yourself");
      }

      await (prisma as any).mute.upsert({
        where: {
          muterId_mutedId: {
            muterId: ctx.user.sub,
            mutedId: targetUser.id,
          },
        },
        update: {},
        create: {
          muterId: ctx.user.sub,
          mutedId: targetUser.id,
        },
      });

      return true;
    },
    unmuteUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      await (prisma as any).mute.deleteMany({
        where: {
          muterId: ctx.user.sub,
          mutedId: targetUser.id,
        },
      });

      return true;
    },
    blockUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      if (targetUser.id === ctx.user.sub) {
        throw new Error("You cannot block yourself");
      }

      const blockedUserIds = await getBlockedUserIdsForViewer(ctx.user.sub);

      if (!blockedUserIds.includes(targetUser.id)) {
        await prisma.$transaction([
          (prisma as any).user.update({
            where: { id: ctx.user.sub },
            data: {
              blockedUserIds: {
                push: targetUser.id,
              },
            },
          }),
          (prisma as any).follow.deleteMany({
            where: {
              OR: [
                {
                  followerId: ctx.user.sub,
                  followingId: targetUser.id,
                },
                {
                  followerId: targetUser.id,
                  followingId: ctx.user.sub,
                },
              ],
            },
          }),
        ]);
      }

      return true;
    },
    unblockUser: async (
      _: unknown,
      { username }: { username: string },
      ctx: any,
    ) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const normalizedUsername = String(username || "").trim();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }

      const targetUser = await (prisma as any).user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: "insensitive",
          },
          deleted: false,
          disabled: false,
        },
        select: { id: true },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      const blockedUserIds = (
        await getBlockedUserIdsForViewer(ctx.user.sub)
      ).filter((blockedUserId: string) => blockedUserId !== targetUser.id);

      await (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: {
          blockedUserIds,
        },
      });

      return true;
    },

    completeProfile: async (_: unknown, args: any, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const username = args.username?.trim();
      const displayName = args.displayName?.trim();
      const institution = args.institution?.trim();
      const profilePicture = args.profilePicture?.trim();
      const profileBackground = args.profileBackground?.trim();
      const profileBackgroundFileBase64 = args.profileBackgroundFileBase64;
      const profileBackgroundFileName = args.profileBackgroundFileName?.trim();
      const profileBackgroundMimeType = args.profileBackgroundMimeType?.trim();
      const profilePictureFileBase64 = args.profilePictureFileBase64;
      const profilePictureFileName = args.profilePictureFileName?.trim();
      const profilePictureMimeType = args.profilePictureMimeType?.trim();
      const hasInstitutionVisibilityArg = Object.prototype.hasOwnProperty.call(
        args,
        "institutionVisibility",
      );
      const hasProgramVisibilityArg = Object.prototype.hasOwnProperty.call(
        args,
        "programVisibility",
      );
      const hasProfilePictureArg = Object.prototype.hasOwnProperty.call(
        args,
        "profilePicture",
      );
      const hasProfilePictureFile =
        typeof profilePictureFileBase64 === "string" &&
        profilePictureFileBase64.trim().length > 0;
      const hasProfileBackgroundArg = Object.prototype.hasOwnProperty.call(
        args,
        "profileBackground",
      );
      const hasProfileBackgroundFile =
        typeof profileBackgroundFileBase64 === "string" &&
        profileBackgroundFileBase64.trim().length > 0;

      if (!username || !displayName) {
        throw new Error("Username and display name are required");
      }

      if (RESERVED_USERNAMES.has(username.toLowerCase())) {
        throw new Error("This username is reserved");
      }

      const existingUser = await (prisma as any).user.findUnique({
        where: { id: ctx.user.sub },
        select: {
          profilePicture: true,
          profileBackground: true,
          subscriptionPlan: true,
        },
      });
      if (!existingUser) {
        throw new Error("User not found");
      }

      let uploadedProfilePictureUrl: string | null = null;
      let uploadedProfileBackgroundUrl: string | null = null;

      try {
        const updateData: Record<string, unknown> = {
          username,
          displayName,
          institution,
          program: args.program ?? null,
        };

        if (hasInstitutionVisibilityArg) {
          updateData.institutionVisibility = normalizeProfileFieldVisibility(
            args.institutionVisibility,
          );
        }

        if (hasProgramVisibilityArg) {
          updateData.programVisibility = normalizeProfileFieldVisibility(
            args.programVisibility,
          );
        }

        const hasPaidPlan = hasPaidSubscriptionPlan(
          existingUser.subscriptionPlan,
        );

        if (hasProfileBackgroundFile && !hasPaidPlan) {
          throw new Error(
            "Profile backgrounds are available to Pro and Premium users only",
          );
        }

        if (hasProfileBackgroundFile) {
          if (!profileBackgroundFileName || !profileBackgroundMimeType) {
            throw new Error(
              "Profile background file name and mime type are required",
            );
          }

          const normalizedBackgroundMime =
            profileBackgroundMimeType.toLowerCase();
          if (
            !ALLOWED_PROFILE_BACKGROUND_MIME_TYPES.has(normalizedBackgroundMime)
          ) {
            throw new Error("Use JPG, PNG, WEBP, or GIF only.");
          }

          const backgroundBuffer = Buffer.from(
            profileBackgroundFileBase64,
            "base64",
          );
          if (!backgroundBuffer.length) {
            throw new Error("Uploaded profile background is empty");
          }
          if (backgroundBuffer.length > MAX_PROFILE_BACKGROUND_BYTES) {
            throw new Error("Profile background must be 5MB or smaller");
          }

          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
          if (!publicBucket) {
            throw new Error("S3 bucket configuration is missing");
          }

          const fileNameWithoutExtension = profileBackgroundFileName.replace(
            /\.[^.]+$/,
            "",
          );
          const sanitizedBaseName = sanitizeFileName(fileNameWithoutExtension);

          const isGif = normalizedBackgroundMime === "image/gif";
          let finalBackgroundBuffer: Buffer;
          let finalContentType: string;
          let finalExtension: string;

          if (isGif) {
            // Validate GIF magic bytes (GIF87a or GIF89a) then store raw to preserve animation
            const validGif =
              backgroundBuffer.length >= 6 &&
              backgroundBuffer[0] === 0x47 && // G
              backgroundBuffer[1] === 0x49 && // I
              backgroundBuffer[2] === 0x46 && // F
              backgroundBuffer[3] === 0x38 && // 8
              (backgroundBuffer[4] === 0x37 || backgroundBuffer[4] === 0x39) && // 7 or 9
              backgroundBuffer[5] === 0x61;   // a
            if (!validGif) throw new Error("Invalid GIF file");
            finalBackgroundBuffer = backgroundBuffer;
            finalContentType = "image/gif";
            finalExtension = "gif";
          } else {
            // Re-encode through Sharp to strip hidden payloads and normalize
            const sharpPipeline = sharp(backgroundBuffer).rotate();
            if (normalizedBackgroundMime === "image/png") {
              finalBackgroundBuffer = await sharpPipeline.png().toBuffer();
              finalContentType = "image/png";
              finalExtension = "png";
            } else if (normalizedBackgroundMime === "image/webp") {
              finalBackgroundBuffer = await sharpPipeline.webp({ quality: 85 }).toBuffer();
              finalContentType = "image/webp";
              finalExtension = "webp";
            } else {
              finalBackgroundBuffer = await sharpPipeline.jpeg({ quality: 85 }).toBuffer();
              finalContentType = "image/jpeg";
              finalExtension = "jpg";
            }
          }

          const key = `profileBackgrounds/${Date.now()}-${randomUUID()}-${sanitizedBaseName || "profile-background"}.${finalExtension}`;
          await s3.send(
            new PutObjectCommand({
              Bucket: publicBucket,
              Key: key,
              Body: finalBackgroundBuffer,
              ContentType: finalContentType,
            }),
          );

          uploadedProfileBackgroundUrl = buildCloudFrontUrl(key);
          updateData.profileBackground = uploadedProfileBackgroundUrl;
        } else if (hasProfileBackgroundArg) {
          if (
            !profileBackground ||
            profileBackground === DEFAULT_PROFILE_BACKGROUND
          ) {
            updateData.profileBackground = DEFAULT_PROFILE_BACKGROUND;
          } else if (!hasPaidPlan) {
            throw new Error(
              "Profile backgrounds are available to Pro and Premium users only",
            );
          }
        }

        if (hasProfilePictureFile) {
          if (!profilePictureFileName || !profilePictureMimeType) {
            throw new Error(
              "Profile picture file name and mime type are required",
            );
          }

          const normalizedMime = profilePictureMimeType.toLowerCase();
          if (!ALLOWED_PROFILE_PICTURE_MIME_TYPES.has(normalizedMime)) {
            throw new Error("Use JPG, PNG, or WEBP only.");
          }

          const fileBuffer = Buffer.from(profilePictureFileBase64, "base64");
          if (!fileBuffer.length) {
            throw new Error("Uploaded profile picture is empty");
          }
          if (fileBuffer.length > MAX_PROFILE_PICTURE_BYTES) {
            throw new Error("Profile picture must be 10MB or smaller");
          }

          let processedImageBuffer: Buffer;
          try {
            processedImageBuffer = await sharp(fileBuffer)
              .rotate()
              .resize({
                width: PROFILE_PICTURE_MAX_DIMENSION,
                height: PROFILE_PICTURE_MAX_DIMENSION,
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: PROFILE_PICTURE_WEBP_QUALITY })
              .toBuffer();
          } catch {
            throw new Error("Failed to process profile picture");
          }

          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
          if (!publicBucket) {
            throw new Error("S3 bucket configuration is missing");
          }

          const fileNameWithoutExtension = profilePictureFileName.replace(
            /\.[^.]+$/,
            "",
          );
          const sanitizedBaseName = sanitizeFileName(fileNameWithoutExtension);
          const key = `profilePictures/${Date.now()}-${randomUUID()}-${sanitizedBaseName || "profile"}.webp`;
          await s3.send(
            new PutObjectCommand({
              Bucket: publicBucket,
              Key: key,
              Body: processedImageBuffer,
              ContentType: "image/webp",
            }),
          );

          uploadedProfilePictureUrl = buildCloudFrontUrl(key);
          updateData.profilePicture = uploadedProfilePictureUrl;
        } else if (hasProfilePictureArg) {
          updateData.profilePicture = profilePicture || null;
        }

        const updatedUser = await (prisma as any).user.update({
          where: { id: ctx.user.sub },
          data: updateData,
        });

        if (hasProfilePictureFile && existingUser.profilePicture) {
          const previousPictureKey = extractS3Key(existingUser.profilePicture);
          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;

          if (
            previousPictureKey &&
            publicBucket &&
            existingUser.profilePicture !== uploadedProfilePictureUrl
          ) {
            void s3
              .send(
                new DeleteObjectCommand({
                  Bucket: publicBucket,
                  Key: previousPictureKey,
                }),
              )
              .catch(() => null);
          }
        }

        if (
          (hasProfileBackgroundFile ||
            updateData.profileBackground === DEFAULT_PROFILE_BACKGROUND) &&
          existingUser.profileBackground &&
          existingUser.profileBackground !== DEFAULT_PROFILE_BACKGROUND
        ) {
          const previousBackgroundKey = extractS3Key(
            existingUser.profileBackground,
          );
          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;

          if (
            previousBackgroundKey &&
            publicBucket &&
            existingUser.profileBackground !== uploadedProfileBackgroundUrl
          ) {
            void s3
              .send(
                new DeleteObjectCommand({
                  Bucket: publicBucket,
                  Key: previousBackgroundKey,
                }),
              )
              .catch(() => null);
          }
        }

        checkAchievements(ctx.user.sub, "profile_updated").catch(() => null);
        return updatedUser;
      } catch (error) {
        if (uploadedProfilePictureUrl) {
          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
          if (publicBucket) {
            const uploadedPictureKey = extractS3Key(uploadedProfilePictureUrl);
            if (uploadedPictureKey) {
              void s3
                .send(
                  new DeleteObjectCommand({
                    Bucket: publicBucket,
                    Key: uploadedPictureKey,
                  }),
                )
                .catch(() => null);
            }
          }
        }

        if (uploadedProfileBackgroundUrl) {
          const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
          if (publicBucket) {
            const uploadedBackgroundKey = extractS3Key(
              uploadedProfileBackgroundUrl,
            );
            if (uploadedBackgroundKey) {
              void s3
                .send(
                  new DeleteObjectCommand({
                    Bucket: publicBucket,
                    Key: uploadedBackgroundKey,
                  }),
                )
                .catch(() => null);
            }
          }
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new Error("Username already in use");
        }

        throw error;
      }
    },

    redeemTokensForSubscription: async (
      _: unknown,
      { plan }: { plan: string },
      ctx: any,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated");

      const normalizedPlan = String(plan || "").trim().toLowerCase();
      if (normalizedPlan !== "pro" && normalizedPlan !== "premium") {
        throw new Error("Invalid plan. Must be 'pro' or 'premium'.");
      }

      const COSTS: Record<string, number> = { pro: 3990, premium: 6990 };
      const cost = COSTS[normalizedPlan];

      const user = await (prisma as any).user.findUnique({
        where: { id: viewerId },
        select: { tokenBalance: true, subscriptionPlan: true },
      });

      if (!user) throw new Error("User not found");
      if (user.tokenBalance < cost) {
        throw new Error(`Not enough tokens. You need ${cost} tokens for ${normalizedPlan}.`);
      }

      // Already on this plan or higher — prevent downgrade/same redemption
      const planTier: Record<string, number> = { free: 0, pro: 1, premium: 2 };
      const currentTier = planTier[user.subscriptionPlan] ?? 0;
      const targetTier = planTier[normalizedPlan] ?? 0;
      if (currentTier >= targetTier && user.subscriptionPlan !== "free") {
        throw new Error(`You already have ${user.subscriptionPlan} or a higher plan active.`);
      }

      const now = new Date();
      const oneMonthLater = new Date(now);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

      await (prisma as any).$transaction([
        (prisma as any).user.update({
          where: { id: viewerId },
          data: {
            tokenBalance: { decrement: cost },
            tokensRedeemed: { increment: cost },
            subscriptionPlan: normalizedPlan,
            subscriptionStartedAt: now,
            subscriptionEndsAt: oneMonthLater,
          },
        }),
        (prisma as any).tokenTransaction.create({
          data: {
            userId: viewerId,
            type: normalizedPlan === "pro" ? "REDEEM_PRO" : "REDEEM_PREMIUM",
            amount: -cost,
            description: `Redeemed for 1 month ${normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1)} subscription`,
          },
        }),
      ]);

      return true;
    },

    requestTokenCashout: async (
      _: unknown,
      {
        tokensAmount,
        payoutMethod,
        payoutDetails,
      }: { tokensAmount: number; payoutMethod: string; payoutDetails: string },
      ctx: any,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) throw new Error("Not authenticated");

      const MIN_CASHOUT = 5000;
      const TOKENS_PER_DOLLAR = 1000;

      const VALID_METHODS = ["paypal", "mobile_money", "bank_transfer"];
      const method = String(payoutMethod || "").trim().toLowerCase();
      if (!VALID_METHODS.includes(method)) {
        throw new Error("Invalid payout method.");
      }

      let parsedDetails: Record<string, unknown>;
      try {
        parsedDetails = JSON.parse(payoutDetails);
        if (!parsedDetails || typeof parsedDetails !== "object" || Array.isArray(parsedDetails)) {
          throw new Error("Invalid payout details format.");
        }
      } catch {
        throw new Error("Payout details must be valid JSON.");
      }

      // Validate required fields per method
      if (method === "paypal") {
        const email = String(parsedDetails.email || "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("A valid PayPal email is required.");
        }
        parsedDetails.email = email;
      } else if (method === "mobile_money") {
        if (!String(parsedDetails.phone || "").trim()) {
          throw new Error("Phone number is required for mobile money.");
        }
        if (!String(parsedDetails.provider || "").trim()) {
          throw new Error("Provider name is required for mobile money (e.g. M-Pesa).");
        }
      } else if (method === "bank_transfer") {
        if (!String(parsedDetails.accountName || "").trim()) {
          throw new Error("Account name is required for bank transfer.");
        }
        if (!String(parsedDetails.accountNumber || "").trim()) {
          throw new Error("Account number is required for bank transfer.");
        }
        if (!String(parsedDetails.bankName || "").trim()) {
          throw new Error("Bank name is required for bank transfer.");
        }
      }

      const amount = Math.floor(Number(tokensAmount));
      if (!Number.isFinite(amount) || amount < MIN_CASHOUT) {
        throw new Error(`Minimum cashout is ${MIN_CASHOUT} tokens ($${(MIN_CASHOUT / TOKENS_PER_DOLLAR).toFixed(2)}).`);
      }

      const user = await (prisma as any).user.findUnique({
        where: { id: viewerId },
        select: { tokenBalance: true },
      });

      if (!user) throw new Error("User not found");
      if (user.tokenBalance < amount) {
        throw new Error(`Not enough tokens. You have ${user.tokenBalance} tokens.`);
      }

      // Block duplicate pending requests
      const existingPending = await (prisma as any).tokenCashoutRequest.findFirst({
        where: { userId: viewerId, status: "pending" },
        select: { id: true },
      });
      if (existingPending) {
        throw new Error("You already have a pending cashout request. Please wait for it to be processed.");
      }

      const cashAmount = amount / TOKENS_PER_DOLLAR;
      const methodLabel =
        method === "paypal"
          ? `PayPal (${parsedDetails.email})`
          : method === "mobile_money"
            ? `Mobile Money – ${parsedDetails.provider} (${parsedDetails.phone})`
            : `Bank Transfer – ${parsedDetails.bankName}`;

      await (prisma as any).$transaction([
        (prisma as any).user.update({
          where: { id: viewerId },
          data: {
            tokenBalance: { decrement: amount },
            tokensRedeemed: { increment: amount },
          },
        }),
        (prisma as any).tokenCashoutRequest.create({
          data: {
            userId: viewerId,
            tokensAmount: amount,
            cashAmount,
            payoutMethod: method,
            payoutDetails: parsedDetails,
            status: "pending",
          },
        }),
        (prisma as any).tokenTransaction.create({
          data: {
            userId: viewerId,
            type: "REDEEM_CASH",
            amount: -amount,
            description: `Cashout request: $${cashAmount.toFixed(2)} via ${methodLabel}`,
          },
        }),
      ]);

      return true;
    },

    removeProfilePicture: async (_: unknown, _args: unknown, ctx: any) => {
      if (!ctx.user?.sub) {
        throw new Error("Not authenticated");
      }

      const existingUser = await (prisma as any).user.findUnique({
        where: { id: ctx.user.sub },
        select: { profilePicture: true },
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      if (!existingUser.profilePicture) {
        return true;
      }

      await (prisma as any).user.update({
        where: { id: ctx.user.sub },
        data: { profilePicture: null },
      });

      const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
      if (publicBucket) {
        const previousPictureKey = extractS3Key(existingUser.profilePicture);
        if (previousPictureKey) {
          void s3
            .send(
              new DeleteObjectCommand({
                Bucket: publicBucket,
                Key: previousPictureKey,
              }),
            )
            .catch(() => null);
        }
      }

      return true;
    },
  },
  User: {
    pendingEmail: async (user: {
      id: string;
      pendingEmail?: string | null;
      emailVerificationTokenExpiresAt?: Date | string | null;
    }) => getVisiblePendingEmail(user),
    visibilityPublicProfile: (user: {
      visibilityPublicProfile?: boolean | null;
    }) => user.visibilityPublicProfile ?? true,
    visibilityPublicPosts: (user: {
      visibilityPublicProfile?: boolean | null;
      visibilityPublicPosts?: boolean | null;
    }) => {
      if (user.visibilityPublicProfile === false) {
        return false;
      }

      return user.visibilityPublicPosts ?? true;
    },
    visibilityPublicComments: (user: {
      visibilityPublicComments?: boolean | null;
    }) => user.visibilityPublicComments ?? true,
    visibilityOnlineStatus: (user: {
      visibilityOnlineStatus?: boolean | null;
    }) => user.visibilityOnlineStatus ?? true,
    institutionVisibility: (user: { institutionVisibility?: string | null }) =>
      normalizeProfileFieldVisibility(user.institutionVisibility),
    programVisibility: (user: { programVisibility?: string | null }) =>
      normalizeProfileFieldVisibility(user.programVisibility),
    isBot: (user: { isBot?: boolean | null }) => user.isBot ?? false,
    institution: async (
      user: {
        id: string;
        institution?: string | null;
        institutionVisibility?: string | null;
      },
      _: unknown,
      ctx: any,
    ) => {
      const value = user.institution?.trim();
      if (!value) {
        return null;
      }

      return (await canViewerSeeProfileField(
        user,
        user.institutionVisibility,
        ctx.user?.sub,
      ))
        ? value
        : null;
    },
    program: async (
      user: {
        id: string;
        program?: string | null;
        programVisibility?: string | null;
      },
      _: unknown,
      ctx: any,
    ) => {
      const value = user.program?.trim();
      if (!value) {
        return null;
      }

      return (await canViewerSeeProfileField(
        user,
        user.programVisibility,
        ctx.user?.sub,
      ))
        ? value
        : null;
    },
    emailNotificationsAccountActivity: (user: {
      emailNotificationsAccountActivity?: boolean | null;
    }) => user.emailNotificationsAccountActivity ?? true,
    emailNotificationsWeeklySummary: (user: {
      emailNotificationsWeeklySummary?: boolean | null;
    }) => user.emailNotificationsWeeklySummary ?? true,
    emailNotificationsProductUpdates: (user: {
      emailNotificationsProductUpdates?: boolean | null;
    }) => user.emailNotificationsProductUpdates ?? true,
    emailNotificationsMarketing: (user: {
      emailNotificationsMarketing?: boolean | null;
    }) => user.emailNotificationsMarketing ?? true,
    emailNotificationsUploadReminder: (user: {
      emailNotificationsUploadReminder?: boolean | null;
    }) => user.emailNotificationsUploadReminder ?? true,
    profilePicture: (user: { profilePicture?: string | null }) =>
      user.profilePicture?.trim() || null,
    profileBackground: (user: { profileBackground?: string | null }) =>
      user.profileBackground?.trim() || DEFAULT_PROFILE_BACKGROUND,
    followers: async (user: { id: string }) => {
      const follows = await (prisma as any).follow.findMany({
        where: { followingId: user.id },
        include: { follower: true },
        orderBy: { createdAt: "desc" },
      });

      return follows.map((entry: { follower: unknown }) => entry.follower);
    },
    following: async (user: { id: string }) => {
      const follows = await (prisma as any).follow.findMany({
        where: { followerId: user.id },
        include: { following: true },
        orderBy: { createdAt: "desc" },
      });

      return follows.map((entry: { following: unknown }) => entry.following);
    },
    mutedUsers: async (user: { id: string }) => {
      const mutes = await (prisma as any).mute.findMany({
        where: { muterId: user.id },
        include: { muted: true },
        orderBy: { createdAt: "desc" },
      });

      return mutes.map((entry: { muted: unknown }) => entry.muted);
    },
    blockedUsers: async (user: { id: string; blockedUserIds?: string[] }) => {
      const ids = Array.isArray(user.blockedUserIds) ? user.blockedUserIds : [];
      if (ids.length === 0) return [];

      return (prisma as any).user.findMany({
        where: { id: { in: ids }, deleted: false, disabled: false },
      });
    },
    followersCount: async (user: { id: string }) => {
      return (prisma as any).follow.count({
        where: { followingId: user.id },
      });
    },
    followingCount: async (user: { id: string }) => {
      return (prisma as any).follow.count({
        where: { followerId: user.id },
      });
    },
    createdAt: (user: { createdAt?: unknown }) =>
      toIsoStringOrNull(user.createdAt),
    deletedAt: (user: { deletedAt?: unknown }) =>
      toIsoStringOrNull(user.deletedAt),
    disabledAt: (user: { disabledAt?: unknown }) =>
      toIsoStringOrNull(user.disabledAt),
    disabledUntil: (user: { disabledUntil?: unknown }) =>
      toIsoStringOrNull(user.disabledUntil),
    subscriptionStartedAt: (user: { subscriptionStartedAt?: unknown }) =>
      toIsoStringOrNull(user.subscriptionStartedAt),
    subscriptionEndsAt: (user: { subscriptionEndsAt?: unknown }) =>
      toIsoStringOrNull(user.subscriptionEndsAt),
    pendingSubscriptionEffectiveAt: (user: {
      pendingSubscriptionEffectiveAt?: unknown;
    }) => toIsoStringOrNull(user.pendingSubscriptionEffectiveAt),
  },
};
