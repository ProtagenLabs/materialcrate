import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

type PostActivityReason = "post-like" | "comment-created" | "comment-like" | "comment-deleted" | "comment-edited";
type NotificationActivityReason =
  | "notification-created"
  | "notification-read"
  | "notifications-read-all";
type FollowActivityReason =
  | "followed"
  | "unfollowed"
  | "follow-request-accepted";

export type ChatMessageAttachment = {
  id: string;
  type: string;
  url?: string | null;
  fileName?: string | null;
  fileSize?: string | null;
};

export type ChatMessageEvent = {
  conversationId: string;
  senderId: string;
  message: {
    id: string;
    text: string | null;
    timestamp: string;
    status: string | null;
    isUnsent: boolean;
    attachments: ChatMessageAttachment[];
  };
  emittedAt?: string;
};

export type ChatTypingEvent = {
  conversationId: string;
  senderId: string;
  isTyping: boolean;
  emittedAt?: string;
};

export type PostActivityEvent = {
  postId: string;
  reason: PostActivityReason;
  postLikeCount?: number;
  commentCount?: number;
  commentId?: string;
  parentCommentId?: string | null;
  commentLikeCount?: number;
  replyCount?: number;
  emittedAt?: string;
};

export type NotificationActivityEvent = {
  userId: string;
  reason: NotificationActivityReason;
  notificationId?: string;
  unreadCount?: number;
  emittedAt?: string;
};

export type FollowActivityEvent = {
  userId: string;
  reason: FollowActivityReason;
  actorId?: string | null;
  followersCount?: number;
  followingCount?: number;
  emittedAt?: string;
};

const POST_ACTIVITY_SOCKET_PATH = "/socket.io";
const EMIT_DEBOUNCE_MS = 900;

let io: SocketIOServer | null = null;
const pendingPostEvents = new Map<
  string,
  {
    timer: NodeJS.Timeout;
    event: PostActivityEvent;
  }
>();
const pendingNotificationEvents = new Map<
  string,
  {
    timer: NodeJS.Timeout;
    event: NotificationActivityEvent;
  }
>();
const pendingFollowEvents = new Map<
  string,
  {
    timer: NodeJS.Timeout;
    event: FollowActivityEvent;
  }
>();

const normalizePostId = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const normalizeUserId = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const getPostRoomName = (postId: string) => `post:${postId}`;
const getNotificationRoomName = (userId: string) => `notifications:${userId}`;
const getFollowRoomName = (userId: string) => `follow:${userId}`;
const getChatRoomName = (conversationId: string) => `chat:${conversationId}`;

export const registerPostActivityRealtime = (httpServer: HttpServer) => {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    path: POST_ACTIVITY_SOCKET_PATH,
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    socket.on("post:watch", (incomingPostId: unknown) => {
      const postId = normalizePostId(incomingPostId);
      if (!postId) {
        return;
      }

      socket.join(getPostRoomName(postId));
    });

    socket.on("post:unwatch", (incomingPostId: unknown) => {
      const postId = normalizePostId(incomingPostId);
      if (!postId) {
        return;
      }

      socket.leave(getPostRoomName(postId));
    });

    socket.on("notification:watch", (incomingUserId: unknown) => {
      const userId = normalizeUserId(incomingUserId);
      if (!userId) {
        return;
      }

      socket.join(getNotificationRoomName(userId));
    });

    socket.on("notification:unwatch", (incomingUserId: unknown) => {
      const userId = normalizeUserId(incomingUserId);
      if (!userId) {
        return;
      }

      socket.leave(getNotificationRoomName(userId));
    });

    socket.on("follow:watch", (incomingUserId: unknown) => {
      const userId = normalizeUserId(incomingUserId);
      if (!userId) {
        return;
      }

      socket.join(getFollowRoomName(userId));
    });

    socket.on("follow:unwatch", (incomingUserId: unknown) => {
      const userId = normalizeUserId(incomingUserId);
      if (!userId) {
        return;
      }

      socket.leave(getFollowRoomName(userId));
    });

    socket.on("chat:join", (incomingConversationId: unknown) => {
      const conversationId = normalizePostId(incomingConversationId);
      if (!conversationId) return;
      socket.join(getChatRoomName(conversationId));
    });

    socket.on("chat:leave", (incomingConversationId: unknown) => {
      const conversationId = normalizePostId(incomingConversationId);
      if (!conversationId) return;
      socket.leave(getChatRoomName(conversationId));
    });

    socket.on(
      "chat:typing",
      (payload: unknown) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("conversationId" in payload) ||
          !("senderId" in payload) ||
          !("isTyping" in payload)
        ) {
          return;
        }
        const { conversationId, senderId, isTyping } = payload as ChatTypingEvent;
        const normalizedConvId = normalizePostId(conversationId);
        const normalizedSenderId = normalizeUserId(senderId);
        if (!normalizedConvId || !normalizedSenderId) return;

        const event: ChatTypingEvent = {
          conversationId: normalizedConvId,
          senderId: normalizedSenderId,
          isTyping: Boolean(isTyping),
          emittedAt: new Date().toISOString(),
        };
        // Broadcast to the room except the sender's own socket
        socket.to(getChatRoomName(normalizedConvId)).emit("chat:typing", event);
      },
    );
  });

  return io;
};

export const emitPostActivity = (event: PostActivityEvent) => {
  const postId = normalizePostId(event.postId);
  if (!io || !postId) {
    return;
  }

  const existing = pendingPostEvents.get(postId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const mergedEvent: PostActivityEvent = {
    ...(existing?.event ?? { postId }),
    ...event,
    postId,
    emittedAt: new Date().toISOString(),
  };

  const timer = setTimeout(() => {
    io?.to(getPostRoomName(postId)).emit("post:activity", mergedEvent);
    pendingPostEvents.delete(postId);
  }, EMIT_DEBOUNCE_MS);

  pendingPostEvents.set(postId, {
    timer,
    event: mergedEvent,
  });
};

export const emitNotificationActivity = (event: NotificationActivityEvent) => {
  const userId = normalizeUserId(event.userId);
  if (!io || !userId) {
    return;
  }

  const existing = pendingNotificationEvents.get(userId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const mergedEvent: NotificationActivityEvent = {
    ...(existing?.event ?? { userId }),
    ...event,
    userId,
    emittedAt: new Date().toISOString(),
  };

  const timer = setTimeout(() => {
    io?.to(getNotificationRoomName(userId)).emit(
      "notification:activity",
      mergedEvent,
    );
    pendingNotificationEvents.delete(userId);
  }, EMIT_DEBOUNCE_MS);

  pendingNotificationEvents.set(userId, {
    timer,
    event: mergedEvent,
  });
};

export const emitFollowActivity = (event: FollowActivityEvent) => {
  const userId = normalizeUserId(event.userId);
  if (!io || !userId) {
    return;
  }

  const existing = pendingFollowEvents.get(userId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const mergedEvent: FollowActivityEvent = {
    ...(existing?.event ?? { userId }),
    ...event,
    userId,
    emittedAt: new Date().toISOString(),
  };

  const timer = setTimeout(() => {
    io?.to(getFollowRoomName(userId)).emit("follow:activity", mergedEvent);
    pendingFollowEvents.delete(userId);
  }, EMIT_DEBOUNCE_MS);

  pendingFollowEvents.set(userId, {
    timer,
    event: mergedEvent,
  });
};

export const emitChatMessage = (event: ChatMessageEvent) => {
  const conversationId = normalizePostId(event.conversationId);
  if (!io || !conversationId) return;

  io.to(getChatRoomName(conversationId)).emit("chat:message", {
    ...event,
    conversationId,
    emittedAt: new Date().toISOString(),
  } satisfies ChatMessageEvent);
};

export { POST_ACTIVITY_SOCKET_PATH };
