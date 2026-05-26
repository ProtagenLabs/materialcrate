"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArchiveMinus,
  DocumentText1,
  Heart,
  Like1,
  Notification,
  type Icon as IconsaxIcon,
  MedalStar,
  MessageText1,
  Profile2User,
  Setting4,
  Shield,
} from "iconsax-reactjs";
import Header from "../components/Header";
import Alert from "../components/Alert";
import { useAuth } from "../lib/auth-client";
import {
  getNotificationDescriptionPreview,
  getNotificationHref,
} from "../lib/notification-navigation";
import { subscribeToNotificationActivity } from "../lib/post-activity-realtime";

type NotificationItem = {
  id: string | number;
  type?: string;
  actorUsername?: string | null;
  postId?: string | null;
  commentId?: string | null;
  caseId?: string | null;
  followRequestId?: string | null;
  achievementId?: string | null;
  title: string;
  description: string;
  icon?: string;
  profilePicture?: string | null;
  time: string;
  accent: string;
  unread?: boolean;
  imageLabel: string;
  imageTone: string;
  href?: string | null;
  Icon: IconsaxIcon;
};

type ApiNotificationItem = {
  id: string | number;
  type?: string;
  actorId?: string | null;
  actorUsername?: string | null;
  postId?: string | null;
  commentId?: string | null;
  caseId?: string | null;
  followRequestId?: string | null;
  achievementId?: string | null;
  title: string;
  description: string;
  icon?: string;
  profilePicture?: string | null;
  unread?: boolean;
  time: string;
};

const ICON_STYLES: Record<
  string,
  { accent: string; imageTone: string; Icon: IconsaxIcon }
> = {
  MessageText1: {
    accent: "#E1761F",
    imageTone: "bg-[#FFE6CF] text-[#B76217]",
    Icon: MessageText1,
  },
  MedalStar: {
    accent: "#D4971A",
    imageTone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    Icon: MedalStar,
  },
  Award: {
    accent: "#D4971A",
    imageTone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    Icon: MedalStar,
  },
  ArchiveMinus: {
    accent: "#5F6FFF",
    imageTone: "bg-[#E8EBFF] text-[#4150D8]",
    Icon: ArchiveMinus,
  },
  Profile2User: {
    accent: "#1F9D75",
    imageTone: "bg-[#DBF5EC] text-[#197356]",
    Icon: Profile2User,
  },
  DocumentText1: {
    accent: "#D14D72",
    imageTone: "bg-[#FFE0E8] text-[#B33F61]",
    Icon: DocumentText1,
  },
  Setting4: {
    accent: "#7C5CFA",
    imageTone: "bg-[#EEE8FF] text-[#684AD9]",
    Icon: Setting4,
  },
  Like1: {
    accent: "#D14D72",
    imageTone: "bg-[#FFE0E8] text-[#B33F61]",
    Icon: Like1,
  },
  Heart: {
    accent: "#D14D72",
    imageTone: "bg-[#FFE0E8] text-[#B33F61]",
    Icon: Heart,
  },
  Notification: {
    accent: "#1D1D1D",
    imageTone: "bg-surface-high text-ink",
    Icon: Notification,
  },
  Shield: {
    accent: "#C0392B",
    imageTone: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Icon: Shield,
  },
};

const getImageLabel = (title: string) => {
  const letters = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "NT";
};

const NOTIFICATION_PAGE_REFRESH_DEBOUNCE_MS = 300;
const NOTIFICATION_PAGE_MIN_REFRESH_INTERVAL_MS = 1500;

const getGroupLabel = (time: string) => {
  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return "Earlier this week";
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfItemDay = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfItemDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Today";
  if (diffDays <= 7) return "Earlier this week";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export default function Page() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [notifications, setNotifications] = React.useState<
    ApiNotificationItem[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const realtimeRefreshTimeoutRef = React.useRef<number | null>(null);
  const lastRealtimeRefreshAtRef = React.useRef(0);

  React.useEffect(() => {
    if (!isLoadingAuth && !user) {
      router.replace("/login");
    }
  }, [isLoadingAuth, router, user]);

  const formatNotificationTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const fetchNotifications = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      try {
        if (!user?.id) {
          setNotifications([]);
          setError(null);
          if (!silent) {
            setIsLoading(false);
          }
          return;
        }

        if (!silent) {
          setIsLoading(true);
        }
        setError(null);
        const response = await fetch("/api/notifications?limit=100", {
          method: "GET",
          cache: "no-store",
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError("Failed to fetch notifications");
          console.error(
            "Failed to fetch notifications: ",
            body?.error,
            body?.details,
          );
          return;
        }

        const items = Array.isArray(body?.notifications)
          ? (body.notifications as ApiNotificationItem[])
          : [];
        setNotifications(items);
      } catch {
        setError("Failed to fetch notifications");
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [user?.id],
  );

  const notificationGroups = useMemo(() => {
    const groupsMap = new Map<string, NotificationItem[]>();

    for (const notification of notifications) {
      const style =
        ICON_STYLES[notification.icon ?? ""] ?? ICON_STYLES.Notification;
      const groupLabel = getGroupLabel(notification.time);
      const current = groupsMap.get(groupLabel) ?? [];

      current.push({
        id: notification.id,
        type: notification.type,
        actorUsername: notification.actorUsername ?? null,
        postId: notification.postId ?? null,
        commentId: notification.commentId ?? null,
        caseId: notification.caseId ?? null,
        followRequestId: notification.followRequestId ?? null,
        achievementId: notification.achievementId ?? null,
        title: notification.title,
        description: notification.description,
        profilePicture: notification.profilePicture ?? null,
        time: formatNotificationTime(notification.time),
        unread: Boolean(notification.unread),
        imageLabel: getImageLabel(notification.title),
        imageTone: style.imageTone,
        accent: style.accent,
        href: getNotificationHref({
          type: notification.type,
          actorUsername: notification.actorUsername,
          postId: notification.postId,
          commentId: notification.commentId,
          caseId: notification.caseId,
          achievementId: notification.achievementId,
        }),
        Icon: style.Icon,
      });

      groupsMap.set(groupLabel, current);
    }

    const orderedLabels = ["Today", "Earlier this week"];
    const groupEntries = Array.from(groupsMap.entries()).sort(
      ([left], [right]) => {
        const leftIndex = orderedLabels.indexOf(left);
        const rightIndex = orderedLabels.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1)
          return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      },
    );

    return groupEntries.map(([label, items]) => ({ label, items }));
  }, [notifications]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const scheduleNotificationRefresh = useCallback(
    (delay = NOTIFICATION_PAGE_REFRESH_DEBOUNCE_MS) => {
      if (typeof window === "undefined") {
        return;
      }

      if (document.visibilityState === "hidden") {
        return;
      }

      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      const elapsed = Date.now() - lastRealtimeRefreshAtRef.current;
      const nextDelay =
        elapsed >= NOTIFICATION_PAGE_MIN_REFRESH_INTERVAL_MS
          ? delay
          : Math.max(
              delay,
              NOTIFICATION_PAGE_MIN_REFRESH_INTERVAL_MS - elapsed,
            );

      realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
        lastRealtimeRefreshAtRef.current = Date.now();
        void fetchNotifications({ silent: true });
      }, nextDelay);
    },
    [fetchNotifications],
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isDisposed = false;

    void subscribeToNotificationActivity(user.id, () => {
      scheduleNotificationRefresh();
    }).then((cleanup) => {
      if (isDisposed) {
        cleanup();
        return;
      }

      unsubscribe = cleanup;
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [scheduleNotificationRefresh, user?.id]);

  useEffect(() => {
    const handleVisibleRefresh = () => {
      if (document.visibilityState === "visible") {
        scheduleNotificationRefresh(0);
      }
    };

    window.addEventListener("focus", handleVisibleRefresh);
    document.addEventListener("visibilitychange", handleVisibleRefresh);

    return () => {
      window.removeEventListener("focus", handleVisibleRefresh);
      document.removeEventListener("visibilitychange", handleVisibleRefresh);
    };
  }, [scheduleNotificationRefresh]);

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markAll: true }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError("Failed to read notifications");
        console.error("Failed to mark notifications as read: ", body?.error);
        return;
      }

      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          unread: false,
        })),
      );
    } catch {
      setError("Failed to read notifications");
    }
  };

  const markOneAsRead = async (notificationId: string | number) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notificationId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError("Failed to read notification");
        console.error("Failed to mark notification as read: ", body?.error);
        return;
      }

      setNotifications((previous) =>
        previous.map((item) =>
          String(item.id) === String(notificationId)
            ? {
                ...item,
                unread: false,
              }
            : item,
        ),
      );
    } catch {
      setError("Failed to mark notification as read");
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (item.unread) {
      await markOneAsRead(item.id);
    }

    if (item.href) {
      router.push(item.href);
    }
  };

  const handleFollowRequestAction = async (
    followRequestId: string,
    notificationId: string | number,
    action: "accept" | "decline",
  ) => {
    try {
      setError(null);
      const response = await fetch(
        `/api/follow-requests/${encodeURIComponent(followRequestId)}`,
        { method: action === "accept" ? "POST" : "DELETE" },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body?.error || `Failed to ${action} follow request`);
        return;
      }

      // Remove the notification from the list
      setNotifications((previous) =>
        previous.filter((item) => String(item.id) !== String(notificationId)),
      );
    } catch {
      setError(`Failed to ${action} follow request`);
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <Header title="Notifications" isLoading={isLoading} />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-20 sm:px-6">
        {error && <Alert message={error} type="error" />}
        {notificationGroups.map((group) => (
          <section key={group.label}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
                {group.label}
              </h2>
              <button
                type="button"
                onClick={() => {
                  void markAllAsRead();
                }}
                className="text-xs font-medium text-ink-3 transition-colors hover:text-ink-2 active:opacity-60"
              >
                Mark all as read
              </button>
            </div>

            <div className="space-y-3">
              {group.items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-[22px] border border-edge bg-surface px-4 py-4 shadow-[0_10px_30px_rgba(17,17,17,0.04)] transition-opacity active:opacity-50 ${item.href ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                  onClick={() => {
                    void handleNotificationClick(item);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div
                        className={`relative flex h-13 w-13 items-center justify-center overflow-hidden rounded-[18px] text-sm font-semibold ${item.imageTone}`}
                      >
                        {item.profilePicture ? (
                          <Image
                            src={item.profilePicture}
                            alt={item.title}
                            fill
                            sizes="52px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          item.imageLabel
                        )}
                      </div>
                      <div
                        className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white"
                        style={{ backgroundColor: item.accent }}
                      >
                        <item.Icon size={14} color="#FFFFFF" variant="Bulk" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-ink">
                            {item.title}
                          </h3>
                        </div>
                        <p className="flex items-center gap-2 shrink-0 text-[11px] font-medium text-ink-3">
                          {item.unread && (
                            <span className="h-2.5 w-2.5 rounded-full bg-[#E1761F]" />
                          )}
                          {item.time}
                        </p>
                      </div>

                      <p className="text-sm leading-6 text-ink-2">
                        {getNotificationDescriptionPreview(item.description)}
                      </p>

                      {item.type === "FOLLOW_REQUEST" &&
                        item.followRequestId && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleFollowRequestAction(
                                  item.followRequestId!,
                                  item.id,
                                  "accept",
                                );
                              }}
                              className="rounded-full bg-[#131212] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a2a] active:opacity-70"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleFollowRequestAction(
                                  item.followRequestId!,
                                  item.id,
                                  "decline",
                                );
                              }}
                              className="rounded-full border border-[#D4D4D4] bg-surface px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-high active:opacity-70"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
