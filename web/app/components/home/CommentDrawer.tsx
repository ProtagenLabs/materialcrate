import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CloseCircle, Edit2, Flag, Heart, More, Send, Trash, User, Verify } from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import { useSystemPopup } from "@/app/components/SystemPopup";
import { subscribeToPostActivity } from "@/app/lib/post-activity-realtime";
import { hasPaidSubscription } from "@/app/lib/subscription";
import { renderTextWithMentions } from "@/app/lib/mention-renderer";
import Alert from "../Alert";
import MentionInput from "../MentionInput";
import type { HomePost } from "./Post";

interface CommentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string | null;
  post?: HomePost | null;
}

type CommentAuthor = {
  id: string;
  displayName?: string | null;
  username?: string | null;
  profilePicture?: string | null;
  profilePictureUrl?: string | null;
  subscriptionPlan?: string | null;
};

type DrawerComment = {
  id: string;
  postId: string;
  parentId?: string | null;
  content: string;
  replyCount: number;
  likeCount: number;
  viewerHasLiked?: boolean;
  createdAt: string;
  author?: CommentAuthor | null;
};

type ReplyTarget = {
  parentCommentId: string;
  mention: string;
};

type OptionsAnchor = {
  top: number;
  right: number;
  bottom: number;
};

type CommentAction = {
  label: string;
  icon: React.ReactNode;
  isDestructive?: boolean;
  onClick: () => void;
};

const REPLIES_BATCH_SIZE = 10;
const COMMENTS_BATCH_SIZE = 50;
const COMMENTS_REALTIME_REFRESH_DEBOUNCE_MS = 700;
const COMMENTS_REALTIME_MIN_REFRESH_INTERVAL_MS = 1500;

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

function getAuthorName(author?: CommentAuthor | null) {
  const displayName = author?.displayName?.trim();
  if (displayName) return displayName;
  if (author?.username?.trim()) return author.username;
  return "Unknown user";
}

function getAuthorMention(author?: CommentAuthor | null) {
  const username = author?.username?.trim();
  if (username) return `@${username}`;

  const fallback = getAuthorName(author).replace(/\s+/g, "").toLowerCase();
  return `@${fallback || "user"}`;
}

function getAuthorProfilePicture(author?: CommentAuthor | null) {
  return author?.profilePicture || author?.profilePictureUrl || "";
}

function hasPaidAuthorSubscription(author?: CommentAuthor | null) {
  return hasPaidSubscription(author?.subscriptionPlan);
}

function CommentOptionsMenu({
  isOpen,
  onClose,
  anchor,
  actions,
}: {
  isOpen: boolean;
  onClose: () => void;
  anchor: OptionsAnchor | null;
  actions: CommentAction[];
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<React.CSSProperties | undefined>();

  useLayoutEffect(() => {
    if (!anchor || !isOpen || typeof window === "undefined") {
      setPosition(undefined);
      return;
    }

    const gap = 6;
    const viewportPadding = 16;
    const menuHeight = menuRef.current?.offsetHeight ?? 120;
    const right = Math.max(
      viewportPadding,
      Math.round(window.innerWidth - anchor.right),
    );
    const fitsBelow =
      anchor.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;

    if (fitsBelow) {
      setPosition({
        top: `${Math.round(anchor.bottom + gap)}px`,
        right: `${right}px`,
      });
    } else {
      setPosition({
        top: `${Math.max(viewportPadding, Math.round(anchor.top - menuHeight - gap))}px`,
        right: `${right}px`,
      });
    }
  }, [anchor, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={menuRef}
      style={position}
      className={`fixed z-[200] rounded-2xl border border-edge bg-surface p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] transition-all duration-200 ease-out min-w-[160px] ${
        position ? "left-auto" : "right-4"
      } ${
        isOpen
          ? "opacity-100 scale-100 pointer-events-auto"
          : "opacity-0 scale-95 pointer-events-none"
      }`}
    >
      <div className="overflow-hidden rounded-xl bg-page">
        {actions.map((action, index) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/5 active:opacity-60 transition-colors text-sm ${
              action.isDestructive ? "text-[#D12F2F]" : "text-ink"
            } ${index < actions.length - 1 ? "border-b border-edge" : ""}`}
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CommentDrawer({
  isOpen,
  onClose,
  postId,
  post,
}: CommentDrawerProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const popup = useSystemPopup();
  const [comments, setComments] = useState<DrawerComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<
    Record<string, boolean>
  >({});
  const [repliesByCommentId, setRepliesByCommentId] = useState<
    Record<string, DrawerComment[]>
  >({});
  const [isLoadingRepliesByCommentId, setIsLoadingRepliesByCommentId] =
    useState<Record<string, boolean>>({});
  const [isLikingByCommentId, setIsLikingByCommentId] = useState<
    Record<string, boolean>
  >({});

  const [activeOptionsCommentId, setActiveOptionsCommentId] = useState<string | null>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<OptionsAnchor | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isDeletingCommentId, setIsDeletingCommentId] = useState<string | null>(null);

  const expandedRepliesRef = useRef<Record<string, boolean>>({});
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const lastRealtimeRefreshRef = useRef(0);

  const isOwner =
    Boolean(typeof user?.username === "string" && user.username.trim()) &&
    typeof user?.username === "string" &&
    user.username.trim().toLowerCase() ===
      post?.author?.username?.trim().toLowerCase();
  const commentsLocked = Boolean(post?.commentsDisabled) && !isOwner;

  const currentUsername =
    typeof user?.username === "string" ? user.username.trim().toLowerCase() : "";

  const resetState = useCallback(() => {
    setExpandedRepliesByCommentId({});
    setRepliesByCommentId({});
    setDraftComment("");
    setReplyTarget(null);
    setActiveOptionsCommentId(null);
    setOptionsAnchor(null);
    setEditingCommentId(null);
    setEditDraft("");
  }, []);

  const ensureAuthenticated = useCallback(() => {
    if (isLoading) return false;
    if (!user) {
      router.push("/login");
      return false;
    }
    return true;
  }, [isLoading, router, user]);

  const fetchComments = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!postId) {
        setComments([]);
        return;
      }

      if (!silent) {
        setIsLoadingComments(true);
      }
      setCommentsError(null);

      try {
        const response = await fetch(
          `/api/comments?postId=${encodeURIComponent(postId)}&limit=${COMMENTS_BATCH_SIZE}&offset=0`,
          { method: "GET", cache: "no-store" },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to load comments");
        }

        setComments(Array.isArray(body?.comments) ? body.comments : []);
      } catch (error) {
        if (!silent) {
          setComments([]);
        }
        setCommentsError("Failed to load comments");
        console.error("Failed to load comments for post", error);
      } finally {
        if (!silent) {
          setIsLoadingComments(false);
        }
      }
    },
    [postId],
  );

  useEffect(() => {
    if (!isOpen || !postId) return;
    void fetchComments();
  }, [fetchComments, isOpen, postId]);

  const loadReplies = useCallback(
    async (commentId: string, offset: number) => {
      if (!postId) return;

      setIsLoadingRepliesByCommentId((previous) => ({
        ...previous,
        [commentId]: true,
      }));

      try {
        const response = await fetch(
          `/api/comments?postId=${encodeURIComponent(postId)}&parentCommentId=${encodeURIComponent(commentId)}&limit=${REPLIES_BATCH_SIZE}&offset=${offset}`,
          { method: "GET", cache: "no-store" },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to load replies");
        }

        const incomingReplies = Array.isArray(body?.comments)
          ? body.comments
          : [];
        setRepliesByCommentId((previous) => ({
          ...previous,
          [commentId]:
            offset === 0
              ? incomingReplies
              : [...(previous[commentId] ?? []), ...incomingReplies],
        }));
        setCommentsError(null);
      } catch (error) {
        setCommentsError("Failed to load replies");
        console.error("Failed to load replies for comment", commentId, error);
      } finally {
        setIsLoadingRepliesByCommentId((previous) => ({
          ...previous,
          [commentId]: false,
        }));
      }
    },
    [postId],
  );

  useEffect(() => {
    expandedRepliesRef.current = expandedRepliesByCommentId;
  }, [expandedRepliesByCommentId]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }
    };
  }, []);

  // On desktop the comment window pops up in the same bottom-right slot as the
  // chat window. Broadcast its open state so the chat panel can slide aside
  // instead of overlapping it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mc:comment-window", { detail: { open: isOpen } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("mc:comment-window", { detail: { open: false } }),
      );
    };
  }, [isOpen]);

  const scheduleRealtimeCommentsRefresh = useCallback(
    (delay = COMMENTS_REALTIME_REFRESH_DEBOUNCE_MS) => {
      if (!isOpen || !postId || typeof window === "undefined") {
        return;
      }

      if (document.visibilityState === "hidden") {
        return;
      }

      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      const elapsed = Date.now() - lastRealtimeRefreshRef.current;
      const nextDelay =
        elapsed >= COMMENTS_REALTIME_MIN_REFRESH_INTERVAL_MS
          ? delay
          : Math.max(
              delay,
              COMMENTS_REALTIME_MIN_REFRESH_INTERVAL_MS - elapsed,
            );

      realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
        lastRealtimeRefreshRef.current = Date.now();
        void fetchComments({ silent: true });

        Object.entries(expandedRepliesRef.current).forEach(
          ([commentId, isExpanded]) => {
            if (isExpanded) {
              void loadReplies(commentId, 0);
            }
          },
        );
      }, nextDelay);
    },
    [fetchComments, isOpen, loadReplies, postId],
  );

  const handleToggleReplies = async (comment: DrawerComment) => {
    const commentId = comment.id;
    const isOpenForComment = Boolean(expandedRepliesByCommentId[commentId]);

    if (isOpenForComment) {
      setExpandedRepliesByCommentId((previous) => ({
        ...previous,
        [commentId]: false,
      }));
      return;
    }

    setExpandedRepliesByCommentId((previous) => ({
      ...previous,
      [commentId]: true,
    }));

    if (!repliesByCommentId[commentId]?.length) {
      await loadReplies(commentId, 0);
    }
  };

  const handleShowMoreReplies = async (comment: DrawerComment) => {
    const commentId = comment.id;
    const currentReplies = repliesByCommentId[commentId] ?? [];
    await loadReplies(commentId, currentReplies.length);
  };

  const applyUpdatedComment = useCallback(
    (updated: Partial<DrawerComment> & { id: string }) => {
      setComments((previous) =>
        previous.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setRepliesByCommentId((previous) => {
        const next: Record<string, DrawerComment[]> = {};
        for (const [parentId, replies] of Object.entries(previous)) {
          next[parentId] = replies.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item,
          );
        }
        return next;
      });
    },
    [],
  );

  const removeComment = useCallback((commentId: string, parentId?: string | null) => {
    if (parentId) {
      setRepliesByCommentId((previous) => ({
        ...previous,
        [parentId]: (previous[parentId] ?? []).filter((r) => r.id !== commentId),
      }));
      setComments((previous) =>
        previous.map((c) =>
          c.id === parentId ? { ...c, replyCount: Math.max(0, c.replyCount - 1) } : c,
        ),
      );
    } else {
      setComments((previous) => previous.filter((c) => c.id !== commentId));
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !postId) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isDisposed = false;

    void (async () => {
      const cleanup = await subscribeToPostActivity(postId, (event) => {
        if (event.commentId && typeof event.commentLikeCount === "number") {
          applyUpdatedComment({
            id: event.commentId,
            likeCount: event.commentLikeCount,
          });
        }

        if (event.parentCommentId && typeof event.replyCount === "number") {
          applyUpdatedComment({
            id: event.parentCommentId,
            replyCount: event.replyCount,
          });
        }

        if (event.reason === "comment-created") {
          scheduleRealtimeCommentsRefresh(250);
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
  }, [applyUpdatedComment, isOpen, postId, scheduleRealtimeCommentsRefresh]);

  useEffect(() => {
    if (!isOpen || !postId || typeof window === "undefined") {
      return;
    }

    const handleResume = () => {
      if (document.visibilityState === "visible") {
        scheduleRealtimeCommentsRefresh(0);
      }
    };

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [isOpen, postId, scheduleRealtimeCommentsRefresh]);

  const handleLikeComment = async (commentId: string) => {
    if (isLikingByCommentId[commentId] || !ensureAuthenticated()) return;

    setIsLikingByCommentId((previous) => ({ ...previous, [commentId]: true }));
    try {
      const response = await fetch("/api/comments/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to toggle comment like");
      }

      const updatedComment = body?.comment;
      if (updatedComment?.id) {
        applyUpdatedComment({
          id: updatedComment.id,
          likeCount:
            typeof updatedComment.likeCount === "number"
              ? updatedComment.likeCount
              : 0,
          viewerHasLiked: Boolean(updatedComment.viewerHasLiked),
        });
      }
      setCommentsError(null);
    } catch (error) {
      setCommentsError("Failed to toggle comment like");
      console.error("Failed to toggle like for comment", commentId, error);
    } finally {
      setIsLikingByCommentId((previous) => ({
        ...previous,
        [commentId]: false,
      }));
    }
  };

  const handleReplyToComment = (target: DrawerComment) => {
    if (commentsLocked) return;
    if (!ensureAuthenticated()) return;

    const parentCommentId = target.parentId ?? target.id;
    const mention = getAuthorMention(target.author);

    setReplyTarget({ parentCommentId, mention });
    setExpandedRepliesByCommentId((previous) => ({
      ...previous,
      [parentCommentId]: true,
    }));
    setDraftComment((previous) => {
      const trimmed = previous.trimStart();
      if (trimmed.startsWith(`${mention} `) || trimmed === mention) {
        return previous;
      }
      return `${mention} ${trimmed}`.trim();
    });
  };

  const renderContentWithMentions = useCallback(
    (content: string) => renderTextWithMentions(content),
    [],
  );

  const handleSubmitComment = async () => {
    const baseContent = draftComment.trim();
    const content = replyTarget
      ? baseContent.startsWith(replyTarget.mention)
        ? baseContent
        : `${replyTarget.mention} ${baseContent}`.trim()
      : baseContent;
    if (
      commentsLocked ||
      !postId ||
      !content ||
      isSubmittingComment ||
      !ensureAuthenticated()
    ) {
      return;
    }

    setIsSubmittingComment(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          content,
          parentCommentId: replyTarget?.parentCommentId ?? null,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to post comment");
      }

      if (body?.comment) {
        const createdComment = body.comment as DrawerComment;
        if (replyTarget?.parentCommentId) {
          setRepliesByCommentId((previous) => ({
            ...previous,
            [replyTarget.parentCommentId]: [
              ...(previous[replyTarget.parentCommentId] ?? []),
              createdComment,
            ],
          }));
          setComments((previous) =>
            previous.map((item) =>
              item.id === replyTarget.parentCommentId
                ? { ...item, replyCount: item.replyCount + 1 }
                : item,
            ),
          );
          setExpandedRepliesByCommentId((previous) => ({
            ...previous,
            [replyTarget.parentCommentId]: true,
          }));
        } else {
          setComments((previous) => [createdComment, ...previous]);
        }
      }
      setDraftComment("");
      setReplyTarget(null);
      setCommentsError(null);
    } catch (error) {
      setCommentsError("Failed to post comment");
      console.error("Failed to post comment", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = useCallback(
    async (comment: DrawerComment, label = "Delete comment") => {
      if (!ensureAuthenticated()) return;

      const confirmed = await popup.confirm({
        title: label === "Remove comment" ? "Remove this comment?" : "Delete comment?",
        message:
          label === "Remove comment"
            ? "This comment will be permanently removed from your post."
            : "This will permanently delete your comment.",
        confirmLabel: label === "Remove comment" ? "Remove" : "Delete",
        cancelLabel: "Cancel",
        isDestructive: true,
      });

      if (!confirmed) return;

      setIsDeletingCommentId(comment.id);
      try {
        const response = await fetch("/api/comments/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId: comment.id }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.ok) {
          throw new Error(body?.error || "Failed to delete comment");
        }

        removeComment(comment.id, comment.parentId);
        setCommentsError(null);
      } catch (error) {
        setCommentsError("Failed to delete comment");
        console.error("Failed to delete comment", comment.id, error);
      } finally {
        setIsDeletingCommentId(null);
      }
    },
    [ensureAuthenticated, popup, removeComment],
  );

  const handleStartEdit = useCallback((comment: DrawerComment) => {
    setEditingCommentId(comment.id);
    setEditDraft(comment.content);
    setActiveOptionsCommentId(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditDraft("");
  }, []);

  const handleSubmitEdit = useCallback(
    async (comment: DrawerComment) => {
      const trimmedContent = editDraft.trim();
      if (!trimmedContent || trimmedContent === comment.content || isSubmittingEdit) return;

      setIsSubmittingEdit(true);
      try {
        const response = await fetch("/api/comments/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId: comment.id, content: trimmedContent }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.ok) {
          throw new Error(body?.error || "Failed to edit comment");
        }

        if (body?.comment) {
          applyUpdatedComment({ id: comment.id, content: body.comment.content });
        }
        setEditingCommentId(null);
        setEditDraft("");
        setCommentsError(null);
      } catch (error) {
        setCommentsError("Failed to edit comment");
        console.error("Failed to edit comment", comment.id, error);
      } finally {
        setIsSubmittingEdit(false);
      }
    },
    [applyUpdatedComment, editDraft, isSubmittingEdit],
  );

  const handleReportComment = useCallback(
    async (comment: DrawerComment) => {
      if (!ensureAuthenticated()) return;

      const confirmed = await popup.confirm({
        title: "Report comment?",
        message: "This comment will be flagged for review by our team.",
        confirmLabel: "Report",
        cancelLabel: "Cancel",
        isDestructive: false,
      });

      if (!confirmed) return;

      try {
        const response = await fetch("/api/comments/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentId: comment.id,
            reason: "Inappropriate content",
          }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.ok) {
          throw new Error(body?.error || "Failed to report comment");
        }

        setCommentsError(null);
      } catch (error) {
        setCommentsError("Failed to report comment");
        console.error("Failed to report comment", comment.id, error);
      }
    },
    [ensureAuthenticated, popup],
  );

  const getCommentActions = useCallback(
    (comment: DrawerComment): CommentAction[] => {
      const commentAuthorUsername =
        comment.author?.username?.trim().toLowerCase() ?? "";
      const isCommentAuthor =
        Boolean(currentUsername) && currentUsername === commentAuthorUsername;

      if (isCommentAuthor) {
        return [
          {
            label: "Edit",
            icon: <Edit2 size={16} color="#111111" variant="Bold" />,
            onClick: () => handleStartEdit(comment),
          },
          {
            label: "Delete",
            icon: <Trash size={16} color="#D12F2F" variant="Bold" />,
            isDestructive: true,
            onClick: () => void handleDeleteComment(comment, "Delete comment"),
          },
        ];
      }

      if (isOwner) {
        return [
          {
            label: "Remove comment",
            icon: <Trash size={16} color="#D12F2F" variant="Bold" />,
            isDestructive: true,
            onClick: () => void handleDeleteComment(comment, "Remove comment"),
          },
          {
            label: "Report",
            icon: <Flag size={16} color="#111111" variant="Bold" />,
            onClick: () => void handleReportComment(comment),
          },
        ];
      }

      return [
        {
          label: "Report",
          icon: <Flag size={16} color="#111111" variant="Bold" />,
          onClick: () => void handleReportComment(comment),
        },
      ];
    },
    [currentUsername, handleDeleteComment, handleReportComment, handleStartEdit, isOwner],
  );

  const handleClose = () => {
    if (typeof window !== "undefined" && realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
      realtimeRefreshTimeoutRef.current = null;
    }

    resetState();
    onClose();
  };

  const handleOptionsButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    commentId: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (activeOptionsCommentId === commentId) {
      setActiveOptionsCommentId(null);
      setOptionsAnchor(null);
    } else {
      setOptionsAnchor({ top: rect.top, right: rect.right, bottom: rect.bottom });
      setActiveOptionsCommentId(commentId);
    }
  };

  const renderCommentContent = (comment: DrawerComment) => {
    if (editingCommentId === comment.id) {
      return (
        <div className="space-y-2 w-full">
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full text-xs text-ink bg-surface-high rounded-xl px-3 py-2 resize-none focus:outline-none placeholder:text-ink-3"
            placeholder="Edit your comment..."
            autoFocus
          />
          <div className="flex items-center gap-3 justify-end text-xs font-medium">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-ink-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitEdit(comment)}
              disabled={
                isSubmittingEdit ||
                !editDraft.trim() ||
                editDraft.trim() === comment.content
              }
              className="text-[#1A66FF] disabled:opacity-40"
            >
              {isSubmittingEdit ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      );
    }

    return <p className="text-xs text-ink">{renderContentWithMentions(comment.content)}</p>;
  };

  const activeOptionsComment = useMemo(() => {
    if (!activeOptionsCommentId) return null;
    const top = comments.find((c) => c.id === activeOptionsCommentId);
    if (top) return top;
    for (const replies of Object.values(repliesByCommentId)) {
      const reply = replies.find((r) => r.id === activeOptionsCommentId);
      if (reply) return reply;
    }
    return null;
  }, [activeOptionsCommentId, comments, repliesByCommentId]);

  const activeCommentActions = useMemo(
    () => (activeOptionsComment ? getCommentActions(activeOptionsComment) : []),
    [activeOptionsComment, getCommentActions],
  );

  const showOptionsButton = Boolean(user);

  return (
    <>
      {commentsError && <Alert type="error" message={commentsError} />}

      <CommentOptionsMenu
        isOpen={Boolean(activeOptionsCommentId)}
        onClose={() => {
          setActiveOptionsCommentId(null);
          setOptionsAnchor(null);
        }}
        anchor={optionsAnchor}
        actions={activeCommentActions}
      />

      <div
        className={`fixed inset-x-0 top-[15%] bottom-0 bg-surface z-100 rounded-t-3xl px-6 py-6 space-y-3 transition-all duration-300 ease-out lg:inset-x-auto lg:top-auto lg:left-auto lg:bottom-6 lg:right-4 lg:h-130 lg:w-80 lg:rounded-2xl lg:border lg:border-edge lg:shadow-2xl lg:p-0 lg:space-y-0 lg:flex lg:flex-col lg:overflow-hidden ${
          isOpen
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-[110%] opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex justify-center items-center relative lg:justify-between lg:shrink-0 lg:border-b lg:border-edge lg:px-3 lg:py-2.5">
          <h1 className="text-lg text-ink font-medium lg:text-sm lg:font-semibold">
            Comments
          </h1>
          <button
            type="button"
            aria-label="Close comments"
            onClick={handleClose}
            className="absolute right-0 lg:static"
          >
            <CloseCircle size={24} color="#959595" className="lg:hidden" />
            <CloseCircle
              size={18}
              color="var(--ink-3)"
              className="hidden lg:block"
            />
          </button>
        </div>
        <div className="relative space-y-4 pb-18 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:px-3 lg:py-3 lg:pb-3">
          {!postId ? (
            <p className="text-xs text-ink-2">
              Select a post to view comments.
            </p>
          ) : isLoadingComments ? (
            <p className="text-xs text-ink-2">Loading comments...</p>
          ) : comments.length === 0 ? null : (
            comments.map((comment) => {
              const commentId = comment.id;
              const isRepliesOpen = Boolean(
                expandedRepliesByCommentId[commentId],
              );
              const replies = repliesByCommentId[commentId] ?? [];
              const hasMoreReplies = replies.length < comment.replyCount;
              const hiddenRepliesCount = comment.replyCount - replies.length;
              const isLoadingReplies = Boolean(
                isLoadingRepliesByCommentId[commentId],
              );
              const isDeleting = isDeletingCommentId === commentId;

              return (
                <div key={commentId} className={isDeleting ? "opacity-50 pointer-events-none" : ""}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 bg-surface-high aspect-square rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      {getAuthorProfilePicture(comment.author) ? (
                        <Image
                          src={getAuthorProfilePicture(comment.author)}
                          alt={`${getAuthorName(comment.author)}'s profile picture`}
                          width={28}
                          height={28}
                          className="w-full h-full object-cover rounded-full"
                          unoptimized
                        />
                      ) : (
                        <User size={14} color="#808080" variant="Bold" />
                      )}
                    </div>
                    <div className="space-y-1 w-full min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5 min-w-0">
                          <p className="text-xs text-ink font-semibold truncate">
                            {getAuthorName(comment.author)}
                          </p>
                          {hasPaidAuthorSubscription(comment.author) ? (
                            <Verify size={14} color="#E1761F" variant="Bold" />
                          ) : null}
                        </div>
                        {showOptionsButton && editingCommentId !== commentId ? (
                          <button
                            type="button"
                            aria-label="More options"
                            onClick={(e) => handleOptionsButtonClick(e, commentId)}
                            className="shrink-0 p-1 -mr-1 rounded-full hover:bg-black/5 active:opacity-60 transition-colors"
                          >
                            <More size={16} color="#808080" />
                          </button>
                        ) : null}
                      </div>
                      {renderCommentContent(comment)}
                      {editingCommentId !== commentId ? (
                        <div className="flex items-center font-medium justify-between text-xs text-ink-2">
                          <div className="flex items-center gap-5">
                            <p>{formatTimeAgo(comment.createdAt)}</p>
                            <button
                              type="button"
                              onClick={() => handleReplyToComment(comment)}
                              disabled={commentsLocked}
                              className="disabled:opacity-50"
                            >
                              Reply
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <p className="">{comment.likeCount ?? 0}</p>
                            <button
                              type="button"
                              aria-label="like button"
                              onClick={() => void handleLikeComment(comment.id)}
                              disabled={Boolean(isLikingByCommentId[comment.id])}
                              className="disabled:opacity-60"
                            >
                              <Heart
                                size={18}
                                color={
                                  comment.viewerHasLiked ? "#E00505" : "#808080"
                                }
                                variant={
                                  comment.viewerHasLiked ? "Bold" : "Linear"
                                }
                              />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {comment.replyCount > 0 ? (
                    <div className="flex items-center gap-2 ml-9 mt-3 ">
                      <div className="pointer-events-none h-px w-4 border border-[#A8A8A8]/20 " />
                      <button
                        type="button"
                        onClick={() => void handleToggleReplies(comment)}
                        className="text-xs text-ink-2 font-medium"
                      >
                        {isRepliesOpen
                          ? "Close replies"
                          : `View all ${comment.replyCount} replies`}
                      </button>
                    </div>
                  ) : null}

                  {isRepliesOpen ? (
                    <div className="ml-11 mt-3 space-y-3">
                      {replies.map((reply) => {
                        const isReplyDeleting = isDeletingCommentId === reply.id;
                        return (
                          <div
                            key={reply.id}
                            className={`flex items-start gap-3 ${isReplyDeleting ? "opacity-50 pointer-events-none" : ""}`}
                          >
                            <div className="w-10 aspect-square bg-surface-high rounded-full flex items-center justify-center overflow-hidden shrink-0">
                              {getAuthorProfilePicture(reply.author) ? (
                                <Image
                                  src={getAuthorProfilePicture(reply.author)}
                                  alt={`${getAuthorName(reply.author)}'s profile picture`}
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover rounded-full"
                                  unoptimized
                                />
                              ) : (
                                <User size={14} color="#808080" variant="Bold" />
                              )}
                            </div>
                            <div className="space-y-1 w-full min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-0.5 min-w-0">
                                  <p className="text-xs text-ink font-semibold truncate">
                                    {getAuthorName(reply.author)}
                                  </p>
                                  {hasPaidAuthorSubscription(reply.author) ? (
                                    <Verify
                                      size={14}
                                      color="#E1761F"
                                      variant="Bold"
                                    />
                                  ) : null}
                                </div>
                                {showOptionsButton && editingCommentId !== reply.id ? (
                                  <button
                                    type="button"
                                    aria-label="More options"
                                    onClick={(e) => handleOptionsButtonClick(e, reply.id)}
                                    className="shrink-0 p-1 -mr-1 rounded-full hover:bg-black/5 active:opacity-60 transition-colors"
                                  >
                                    <More size={16} color="#808080" />
                                  </button>
                                ) : null}
                              </div>
                              {renderCommentContent(reply)}
                              {editingCommentId !== reply.id ? (
                                <div className="flex items-center justify-between text-xs text-ink-2 font-medium ">
                                  <div className="flex items-center gap-5">
                                    <p>{formatTimeAgo(reply.createdAt)}</p>
                                    <button
                                      type="button"
                                      onClick={() => handleReplyToComment(reply)}
                                      disabled={commentsLocked}
                                      className="disabled:opacity-50"
                                    >
                                      Reply
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <p>{reply.likeCount ?? 0}</p>
                                    <button
                                      type="button"
                                      aria-label="like comment"
                                      onClick={() =>
                                        void handleLikeComment(reply.id)
                                      }
                                      disabled={Boolean(
                                        isLikingByCommentId[reply.id],
                                      )}
                                      className="disabled:opacity-60"
                                    >
                                      <Heart
                                        size={18}
                                        color={
                                          reply.viewerHasLiked
                                            ? "#E00505"
                                            : "#808080"
                                        }
                                        variant={
                                          reply.viewerHasLiked ? "Bold" : "Linear"
                                        }
                                      />
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {isLoadingReplies ? (
                        <p className="text-xs text-ink-2">
                          Loading replies...
                        </p>
                      ) : null}
                      {hasMoreReplies && !isLoadingReplies ? (
                        <button
                          type="button"
                          onClick={() => void handleShowMoreReplies(comment)}
                          className="text-xs text-ink-2 font-medium"
                        >
                          Show 10 more replies ({hiddenRepliesCount} left)
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <div className="absolute bottom-8 left-6 right-6 space-y-2 lg:static lg:shrink-0 lg:border-t lg:border-edge lg:p-3">
          {replyTarget ? (
            <div className="flex items-center justify-between text-[11px] text-ink-2 px-1">
              <p>
                Replying to{" "}
                <span className="text-[#1A66FF] font-semibold">
                  {replyTarget.mention}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="text-ink-2"
              >
                Cancel
              </button>
            </div>
          ) : null}
          {commentsLocked ? (
            <p className="px-1 text-[11px] text-ink-2">
              Comments are disabled for this post.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-7 lg:gap-2">
            <MentionInput
              value={draftComment}
              onChange={(val) => setDraftComment(val)}
              onSubmit={() => void handleSubmitComment()}
              placeholder={
                commentsLocked
                  ? "Comments are disabled"
                  : "Share your thoughts... "
              }
              disabled={commentsLocked}
              className="placeholder:text-ink-3 placeholder:text-xs text-xs py-3 px-3 w-full bg-surface-high rounded-3xl drop-shadow-xs focus:outline-0 disabled:opacity-60"
            />
            <button
              type="button"
              aria-label="submit comment"
              onClick={() => void handleSubmitComment()}
              disabled={
                commentsLocked ||
                !postId ||
                !draftComment.trim() ||
                isSubmittingComment
              }
              className="disabled:opacity-50"
            >
              <Send size={32} color="#5B5B5B" className="lg:hidden" />
              <Send
                size={24}
                color="#5B5B5B"
                className="hidden lg:block"
              />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
