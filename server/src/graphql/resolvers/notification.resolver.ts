import { prisma } from "../../config/prisma.js";
import {
  createNotification,
  NOTIFICATION_ICON,
  NOTIFICATION_TYPE,
} from "../../services/notifications.js";
import { emitNotificationActivity } from "../../realtime/postActivity.js";

type GraphQLContext = {
  user?: {
    sub?: string;
  };
};

const resolveNotificationProfilePicture = (profilePicture?: string | null) =>
  profilePicture?.trim() || null;

const resolveNotificationActorUsername = async (actorId?: string | null) => {
  const normalizedActorId = actorId?.trim();
  if (!normalizedActorId) {
    return null;
  }

  const actor = await (prisma as any).user.findUnique({
    where: { id: normalizedActorId },
    select: { username: true },
  });

  return actor?.username?.trim() || null;
};

const resolveNotificationTargets = async (notification: any) => {
  const storedPostId = notification.postId?.trim?.() || null;
  const storedCommentId = notification.commentId?.trim?.() || null;

  if (storedPostId || storedCommentId) {
    return {
      postId: storedPostId,
      commentId: storedCommentId,
    };
  }

  const actorId = notification.actorId?.trim?.() || null;
  const recipientUserId = notification.userId?.trim?.() || null;
  if (!actorId || !recipientUserId) {
    return {
      postId: storedPostId,
      commentId: storedCommentId,
    };
  }

  const parsedTime =
    notification.time instanceof Date
      ? notification.time
      : new Date(notification.time);
  const timeUpperBound = Number.isNaN(parsedTime.getTime())
    ? undefined
    : new Date(parsedTime.getTime() + 5 * 60 * 1000);

  if (notification.type === NOTIFICATION_TYPE.POST_LIKE) {
    const relatedLike = await prisma.like.findFirst({
      where: {
        userId: actorId,
        ...(timeUpperBound ? { createdAt: { lte: timeUpperBound } } : {}),
        post: {
          authorId: recipientUserId,
          deleted: false,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { postId: true },
    });

    return {
      postId: relatedLike?.postId ?? null,
      commentId: null,
    };
  }

  if (notification.type === NOTIFICATION_TYPE.COMMENT) {
    const relatedComment = await (prisma as any).comment.findFirst({
      where: {
        authorId: actorId,
        ...(timeUpperBound ? { createdAt: { lte: timeUpperBound } } : {}),
        post: {
          authorId: recipientUserId,
          deleted: false,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, postId: true },
    });

    return {
      postId: relatedComment?.postId ?? null,
      commentId: relatedComment?.id ?? null,
    };
  }

  if (notification.type === NOTIFICATION_TYPE.MENTION) {
    const relatedComment = await (prisma as any).comment.findFirst({
      where: {
        authorId: actorId,
        ...(timeUpperBound ? { createdAt: { lte: timeUpperBound } } : {}),
        content: { contains: "@", mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, postId: true },
    });

    if (relatedComment) {
      return {
        postId: relatedComment.postId ?? null,
        commentId: relatedComment.id ?? null,
      };
    }

    // Mention from post description — find the post by actorId
    const relatedPost = await prisma.post.findFirst({
      where: {
        authorId: actorId,
        deleted: false,
        ...(timeUpperBound ? { createdAt: { lte: timeUpperBound } } : {}),
        description: { contains: "@", mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    return {
      postId: relatedPost?.id ?? null,
      commentId: null,
    };
  }

  if (notification.type === NOTIFICATION_TYPE.COMMENT_LIKE) {
    const relatedCommentLike = await (prisma as any).commentLike.findFirst({
      where: {
        userId: actorId,
        ...(timeUpperBound ? { createdAt: { lte: timeUpperBound } } : {}),
        comment: {
          authorId: recipientUserId,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        commentId: true,
        comment: {
          select: { postId: true },
        },
      },
    });

    return {
      postId: relatedCommentLike?.comment?.postId ?? null,
      commentId: relatedCommentLike?.commentId ?? null,
    };
  }

  return {
    postId: storedPostId,
    commentId: storedCommentId,
  };
};

const toNotificationGraphQL = async (
  notification: any,
  options?: {
    actorUsernameById?: Map<string, string>;
    followRequestIdByActorId?: Map<string, string>;
  },
) => {
  const normalizedActorId = notification.actorId?.trim?.() || null;
  const actorUsernameFromMap = normalizedActorId
    ? (options?.actorUsernameById?.get(normalizedActorId) ?? null)
    : null;
  const [actorUsername, targets, profilePicture] = await Promise.all([
    actorUsernameFromMap !== null
      ? Promise.resolve(actorUsernameFromMap)
      : resolveNotificationActorUsername(notification.actorId),
    resolveNotificationTargets(notification),
    resolveNotificationProfilePicture(notification.profilePicture),
  ]);

  return {
    id: notification.id,
    type: notification.type ?? NOTIFICATION_TYPE.SYSTEM,
    actorId: notification.actorId ?? null,
    actorUsername,
    postId: targets.postId,
    commentId: targets.commentId,
    caseId: notification.caseId?.trim?.() || null,
    followRequestId:
      notification.type === NOTIFICATION_TYPE.FOLLOW_REQUEST &&
      normalizedActorId
        ? (options?.followRequestIdByActorId?.get(normalizedActorId) ?? null)
        : null,
    achievementId: notification.achievementId ?? null,
    title: notification.title,
    description: notification.description,
    icon: notification.icon,
    profilePicture,
    unread: Boolean(notification.unread),
    time:
      notification.time instanceof Date
        ? notification.time.toISOString()
        : new Date(notification.time).toISOString(),
  };
};

export const NotificationResolver = {
  Query: {
    notifications: async (
      _: unknown,
      {
        limit = 50,
        unreadOnly = false,
      }: { limit?: number; unreadOnly?: boolean },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const safeLimit = Number.isFinite(limit)
        ? Math.min(Math.max(limit, 1), 100)
        : 50;

      const notifications = await (prisma as any).notification.findMany({
        where: {
          userId: viewerId,
          ...(unreadOnly ? { unread: true } : {}),
        },
        orderBy: { time: "desc" },
        take: safeLimit,
      });

      const actorIds = Array.from(
        new Set(
          notifications
            .map(
              (notification: { actorId?: string | null }) =>
                notification.actorId?.trim() || "",
            )
            .filter(Boolean),
        ),
      );

      const followRequestActorIds = Array.from(
        new Set(
          notifications
            .filter(
              (notification: { type?: string; actorId?: string | null }) =>
                notification.type === NOTIFICATION_TYPE.FOLLOW_REQUEST &&
                Boolean(notification.actorId?.trim()),
            )
            .map(
              (notification: { actorId?: string | null }) =>
                notification.actorId?.trim() || "",
            ),
        ),
      );

      const [actors, pendingFollowRequests] = await Promise.all([
        actorIds.length
          ? (prisma as any).user.findMany({
              where: {
                id: {
                  in: actorIds,
                },
              },
              select: {
                id: true,
                username: true,
              },
            })
          : Promise.resolve([]),
        followRequestActorIds.length
          ? (prisma as any).followRequest.findMany({
              where: {
                requesterId: {
                  in: followRequestActorIds,
                },
                targetId: viewerId,
                status: "PENDING",
                expiresAt: {
                  gt: new Date(),
                },
              },
              select: {
                id: true,
                requesterId: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const actorUsernameById = new Map<string, string>(
        actors.map((actor: { id: string; username?: string | null }) => [
          actor.id,
          actor.username?.trim() || "",
        ]),
      );
      const followRequestIdByActorId = new Map<string, string>(
        pendingFollowRequests.map(
          (request: { id: string; requesterId: string }) => [
            request.requesterId,
            request.id,
          ],
        ),
      );

      return Promise.all(
        notifications.map((notification: any) =>
          toNotificationGraphQL(notification, {
            actorUsernameById,
            followRequestIdByActorId,
          }),
        ),
      );
    },
  },
  Mutation: {
    createNotification: async (
      _: unknown,
      {
        title,
        description,
        icon,
        profilePicture,
        userId,
        postId,
        commentId,
        type,
      }: {
        title: string;
        description: string;
        icon: string;
        profilePicture?: string;
        userId?: string;
        postId?: string;
        commentId?: string;
        type?: string;
      },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const targetUserId = userId?.trim() || viewerId;
      const notification = await createNotification({
        userId: targetUserId,
        title,
        description,
        icon: icon?.trim() || NOTIFICATION_ICON.SYSTEM,
        profilePicture,
        type,
        postId,
        commentId,
      });

      return toNotificationGraphQL(notification);
    },
    markNotificationRead: async (
      _: unknown,
      { notificationId }: { notificationId: string },
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      const normalizedId = notificationId?.trim();
      if (!normalizedId) {
        throw new Error("notificationId is required");
      }

      const existing = await (prisma as any).notification.findUnique({
        where: { id: normalizedId },
        select: { id: true, userId: true },
      });

      if (!existing || existing.userId !== viewerId) {
        throw new Error("Notification not found");
      }

      const notification = await (prisma as any).notification.update({
        where: { id: normalizedId },
        data: { unread: false },
      });

      const unreadCount = await (prisma as any).notification.count({
        where: {
          userId: viewerId,
          unread: true,
        },
      });

      emitNotificationActivity({
        userId: viewerId,
        reason: "notification-read",
        notificationId: normalizedId,
        unreadCount,
      });

      return toNotificationGraphQL(notification);
    },
    markAllNotificationsRead: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext,
    ) => {
      const viewerId = ctx.user?.sub;
      if (!viewerId) {
        throw new Error("Not authenticated");
      }

      await (prisma as any).notification.updateMany({
        where: {
          userId: viewerId,
          unread: true,
        },
        data: {
          unread: false,
        },
      });

      emitNotificationActivity({
        userId: viewerId,
        reason: "notifications-read-all",
        unreadCount: 0,
      });

      return true;
    },
  },
};
