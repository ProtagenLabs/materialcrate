"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  More,
  Heart,
  Messages2,
  Archive,
  User,
  Verify,
  Cpu,
  Location,
  Send2,
  Eye,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import { subscribeToPostActivity } from "@/app/lib/post-activity-realtime";
import { hasPaidSubscription } from "@/app/lib/subscription";
import { trackFeedInteraction } from "@/app/lib/feed-tracking";
import { renderTextWithMentions } from "@/app/lib/mention-renderer";
import Alert from "@/app/components/Alert";
import Image from "next/image";
import PdfThumbnail from "./PdfThumbnail";

export type HomePost = {
  id: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  fileType?: string | null;
  title: string;
  categories: string[];
  description?: string | null;
  year?: number | null;
  pinned?: boolean;
  commentsDisabled?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
  viewerHasLiked?: boolean;
  isAuthorFollowedByCurrentUser?: boolean;
  isAuthorMutedByCurrentUser?: boolean;
  isAuthorBlockedByCurrentUser?: boolean;
  createdAt: string;
  author?: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    profilePictureUrl?: string | null;
    subscriptionPlan?: string | null;
    isBot?: boolean;
  } | null;
};

export type PostOptionsAnchor = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type PostProps = {
  post: HomePost;
  onCommentClick?: (post: HomePost) => void;
  onOptionsClick?: (post: HomePost, anchor: PostOptionsAnchor) => void;
  onFileClick?: (post: HomePost) => void;
  onArchiveClick?: (post: HomePost) => void;
  onArchiveRemoveClick?: (post: HomePost) => void;
  isArchived?: boolean;
  isArchiveBusy?: boolean;
  showPinnedIndicator?: boolean;
};

type PendingProtectedAction =
  | "like"
  | "comment"
  | "archive-add"
  | "archive-remove"
  | "download"
  | null;

const POST_ACTIVITY_REFRESH_WINDOW_MS = 15000;
const POST_ACTIVITY_PREFETCH_MARGIN = "280px 0px";

function formatTimeAgo(timestamp: string) {
  const trimmed = timestamp?.trim();
  if (!trimmed) return "Just now";

  let value = Number.NaN;
  const numericTimestamp = Number(trimmed);

  if (Number.isFinite(numericTimestamp)) {
    value =
      numericTimestamp < 1_000_000_000_000
        ? numericTimestamp * 1000
        : numericTimestamp;
  } else {
    value = new Date(trimmed).getTime();
  }

  if (Number.isNaN(value)) return "Just now";

  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DESCRIPTION_CLAMP_LENGTH = 180;

function PostDescription({ description }: { description: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = description.length > DESCRIPTION_CLAMP_LENGTH;

  let shownText = description;
  if (isLong && !isExpanded) {
    const slice = description.slice(0, DESCRIPTION_CLAMP_LENGTH);
    const lastSpace = slice.lastIndexOf(" ");
    shownText = `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd()}… `;
  }

  return (
    <p className="px-2 pt-3 text-sm leading-6 text-ink wrap-break-word">
      {renderTextWithMentions(shownText)}
      {isLong && (
        <button
          type="button"
          aria-label="more or less"
          aria-expanded={isExpanded ? "true" : "false"}
          onClick={() => setIsExpanded((value) => !value)}
          className="font-semibold text-ink-3 transition-colors hover:text-ink-2 cursor-pointer"
        >
          {isExpanded ? " [show less]" : " [more]"}
        </button>
      )}
    </p>
  );
}

export default function Post({
  post,
  onCommentClick,
  onOptionsClick,
  onFileClick,
  onArchiveClick,
  onArchiveRemoveClick,
  isArchived = false,
  isArchiveBusy = false,
  showPinnedIndicator = false,
}: PostProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const optionsButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const postCardRef = React.useRef<HTMLDivElement | null>(null);
  const alertTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastActivityRefreshRef = React.useRef(0);
  const authorFullName = post.author?.displayName?.trim() || "Unknown user";
  const authorUsername = post.author?.username
    ? `@${post.author.username}`
    : "@unknown";
  const authorProfilePicture = post.author?.profilePicture;
  const hasPaidPlan = hasPaidSubscription(post.author?.subscriptionPlan);
  const authorRoute = post.author?.username
    ? `/user/${encodeURIComponent(post.author.username)}`
    : null;
  const createdLabel = formatTimeAgo(post.createdAt);
  const [likeCount, setLikeCount] = useState<number>(post.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState<number>(
    post.commentCount ?? 0,
  );
  const [viewerHasLiked, setViewerHasLiked] = useState<boolean>(
    Boolean(post.viewerHasLiked),
  );
  const [isLiking, setIsLiking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [alertState, setAlertState] = useState<{
    message: string | null;
    type: "success" | "error" | "info";
  }>({
    message: null,
    type: "success",
  });
  const [pendingProtectedAction, setPendingProtectedAction] =
    useState<PendingProtectedAction>(null);

  const ensureAuthenticated = useCallback(
    (pendingAction?: PendingProtectedAction) => {
      if (isLoading) {
        if (pendingAction) {
          setPendingProtectedAction(pendingAction);
        }
        return false;
      }
      if (!user) {
        router.push("/login");
        return false;
      }
      return true;
    },
    [isLoading, router, user],
  );

  const handleLike = useCallback(
    async (skipAuthCheck = false) => {
      if (isLiking) return;
      if (!skipAuthCheck && !ensureAuthenticated("like")) return;

      setIsLiking(true);
      try {
        const response = await fetch("/api/posts/like", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: post.id }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || "Failed to toggle like");
        }

        const nextLikeCount = body?.post?.likeCount;
        const nextViewerHasLiked = body?.post?.viewerHasLiked;

        setLikeCount((previous) =>
          Number.isFinite(nextLikeCount) ? nextLikeCount : previous,
        );
        setViewerHasLiked(Boolean(nextViewerHasLiked));
      } finally {
        setIsLiking(false);
      }
    },
    [ensureAuthenticated, isLiking, post.id],
  );

  useEffect(() => {
    setLikeCount(post.likeCount ?? 0);
    setCommentCount(post.commentCount ?? 0);
    setViewerHasLiked(Boolean(post.viewerHasLiked));
  }, [post.commentCount, post.id, post.likeCount, post.viewerHasLiked]);

  const refreshPostActivity = useCallback(
    async (force = false) => {
      if (!post.id) {
        return;
      }

      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      const now = Date.now();
      if (
        !force &&
        now - lastActivityRefreshRef.current < POST_ACTIVITY_REFRESH_WINDOW_MS
      ) {
        return;
      }

      lastActivityRefreshRef.current = now;

      try {
        const response = await fetch(
          `/api/posts/${encodeURIComponent(post.id)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.post) {
          throw new Error(body?.error || "Failed to refresh post activity");
        }

        setLikeCount(
          typeof body.post.likeCount === "number" ? body.post.likeCount : 0,
        );
        setCommentCount(
          typeof body.post.commentCount === "number"
            ? body.post.commentCount
            : 0,
        );
        setViewerHasLiked(Boolean(body.post.viewerHasLiked));
      } catch (error) {
        console.error("Failed to refresh post activity", post.id, error);
      }
    },
    [post.id],
  );

  useEffect(() => {
    const element = postCardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      {
        rootMargin: POST_ACTIVITY_PREFETCH_MARGIN,
        threshold: 0.01,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Track SCROLL_PAST: fire when post was visible ≥1s but user didn't open it
  useEffect(() => {
    const element = postCardRef.current;
    if (!element || !post.id || typeof IntersectionObserver === "undefined")
      return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    let wasHeld = false; // true once the post has been visible for ≥1s
    let didOpen = false;

    const markOpen = () => {
      didOpen = true;
    };
    element.addEventListener("click", markOpen);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.3) {
          if (!visibleTimer) {
            visibleTimer = setTimeout(() => {
              wasHeld = true;
            }, 1000);
          }
        } else {
          if (visibleTimer) {
            clearTimeout(visibleTimer);
            visibleTimer = null;
          }
          if (wasHeld && !didOpen) {
            void trackFeedInteraction({
              postId: post.id,
              interactionType: "SCROLL_PAST",
              signalKind: "context",
            });
          }
          wasHeld = false;
          didOpen = false;
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (visibleTimer) clearTimeout(visibleTimer);
      element.removeEventListener("click", markOpen);
    };
  }, [post.id]);

  useEffect(() => {
    if (!isNearViewport) {
      return;
    }

    void refreshPostActivity();
  }, [isNearViewport, refreshPostActivity]);

  useEffect(() => {
    if (!isNearViewport || !post.id) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isDisposed = false;

    void (async () => {
      const cleanup = await subscribeToPostActivity(post.id, (event) => {
        if (typeof event.postLikeCount === "number") {
          setLikeCount(event.postLikeCount);
        }

        if (typeof event.commentCount === "number") {
          setCommentCount(event.commentCount);
        }
      });

      if (isDisposed) {
        cleanup();
        return;
      }

      unsubscribe = cleanup;
    })();

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [isNearViewport, post.id]);

  useEffect(() => {
    if (!isNearViewport || typeof window === "undefined") {
      return;
    }

    const handleResume = () => {
      if (document.visibilityState === "visible") {
        void refreshPostActivity(true);
      }
    };

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [isNearViewport, refreshPostActivity]);

  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, []);

  const showAlert = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }

      setAlertState({ message, type });
      alertTimeoutRef.current = setTimeout(() => {
        setAlertState((current) => ({ ...current, message: null }));
      }, 3000);
    },
    [],
  );

  const copyPostLink = useCallback(async () => {
    if (typeof window === "undefined") {
      showAlert("Failed to copy post link", "error");
      return;
    }

    const postUrl = `${window.location.origin}/post/${encodeURIComponent(post.id)}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = postUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      void trackFeedInteraction({
        postId: post.id,
        interactionType: "SHARE",
        signalKind: "positive",
        metadata: {
          source: "copy-link",
        },
      });
      showAlert("Post link copied", "success");
    } catch (error) {
      console.error("Failed to copy post link:", error);
      showAlert("Failed to share post", "error");
    }
  }, [post.id, showAlert]);

  const handleDownload = useCallback(
    async (skipAuthCheck = false) => {
      if (isDownloading) return;
      if (!skipAuthCheck && !ensureAuthenticated("download")) return;

      setIsDownloading(true);
      try {
        const response = await fetch(
          `/api/posts/file?postId=${encodeURIComponent(post.id)}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "x-materialcrate-pdf-request": "download",
            },
          },
        );

        const errorBody = await response
          .clone()
          .json()
          .catch(() => ({}));
        if (!response.ok) {
          throw new Error(errorBody?.error || "Failed to download document");
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const safeTitle = (post.title?.trim() || "materialcrate-document")
          .replace(/[<>:"/\\|?*]+/g, "_")
          .replace(/\s+/g, " ");
        const extMap: Record<string, string> = {
          pdf: "pdf",
          docx: "docx",
          doc: "doc",
        };
        const ext = extMap[post.fileType ?? "pdf"] ?? "pdf";
        const fileName = `${safeTitle}.${ext}`;

        anchor.href = downloadUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(downloadUrl);

        showAlert("Download started", "success");
      } catch (error) {
        console.error("Failed to download post:", error);
        showAlert("Failed to download document", "error");
      } finally {
        setIsDownloading(false);
      }
    },
    [
      ensureAuthenticated,
      isDownloading,
      post.id,
      post.fileType,
      post.title,
      showAlert,
    ],
  );

  useEffect(() => {
    if (isLoading || !pendingProtectedAction) return;

    if (!user) {
      router.push("/login");
      setPendingProtectedAction(null);
      return;
    }

    const action = pendingProtectedAction;
    setPendingProtectedAction(null);

    if (action === "like") {
      void handleLike(true);
      return;
    }

    if (action === "comment") {
      onCommentClick?.(post);
      return;
    }

    if (action === "archive-add") {
      onArchiveClick?.(post);
      return;
    }

    if (action === "archive-remove") {
      onArchiveRemoveClick?.(post);
      return;
    }

    if (action === "download") {
      void handleDownload(true);
    }
  }, [
    handleDownload,
    handleLike,
    isLoading,
    onArchiveClick,
    onArchiveRemoveClick,
    onCommentClick,
    pendingProtectedAction,
    post,
    router,
    user,
  ]);

  return (
    <div ref={postCardRef}>
      <Alert message={alertState.message} type={alertState.type} />
      <article className="lg:rounded-xl lg:border lg:border-edge lg:mb-4 lg:bg-surface lg:shadow-sm">
        <div className="flex items-start justify-between px-2 pt-2">
          <button
            type="button"
            className="cursor-pointer flex min-w-0 items-center gap-3 text-left rounded-xl py-1 -ml-1 pl-1 transition-colors duration-200 hover:bg-surface-high active:bg-edge"
            onClick={() => {
              if (!authorRoute) return;
              router.push(authorRoute);
            }}
            disabled={!authorRoute}
          >
            <div className="flex h-11 w-11 aspect-square items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
              {authorProfilePicture ? (
                <Image
                  src={authorProfilePicture}
                  alt={`${authorFullName}'s profile picture`}
                  className="rounded-full object-cover"
                  width={44}
                  height={44}
                  unoptimized
                />
              ) : (
                <User size={18} color="var(--ink-3)" variant="Bold" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {authorFullName}
                </p>
                {post.author?.isBot ? (
                  <Cpu size={16} color="#2196F3" variant="Bold" />
                ) : (
                  hasPaidPlan && (
                    <Verify size={16} color="#E1761F" variant="Bold" />
                  )
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-3">
                <span>{authorUsername}</span>
                <span>&bull;</span>
                <span>{createdLabel}</span>
                {showPinnedIndicator && post.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E7] px-2 py-0.5 text-[#E1761F]">
                    <Location size={12} color="#E1761F" variant="Bold" />
                    <span>Pinned</span>
                  </span>
                )}
              </div>
            </div>
          </button>
          <button
            ref={optionsButtonRef}
            type="button"
            aria-label="Post options"
            onClick={() => {
              const rect = optionsButtonRef.current?.getBoundingClientRect();
              if (!rect) return;
              onOptionsClick?.(post, {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              });
            }}
            className="cursor-pointer rounded-full bg-page p-2 transition-all duration-200 hover:bg-surface-high active:scale-90"
          >
            <More size={18} color="var(--ink-2)" />
          </button>
        </div>

        {post.description && <PostDescription description={post.description} />}

        <div className="px-2 pt-4">
          <button
            type="button"
            aria-label={`Open ${post.title}`}
            onClick={() => {
              if (!ensureAuthenticated()) return;
              onFileClick?.(post);
            }}
            className="cursor-pointer group flex w-full items-start gap-4 rounded-[22px] bg-doc-card p-3 text-left transition-all duration-200 hover:bg-doc-card-hover active:scale-[0.98]"
          >
            <PdfThumbnail
              postId={post.id}
              fileUrl={post.fileUrl}
              thumbnailUrl={post.thumbnailUrl}
              title={post.title}
              fileType={post.fileType}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {post.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-doc-card text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2"
                  >
                    {category}
                  </span>
                ))}
                {post.year && (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">
                    {post.year}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm font-semibold text-ink">
                {post.title}
              </p>
            </div>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-edge px-2 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 disabled:opacity-60 ${
                viewerHasLiked
                  ? "bg-[#FDE9E9] text-[#C53B3B] hover:bg-[#FBD8D8]"
                  : "bg-surface-high text-ink-2 hover:bg-surface-high"
              }`}
              onClick={() => {
                void handleLike();
              }}
              disabled={isLiking}
            >
              <Heart
                size={18}
                color={viewerHasLiked ? "#E00505" : "var(--ink-3)"}
                variant={viewerHasLiked ? "Bold" : "Linear"}
              />
              <span>{likeCount}</span>
            </button>
            <button
              type="button"
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-surface-high px-3 py-2 text-xs font-semibold text-ink-2 transition-all duration-200 hover:bg-surface-high active:scale-95"
              onClick={() => {
                if (!ensureAuthenticated("comment")) return;
                onCommentClick?.(post);
              }}
            >
              <Messages2 size={18} color="var(--ink-3)" />
              <span>{commentCount}</span>
            </button>
            {(post.viewCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-high px-3 py-2 text-xs font-semibold text-ink-2">
                <Eye size={18} color="var(--ink-3)" />
                <span>{post.viewCount}</span>
              </span>
            )}
            <button
              aria-label="Archive"
              type="button"
              className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                isArchived
                  ? "bg-[#FFF3E7] text-[#E1761F] hover:bg-[#FFE9D4]"
                  : "bg-surface-high text-ink-2 hover:bg-surface-high"
              } ${isArchiveBusy ? "opacity-60" : ""}`}
              disabled={isArchiveBusy}
              onClick={() => {
                if (
                  !ensureAuthenticated(
                    isArchived ? "archive-remove" : "archive-add",
                  )
                ) {
                  return;
                }
                if (isArchived) {
                  onArchiveRemoveClick?.(post);
                  return;
                }
                onArchiveClick?.(post);
              }}
            >
              <Archive
                size={18}
                color={isArchived ? "#E1761F" : "var(--ink-3)"}
                variant={isArchived ? "Bold" : "Linear"}
              />
              <span>{isArchived ? "Saved" : "Save"}</span>
            </button>
          </div>
          <button
            type="button"
            aria-label="Share post"
            onClick={() => {
              void copyPostLink();
            }}
            className="inline-flex rounded-full bg-surface-high px-3 py-2 transition-all duration-200 hover:bg-surface-high active:scale-95"
          >
            <Send2 size={18} color="var(--ink-3)" />
          </button>
        </div>
      </article>
    </div>
  );
}
