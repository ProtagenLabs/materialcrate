import { prisma } from "../config/prisma.js";
import { emitNotificationActivity } from "../realtime/postActivity.js";

export const NOTIFICATION_ICON = {
  COMMENT: "MessageText1",
  COMMENT_LIKE: "Like1",
  FOLLOW: "Profile2User",
  FOLLOW_REQUEST: "Profile2User",
  MENTION: "MessageText1",
  POST_LIKE: "Heart",
  SYSTEM: "Notification",
  ACHIEVEMENT: "Award",
  PLAGIARISM: "Shield",
  DOCUMENT_REQUEST: "DocumentText1",
} as const;

export const NOTIFICATION_TYPE = {
  COMMENT: "COMMENT",
  COMMENT_LIKE: "COMMENT_LIKE",
  FOLLOW: "FOLLOW",
  FOLLOW_REQUEST: "FOLLOW_REQUEST",
  MENTION: "MENTION",
  POST_LIKE: "POST_LIKE",
  SYSTEM: "SYSTEM",
  ACHIEVEMENT_UNLOCKED: "ACHIEVEMENT_UNLOCKED",
  PLAGIARISM_ORIGINAL_AUTHOR: "PLAGIARISM_ORIGINAL_AUTHOR",
  PLAGIARISM_FLAGGED_UPLOAD: "PLAGIARISM_FLAGGED_UPLOAD",
  DOCUMENT_REQUEST_FULFILLED: "DOCUMENT_REQUEST_FULFILLED",
  DOCUMENT_REQUEST_ACCEPTED: "DOCUMENT_REQUEST_ACCEPTED",
  DOCUMENT_REQUEST_FULFILLMENT_LIKED: "DOCUMENT_REQUEST_FULFILLMENT_LIKED",
  DOCUMENT_REQUEST_CLOSED: "DOCUMENT_REQUEST_CLOSED",
} as const;

const PUSH_NOTIFICATION_TYPE_TO_PREF: Record<string, string> = {
  [NOTIFICATION_TYPE.POST_LIKE]: "pushNotificationsLikes",
  [NOTIFICATION_TYPE.COMMENT_LIKE]: "pushNotificationsLikes",
  [NOTIFICATION_TYPE.COMMENT]: "pushNotificationsComments",
  [NOTIFICATION_TYPE.FOLLOW]: "pushNotificationsFollows",
  [NOTIFICATION_TYPE.FOLLOW_REQUEST]: "pushNotificationsFollows",
  [NOTIFICATION_TYPE.MENTION]: "pushNotificationsMentions",
};

type CreateNotificationInput = {
  userId: string;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  caseId?: string | null;
  requestId?: string | null;
  achievementId?: string | null;
  type?: string;
  title: string;
  description: string;
  icon: string;
  profilePicture?: string | null;
  unread?: boolean;
};

export const createNotification = async ({
  userId,
  actorId,
  postId,
  commentId,
  caseId,
  requestId,
  achievementId,
  type = NOTIFICATION_TYPE.SYSTEM,
  title,
  description,
  icon,
  profilePicture,
  unread = true,
}: CreateNotificationInput) => {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    throw new Error("Notification userId is required");
  }

  const normalizedType = type.trim() || NOTIFICATION_TYPE.SYSTEM;

  const notification = await (prisma as any).notification.create({
    data: {
      userId: normalizedUserId,
      actorId: actorId?.trim() || null,
      type: normalizedType,
      title: title.trim(),
      description: description.trim(),
      icon: icon.trim(),
      profilePicture: profilePicture?.trim() || null,
      achievementId: achievementId?.trim() || null,
      postId: postId?.trim() || null,
      commentId: commentId?.trim() || null,
      caseId: caseId?.trim() || null,
      requestId: requestId?.trim() || null,
      unread,
    },
  });

  try {
    const unreadCount = await (prisma as any).notification.count({
      where: {
        userId: normalizedUserId,
        unread: true,
      },
    });

    emitNotificationActivity({
      userId: normalizedUserId,
      reason: "notification-created",
      notificationId: notification.id,
      unreadCount,
    });
  } catch (error) {
    console.error("Failed to emit notification activity", error);
  }

  return notification;
};

export const shouldSendPushNotification = async (
  userId: string,
  type: string,
): Promise<boolean> => {
  const prefField = PUSH_NOTIFICATION_TYPE_TO_PREF[type];
  if (!prefField) return true;

  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { [prefField]: true },
  });

  return !user || user[prefField] !== false;
};
