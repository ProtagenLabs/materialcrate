"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentUpload, More2, Notification } from "iconsax-reactjs";
import { useAuth } from "./lib/auth-client";
import { subscribeToNotificationActivity } from "./lib/post-activity-realtime";
import Post, {
  type HomePost,
  type PostOptionsAnchor,
} from "./components/home/Post";
import FeedAd from "./components/home/FeedAd";
import CommentDrawer from "./components/home/CommentDrawer";
import OptionsDrawer from "./components/home/PostOptions";
import DocumentViewer from "./components/home/DocumentViewer";
import Header from "./components/home/Header";
import ArchiveDrawer from "./components/home/ArchiveDrawer";
import Spinner from "./components/Spinner";

type ArchiveSavedPost = {
  id: string;
  postId: string;
};

type NotificationListItem = {
  id: string | number;
  unread?: boolean;
  time?: string;
};

const NOTIFICATIONS_LAST_OPENED_AT_STORAGE_KEY =
  "mc.notifications.lastOpenedAt";
const FEED_PAGE_SIZE = 15;
const NOTIFICATION_INDICATOR_REFRESH_DEBOUNCE_MS = 300;
const NOTIFICATION_INDICATOR_MIN_REFRESH_INTERVAL_MS = 1500;

function PostSkeleton() {
  const sk = "skeleton";
  return (
    <div className="w-full px-3">
      <article className="lg:rounded-xl lg:border lg:border-edge lg:bg-surface lg:shadow-sm">
        <div className="flex items-start justify-between px-2 pt-2">
          <div className="flex items-center gap-3">
            <div className={`${sk} h-11 w-11 shrink-0 rounded-full`} />
            <div className="space-y-2">
              <div className={`${sk} h-3.5 w-32 rounded-full`} />
              <div className={`${sk} h-2.5 w-24 rounded-full`} />
            </div>
          </div>
          <div className={`${sk} h-8 w-8 rounded-full`} />
        </div>
        <div className={`${sk} mx-2 mt-3 h-36 rounded-xl`} />
        <div className="px-2 pt-3 space-y-2">
          <div className={`${sk} h-3.5 w-3/4 rounded-full`} />
          <div className="flex gap-2">
            <div className={`${sk} h-5 w-16 rounded-full`} />
            <div className={`${sk} h-5 w-20 rounded-full`} />
          </div>
        </div>
        <div className="flex items-center gap-4 px-2 py-3">
          <div className={`${sk} h-5 w-12 rounded-full`} />
          <div className={`${sk} h-5 w-12 rounded-full`} />
          <div className={`${sk} h-5 w-12 rounded-full`} />
        </div>
      </article>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-0">
      {[0, 1, 2, 3, 4].map((i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(false);
  const [isPostOptionsDrawerOpen, setIsPostOptionsDrawerOpen] = useState(false);
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);
  const [archiveCloseRequestKey, setArchiveCloseRequestKey] = useState(0);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(
    null,
  );
  const [activeCommentPost, setActiveCommentPost] = useState<HomePost | null>(
    null,
  );
  const [activeOptionsPost, setActiveOptionsPost] = useState<HomePost | null>(
    null,
  );
  const [activeOptionsAnchor, setActiveOptionsAnchor] =
    useState<PostOptionsAnchor | null>(null);
  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const [activeArchivePost, setActiveArchivePost] = useState<HomePost | null>(
    null,
  );
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [archiveSavedPostIdsByPostId, setArchiveSavedPostIdsByPostId] =
    useState<Record<string, string>>({});
  const [archiveBusyPostIds, setArchiveBusyPostIds] = useState<
    Record<string, boolean>
  >({});
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [hasUnopenedNotifications, setHasUnopenedNotifications] =
    useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const notificationRefreshTimeoutRef = useRef<number | null>(null);
  const lastNotificationRefreshAtRef = useRef(0);
  const adIntervalRef = useRef(3 + Math.floor(Math.random() * 3));

  const requireAuthenticatedAccess = useCallback(() => {
    if (isLoadingAuth) {
      return false;
    }

    if (user) {
      return true;
    }

    setMoreOptionsOpen(false);
    setIsCommentDrawerOpen(false);
    setIsPostOptionsDrawerOpen(false);
    setIsArchiveDrawerOpen(false);
    setActiveCommentPostId(null);
    setActiveCommentPost(null);
    setActiveOptionsPost(null);
    setActiveOptionsAnchor(null);
    setActiveArchivePost(null);
    setActivePdfPost(null);
    router.push("/login");
    return false;
  }, [isLoadingAuth, router, user]);

  const refreshNotificationIndicators = useCallback(async () => {
    if (!user?.id) {
      setUnreadNotificationCount(0);
      setHasUnopenedNotifications(false);
      return;
    }
    try {
      const response = await fetch(
        "/api/notifications?limit=100&unreadOnly=true",
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        return;
      }

      const notifications = Array.isArray(body?.notifications)
        ? (body.notifications as NotificationListItem[])
        : [];

      setUnreadNotificationCount(notifications.length);

      if (typeof window === "undefined") {
        setHasUnopenedNotifications(notifications.length > 0);
        return;
      }

      const lastOpenedAt = Number.parseInt(
        window.localStorage.getItem(NOTIFICATIONS_LAST_OPENED_AT_STORAGE_KEY) ||
          "0",
        10,
      );

      const newestUnreadAt = notifications.reduce((latest, notification) => {
        const createdAt = Date.parse(notification.time || "");
        return Number.isFinite(createdAt)
          ? Math.max(latest, createdAt)
          : latest;
      }, 0);

      setHasUnopenedNotifications(
        notifications.length > 0 && newestUnreadAt > lastOpenedAt,
      );
    } catch {}
  }, [user?.id]);

  const scheduleNotificationIndicatorRefresh = useCallback(
    (delay = NOTIFICATION_INDICATOR_REFRESH_DEBOUNCE_MS) => {
      if (typeof window === "undefined") {
        return;
      }

      if (document.visibilityState === "hidden") {
        return;
      }

      if (notificationRefreshTimeoutRef.current) {
        window.clearTimeout(notificationRefreshTimeoutRef.current);
      }

      const elapsed = Date.now() - lastNotificationRefreshAtRef.current;
      const nextDelay =
        elapsed >= NOTIFICATION_INDICATOR_MIN_REFRESH_INTERVAL_MS
          ? delay
          : Math.max(
              delay,
              NOTIFICATION_INDICATOR_MIN_REFRESH_INTERVAL_MS - elapsed,
            );

      notificationRefreshTimeoutRef.current = window.setTimeout(() => {
        lastNotificationRefreshAtRef.current = Date.now();
        void refreshNotificationIndicators();
      }, nextDelay);
    },
    [refreshNotificationIndicators],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadPosts() {
      try {
        const response = await fetch(
          `/api/posts?limit=${FEED_PAGE_SIZE}&offset=0`,
          {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const body = await response.json().catch(() => ({}));
        const initialPosts = Array.isArray(body?.posts) ? body.posts : [];
        setPosts(initialPosts);
        setNextOffset(initialPosts.length);
        setHasMorePosts(Boolean(body?.hasMore));
      } catch {
        if (!controller.signal.aborted) {
          setPosts([]);
          setNextOffset(0);
          setHasMorePosts(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPosts(false);
        }
      }
    }

    void loadPosts();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadArchiveState = async () => {
      try {
        const response = await fetch("/api/archive", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          return;
        }

        const nextArchiveMap = Object.fromEntries(
          (Array.isArray(body?.archive?.savedPosts)
            ? body.archive.savedPosts
            : []
          ).map((savedPost: ArchiveSavedPost) => [
            savedPost.postId,
            savedPost.id,
          ]),
        );

        setArchiveSavedPostIdsByPostId(nextArchiveMap);
      } catch {
        if (!controller.signal.aborted) {
          setArchiveSavedPostIdsByPostId({});
        }
      }
    };

    void loadArchiveState();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void refreshNotificationIndicators();

    const onWindowFocus = () => {
      scheduleNotificationIndicatorRefresh(0);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleNotificationIndicatorRefresh(0);
      }
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshNotificationIndicators, scheduleNotificationIndicatorRefresh]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isDisposed = false;

    void subscribeToNotificationActivity(user.id, (event) => {
      if (typeof event.unreadCount === "number") {
        const unreadCount = Math.max(0, event.unreadCount);
        setUnreadNotificationCount(unreadCount);

        if (unreadCount === 0) {
          setHasUnopenedNotifications(false);
          return;
        }

        if (
          typeof window !== "undefined" &&
          event.reason === "notification-created"
        ) {
          const lastOpenedAt = Number.parseInt(
            window.localStorage.getItem(
              NOTIFICATIONS_LAST_OPENED_AT_STORAGE_KEY,
            ) || "0",
            10,
          );
          const emittedAt = Date.parse(event.emittedAt || "");
          setHasUnopenedNotifications(
            !Number.isNaN(emittedAt) ? emittedAt > lastOpenedAt : true,
          );
          return;
        }
      }

      scheduleNotificationIndicatorRefresh();
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
  }, [scheduleNotificationIndicatorRefresh, user?.id]);

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        notificationRefreshTimeoutRef.current
      ) {
        window.clearTimeout(notificationRefreshTimeoutRef.current);
      }
    };
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (isLoadingPosts || isLoadingMorePosts || !hasMorePosts) {
      return;
    }

    setIsLoadingMorePosts(true);
    try {
      const response = await fetch(
        `/api/posts?limit=${FEED_PAGE_SIZE}&offset=${nextOffset}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const body = await response.json().catch(() => ({}));
      const incomingPosts = Array.isArray(body?.posts) ? body.posts : [];

      setPosts((current) => {
        const seenIds = new Set(current.map((post) => post.id));
        const dedupedIncoming = incomingPosts.filter(
          (post: HomePost) => !seenIds.has(post.id),
        );
        return [...current, ...dedupedIncoming];
      });
      setNextOffset((current) => current + incomingPosts.length);
      setHasMorePosts(Boolean(body?.hasMore));
    } catch {
      setHasMorePosts(false);
    } finally {
      setIsLoadingMorePosts(false);
    }
  }, [hasMorePosts, isLoadingMorePosts, isLoadingPosts, nextOffset]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMorePosts();
        }
      },
      {
        root: null,
        rootMargin: "0px 0px 240px 0px",
        threshold: 0,
      },
    );

    observer.observe(trigger);

    return () => {
      observer.disconnect();
    };
  }, [loadMorePosts]);

  const refreshArchiveState = async () => {
    try {
      const response = await fetch("/api/archive", {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return;

      const nextArchiveMap = Object.fromEntries(
        (Array.isArray(body?.archive?.savedPosts)
          ? body.archive.savedPosts
          : []
        ).map((savedPost: ArchiveSavedPost) => [
          savedPost.postId,
          savedPost.id,
        ]),
      );

      setArchiveSavedPostIdsByPostId(nextArchiveMap);
    } catch {}
  };

  const handleArchiveRemove = async (post: HomePost) => {
    const savedPostId = archiveSavedPostIdsByPostId[post.id];
    if (!savedPostId) return;

    setArchiveBusyPostIds((previous) => ({ ...previous, [post.id]: true }));

    try {
      const response = await fetch("/api/archive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedPostId }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to remove archived file");
      }

      setArchiveSavedPostIdsByPostId((previous) => {
        const next = { ...previous };
        delete next[post.id];
        return next;
      });
    } finally {
      setArchiveBusyPostIds((previous) => ({ ...previous, [post.id]: false }));
    }
  };

  const handlePostPinned = (pinnedPost: HomePost) => {
    setPosts((current) => {
      const nextPosts = current.map((post) => {
        if (post.id === pinnedPost.id) {
          return { ...post, ...pinnedPost, pinned: Boolean(pinnedPost.pinned) };
        }

        if (
          post.author?.id &&
          pinnedPost.author?.id &&
          post.author.id === pinnedPost.author.id
        ) {
          return { ...post, pinned: false };
        }

        return post;
      });

      return nextPosts;
    });

    setActiveOptionsPost((current) =>
      current?.id === pinnedPost.id
        ? { ...current, ...pinnedPost, pinned: Boolean(pinnedPost.pinned) }
        : current,
    );
  };

  const handlePostUpdated = (updatedPost: HomePost) => {
    const updatedAuthorUsername =
      updatedPost.author?.username?.trim().toLowerCase() || "";

    setPosts((current) =>
      current.map((post) =>
        post.id === updatedPost.id
          ? { ...post, ...updatedPost }
          : updatedAuthorUsername &&
              post.author?.username?.trim().toLowerCase() ===
                updatedAuthorUsername
            ? {
                ...post,
                isAuthorFollowedByCurrentUser:
                  updatedPost.isAuthorFollowedByCurrentUser,
                isAuthorMutedByCurrentUser:
                  updatedPost.isAuthorMutedByCurrentUser,
                isAuthorBlockedByCurrentUser:
                  updatedPost.isAuthorBlockedByCurrentUser,
              }
            : post,
      ),
    );
    setActiveOptionsPost((current) =>
      current?.id === updatedPost.id ? { ...current, ...updatedPost } : current,
    );
    setActiveCommentPost((current) =>
      current?.id === updatedPost.id ? { ...current, ...updatedPost } : current,
    );
  };

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts((current) => current.filter((post) => post.id !== deletedPostId));
    setActiveOptionsPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setActiveCommentPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setActiveCommentPostId((current) =>
      current === deletedPostId ? null : current,
    );
    setActivePdfPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setActiveArchivePost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setArchiveSavedPostIdsByPostId((current) => {
      const next = { ...current };
      delete next[deletedPostId];
      return next;
    });
  };

  return (
    <div className="py-18 lg:py-0">
      <ArchiveDrawer
        isOpen={isArchiveDrawerOpen}
        post={activeArchivePost}
        closeRequestKey={archiveCloseRequestKey}
        onClose={() => {
          setIsArchiveDrawerOpen(false);
          setActiveArchivePost(null);
          void refreshArchiveState();
        }}
      />
      <CommentDrawer
        isOpen={isCommentDrawerOpen}
        onClose={() => {
          setIsCommentDrawerOpen(false);
          setActiveCommentPostId(null);
          setActiveCommentPost(null);
        }}
        postId={activeCommentPostId}
        post={activeCommentPost}
      />
      <OptionsDrawer
        isOpen={isPostOptionsDrawerOpen}
        onClose={() => {
          setIsPostOptionsDrawerOpen(false);
          setActiveOptionsPost(null);
          setActiveOptionsAnchor(null);
        }}
        post={activeOptionsPost}
        anchor={activeOptionsAnchor}
        onPostPinned={handlePostPinned}
        onPostUpdated={handlePostUpdated}
        onPostDeleted={handlePostDeleted}
        onPostHidden={(hiddenPostId) => {
          setPosts((current) =>
            current.filter((post) => post.id !== hiddenPostId),
          );
          setActiveOptionsPost((current) =>
            current?.id === hiddenPostId ? null : current,
          );
        }}
        onEditPost={(selectedPost) => {
          router.push(`/create?postId=${selectedPost.id}`);
        }}
      />
      <DocumentViewer
        isOpen={Boolean(activePdfPost)}
        post={activePdfPost}
        onClose={() => setActivePdfPost(null)}
      />
      <button
        aria-label="Close more options"
        type="button"
        className={`fixed inset-0 z-40 transition-all duration-300 ease-out ${
          moreOptionsOpen ||
          isCommentDrawerOpen ||
          isPostOptionsDrawerOpen ||
          isArchiveDrawerOpen ||
          activePdfPost
            ? "bg-black/12 opacity-100 pointer-events-auto"
            : "bg-black/0 opacity-0 pointer-events-none"
        }`}
        onClick={() => {
          if (isArchiveDrawerOpen) {
            setArchiveCloseRequestKey((previous) => previous + 1);
            return;
          }
          setMoreOptionsOpen(false);
          setIsCommentDrawerOpen(false);
          setIsPostOptionsDrawerOpen(false);
          setActiveCommentPostId(null);
          setActiveCommentPost(null);
          setActiveOptionsPost(null);
          setActiveOptionsAnchor(null);
          setActivePdfPost(null);
        }}
      />
      <div className="lg:hidden fixed right-6 bottom-28 z-50">
        <button
          aria-label="Upload button"
          type="button"
          onClick={() => {
            if (!requireAuthenticatedAccess()) {
              return;
            }
            router.push("/create");
          }}
          className={`cursor-pointer absolute right-0 bottom-16 flex items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-lg transition-all duration-300 ease-out hover:bg-page active:scale-95 ${
            moreOptionsOpen
              ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
              : "opacity-0 translate-y-3 scale-95 pointer-events-none"
          }`}
        >
          <DocumentUpload size={24} variant="Bold" />
          <p>Upload</p>
        </button>
        <button
          aria-label="Upload button"
          type="button"
          className={`cursor-pointer absolute right-16 bottom-0 flex items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-lg transition-all duration-300 ease-out hover:bg-page active:scale-95 ${
            moreOptionsOpen
              ? "opacity-100 translate-x-0 scale-100 pointer-events-auto"
              : "opacity-0 translate-x-3 scale-95 pointer-events-none"
          }`}
          onClick={() => {
            if (!requireAuthenticatedAccess()) {
              return;
            }

            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                NOTIFICATIONS_LAST_OPENED_AT_STORAGE_KEY,
                String(Date.now()),
              );
            }
            setHasUnopenedNotifications(false);
            router.push("/notifications");
          }}
        >
          <div className="relative">
            <Notification size={24} variant="Bold" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-red-500 rounded-full transition-opacity duration-200 flex items-center justify-center text-white text-xs">
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </span>
            )}
          </div>
          <p>Notification</p>
        </button>
        <button
          title="more actions"
          type="button"
          className={`cursor-pointer w-12 h-12 relative bg-surface drop-shadow-xl rounded-full flex items-center justify-center transition-all duration-300 ease-out hover:bg-page active:scale-90 ${
            moreOptionsOpen ? "rotate-180 scale-105" : "rotate-0 scale-100"
          }`}
          onClick={() => setMoreOptionsOpen((prev) => !prev)}
        >
          <More2 size={30} />
          <span
            className={`absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full transition-opacity duration-200 ${hasUnopenedNotifications && !moreOptionsOpen ? "opacity-100" : "opacity-0"}`}
          />
        </button>
      </div>
      <Header />
      <main className="mx-auto w-full max-w-140 2xl:max-w-120 lg:pt-4 lg:pb-8">
        {isLoadingPosts ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-ink-2">No posts yet.</p>
        ) : (
          <>
            {posts.map((post, index) => (
              <Fragment key={post.id}>
                <div data-scroll-item className="px-3">
                  <Post
                    post={post}
                    isArchived={Boolean(archiveSavedPostIdsByPostId[post.id])}
                    isArchiveBusy={Boolean(archiveBusyPostIds[post.id])}
                    onCommentClick={(selectedPost) => {
                      setActiveCommentPostId(selectedPost.id);
                      setActiveCommentPost(selectedPost);
                      setIsCommentDrawerOpen(true);
                      setMoreOptionsOpen(false);
                      setIsPostOptionsDrawerOpen(false);
                      setIsArchiveDrawerOpen(false);
                      setActiveOptionsPost(null);
                      setActiveOptionsAnchor(null);
                      setActiveArchivePost(null);
                    }}
                    onOptionsClick={(selectedPost, anchor) => {
                      setActiveOptionsPost(selectedPost);
                      setActiveOptionsAnchor(anchor);
                      setIsPostOptionsDrawerOpen(true);
                      setMoreOptionsOpen(false);
                      setIsCommentDrawerOpen(false);
                      setIsArchiveDrawerOpen(false);
                      setActiveCommentPostId(null);
                      setActiveCommentPost(null);
                      setActivePdfPost(null);
                      setActiveArchivePost(null);
                    }}
                    onFileClick={(selectedPost) => {
                      setActivePdfPost(selectedPost);
                      setMoreOptionsOpen(false);
                      setIsCommentDrawerOpen(false);
                      setActiveCommentPostId(null);
                      setActiveCommentPost(null);
                      setIsPostOptionsDrawerOpen(false);
                      setActiveOptionsPost(null);
                      setActiveOptionsAnchor(null);
                      setIsArchiveDrawerOpen(false);
                      setActiveArchivePost(null);
                    }}
                    onArchiveClick={(selectedPost) => {
                      setActiveArchivePost(selectedPost);
                      setIsArchiveDrawerOpen(true);
                      setMoreOptionsOpen(false);
                      setIsCommentDrawerOpen(false);
                      setActiveCommentPostId(null);
                      setActiveCommentPost(null);
                      setIsPostOptionsDrawerOpen(false);
                      setActiveOptionsPost(null);
                      setActiveOptionsAnchor(null);
                      setActivePdfPost(null);
                    }}
                    onArchiveRemoveClick={(selectedPost) => {
                      void handleArchiveRemove(selectedPost);
                    }}
                  />
                </div>
                {(index + 1) % adIntervalRef.current === 0 && (
                  <div className="px-3">
                    <FeedAd />
                  </div>
                )}
              </Fragment>
            ))}
            {isLoadingMorePosts && (
              <div className="px-6 py-4">
                <Spinner />
              </div>
            )}
            {hasMorePosts && <div ref={loadMoreTriggerRef} className="h-1" />}
          </>
        )}
      </main>
    </div>
  );
}
