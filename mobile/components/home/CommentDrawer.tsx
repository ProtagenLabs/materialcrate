import React, { useState, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Heart, Send2, CloseCircle, User, Verify } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth, useAuth } from "@/lib/auth-store";
import type { HomePost } from "./Post";

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

type Props = {
  isOpen: boolean;
  onClose: () => void;
  postId: string | null;
  post?: HomePost | null;
};

const REPLIES_BATCH_SIZE = 10;
const COMMENTS_BATCH_SIZE = 50;

function formatTimeAgo(timestamp: string) {
  const trimmed = timestamp?.trim();
  if (!trimmed) return "Just now";
  let value = Number.NaN;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    value = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
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
  return `${Math.floor(hours / 24)}d ago`;
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

function hasPaidSubscription(plan?: string | null) {
  return plan === "pro" || plan === "premium";
}

export default function CommentDrawer({ isOpen, onClose, postId, post }: Props) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

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
  const [isLoadingRepliesByCommentId, setIsLoadingRepliesByCommentId] = useState<
    Record<string, boolean>
  >({});
  const [isLikingByCommentId, setIsLikingByCommentId] = useState<
    Record<string, boolean>
  >({});

  const commentsLocked = Boolean(post?.commentsDisabled);

  const [keyboardPadding, setKeyboardPadding] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardPadding(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardPadding(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const resetState = useCallback(() => {
    setExpandedRepliesByCommentId({});
    setRepliesByCommentId({});
    setDraftComment("");
    setReplyTarget(null);
    setCommentsError(null);
  }, []);

  const ensureAuthenticated = useCallback(() => {
    if (!getAuth().isAuthenticated) {
      router.push("/(auth)/login");
      return false;
    }
    return true;
  }, [router]);

  const fetchComments = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!postId) {
        setComments([]);
        return;
      }
      if (!silent) setIsLoadingComments(true);
      setCommentsError(null);
      try {
        const { token } = getAuth();
        const data = await gql<{ comments: DrawerComment[] }>(
          `query Comments($postId: ID!, $limit: Int!, $offset: Int!) {
            comments(postId: $postId, limit: $limit, offset: $offset) {
              id postId parentId content replyCount likeCount viewerHasLiked createdAt
              author { id displayName username profilePicture subscriptionPlan }
            }
          }`,
          { postId, limit: COMMENTS_BATCH_SIZE, offset: 0 },
          token ?? undefined,
        );
        setComments(Array.isArray(data?.comments) ? data.comments : []);
      } catch {
        if (!silent) setComments([]);
        setCommentsError("Failed to load comments");
      } finally {
        if (!silent) setIsLoadingComments(false);
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
      setIsLoadingRepliesByCommentId((prev) => ({ ...prev, [commentId]: true }));
      try {
        const { token } = getAuth();
        const data = await gql<{ comments: DrawerComment[] }>(
          `query Replies($postId: ID!, $parentCommentId: ID, $limit: Int!, $offset: Int!) {
            comments(postId: $postId, parentCommentId: $parentCommentId, limit: $limit, offset: $offset) {
              id postId parentId content replyCount likeCount viewerHasLiked createdAt
              author { id displayName username profilePicture subscriptionPlan }
            }
          }`,
          { postId, parentCommentId: commentId, limit: REPLIES_BATCH_SIZE, offset },
          token ?? undefined,
        );
        const incoming: DrawerComment[] = Array.isArray(data?.comments) ? data.comments : [];
        setRepliesByCommentId((prev) => ({
          ...prev,
          [commentId]:
            offset === 0 ? incoming : [...(prev[commentId] ?? []), ...incoming],
        }));
      } catch {
        setCommentsError("Failed to load replies");
      } finally {
        setIsLoadingRepliesByCommentId((prev) => ({ ...prev, [commentId]: false }));
      }
    },
    [postId],
  );

  const applyUpdatedComment = useCallback(
    (updated: Partial<DrawerComment> & { id: string }) => {
      setComments((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      );
      setRepliesByCommentId((prev) => {
        const next: Record<string, DrawerComment[]> = {};
        for (const [parentId, replies] of Object.entries(prev)) {
          next[parentId] = replies.map((r) =>
            r.id === updated.id ? { ...r, ...updated } : r,
          );
        }
        return next;
      });
    },
    [],
  );

  const handleToggleReplies = async (comment: DrawerComment) => {
    const isExpanded = Boolean(expandedRepliesByCommentId[comment.id]);
    if (isExpanded) {
      setExpandedRepliesByCommentId((prev) => ({ ...prev, [comment.id]: false }));
      return;
    }
    setExpandedRepliesByCommentId((prev) => ({ ...prev, [comment.id]: true }));
    if (!repliesByCommentId[comment.id]?.length) {
      await loadReplies(comment.id, 0);
    }
  };

  const handleShowMoreReplies = async (comment: DrawerComment) => {
    const current = repliesByCommentId[comment.id] ?? [];
    await loadReplies(comment.id, current.length);
  };

  const handleLikeComment = async (commentId: string) => {
    if (isLikingByCommentId[commentId]) return;
    if (!ensureAuthenticated()) return;
    setIsLikingByCommentId((prev) => ({ ...prev, [commentId]: true }));
    try {
      const { token } = getAuth();
      const data = await gql<{ toggleCommentLike: { id: string; likeCount: number; viewerHasLiked: boolean } }>(
        `mutation ToggleCommentLike($commentId: ID!) {
          toggleCommentLike(commentId: $commentId) { id likeCount viewerHasLiked }
        }`,
        { commentId },
        token ?? undefined,
      );
      const updated = data?.toggleCommentLike;
      if (updated?.id) {
        applyUpdatedComment({
          id: updated.id,
          likeCount: updated.likeCount,
          viewerHasLiked: updated.viewerHasLiked,
        });
      }
    } catch {
      setCommentsError("Failed to toggle like");
    } finally {
      setIsLikingByCommentId((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const handleReplyToComment = (target: DrawerComment) => {
    if (commentsLocked) return;
    if (!ensureAuthenticated()) return;
    const parentCommentId = target.parentId ?? target.id;
    const mention = getAuthorMention(target.author);
    setReplyTarget({ parentCommentId, mention });
    setExpandedRepliesByCommentId((prev) => ({ ...prev, [parentCommentId]: true }));
    setDraftComment((prev) => {
      const trimmed = prev.trimStart();
      if (trimmed.startsWith(`${mention} `) || trimmed === mention) return prev;
      return `${mention} ${trimmed}`.trim();
    });
  };

  const handleSubmitComment = async () => {
    const baseContent = draftComment.trim();
    const content = replyTarget
      ? baseContent.startsWith(replyTarget.mention)
        ? baseContent
        : `${replyTarget.mention} ${baseContent}`.trim()
      : baseContent;
    if (commentsLocked || !postId || !content || isSubmittingComment) return;
    if (!ensureAuthenticated()) return;
    setIsSubmittingComment(true);
    try {
      const { token } = getAuth();
      const data = await gql<{ createComment: DrawerComment }>(
        `mutation CreateComment($postId: ID!, $content: String!, $parentCommentId: ID) {
          createComment(postId: $postId, content: $content, parentCommentId: $parentCommentId) {
            id postId parentId content replyCount likeCount viewerHasLiked createdAt
            author { id displayName username profilePicture subscriptionPlan }
          }
        }`,
        { postId, content, parentCommentId: replyTarget?.parentCommentId ?? null },
        token ?? undefined,
      );
      if (data?.createComment) {
        const created = data.createComment;
        if (replyTarget?.parentCommentId) {
          setRepliesByCommentId((prev) => ({
            ...prev,
            [replyTarget.parentCommentId]: [
              ...(prev[replyTarget.parentCommentId] ?? []),
              created,
            ],
          }));
          setComments((prev) =>
            prev.map((c) =>
              c.id === replyTarget.parentCommentId
                ? { ...c, replyCount: c.replyCount + 1 }
                : c,
            ),
          );
          setExpandedRepliesByCommentId((prev) => ({
            ...prev,
            [replyTarget.parentCommentId]: true,
          }));
        } else {
          setComments((prev) => [created, ...prev]);
        }
      }
      setDraftComment("");
      setReplyTarget(null);
      setCommentsError(null);
    } catch {
      setCommentsError("Failed to post comment");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const renderCommentRow = (comment: DrawerComment, isReply = false) => {
    const pic = getAuthorProfilePicture(comment.author);
    const name = getAuthorName(comment.author);
    const isPaid = hasPaidSubscription(comment.author?.subscriptionPlan);
    const isLiking = Boolean(isLikingByCommentId[comment.id]);

    return (
      <View key={comment.id} style={[styles.commentRow, isReply && styles.replyRow]}>
        <View style={styles.avatar}>
          {pic ? (
            <Image source={{ uri: pic }} style={styles.avatarImage} />
          ) : (
            <User size={14} color="#AAAAAA" variant="Bold" />
          )}
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentNameRow}>
            <Text style={styles.commentAuthor} numberOfLines={1}>
              {name}
            </Text>
            {isPaid && <Verify size={12} color="#E1761F" variant="Bold" />}
          </View>
          <Text style={styles.commentContent}>{comment.content}</Text>
          <View style={styles.commentMeta}>
            <View style={styles.commentMetaLeft}>
              <Text style={styles.commentTime}>{formatTimeAgo(comment.createdAt)}</Text>
              {!commentsLocked && (
                <TouchableOpacity
                  onPress={() => handleReplyToComment(comment)}
                  hitSlop={8}
                >
                  <Text style={styles.replyBtn}>Reply</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.likeRow}
              onPress={() => void handleLikeComment(comment.id)}
              disabled={isLiking}
              hitSlop={8}
            >
              <Text style={styles.likeCount}>{comment.likeCount ?? 0}</Text>
              <Heart
                size={16}
                color={comment.viewerHasLiked ? "#E00505" : "#959595"}
                variant={comment.viewerHasLiked ? "Bold" : "Linear"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingBottom: keyboardPadding }]}>
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={8}
            style={styles.closeBtn}
          >
            <CloseCircle size={24} color="#959595" variant="Bold" />
          </TouchableOpacity>
        </View>

        {commentsError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{commentsError}</Text>
          </View>
        )}

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {!postId ? (
            <Text style={styles.emptyText}>Select a post to view comments.</Text>
          ) : isLoadingComments ? (
            <ActivityIndicator color="#E1761F" style={styles.loader} />
          ) : comments.length === 0 ? (
            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
          ) : (
            comments.map((comment) => {
              const isExpanded = Boolean(expandedRepliesByCommentId[comment.id]);
              const replies = repliesByCommentId[comment.id] ?? [];
              const hasMore = replies.length < comment.replyCount;
              const hiddenCount = comment.replyCount - replies.length;
              const isLoadingReplies = Boolean(isLoadingRepliesByCommentId[comment.id]);

              return (
                <View key={comment.id}>
                  {renderCommentRow(comment)}

                  {comment.replyCount > 0 && (
                    <View style={styles.viewRepliesRow}>
                      <View style={styles.repliesDivider} />
                      <TouchableOpacity
                        onPress={() => void handleToggleReplies(comment)}
                      >
                        <Text style={styles.viewRepliesText}>
                          {isExpanded
                            ? "Close replies"
                            : `View all ${comment.replyCount} replies`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isExpanded && (
                    <View style={styles.repliesContainer}>
                      {replies.map((reply) => renderCommentRow(reply, true))}
                      {isLoadingReplies && (
                        <ActivityIndicator color="#E1761F" style={styles.loader} />
                      )}
                      {hasMore && !isLoadingReplies && (
                        <TouchableOpacity
                          onPress={() => void handleShowMoreReplies(comment)}
                        >
                          <Text style={styles.showMoreText}>
                            Show 10 more replies ({hiddenCount} left)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputArea}>
          {replyTarget && (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>
                Replying to{" "}
                <Text style={styles.replyMention}>{replyTarget.mention}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setReplyTarget(null)}
                hitSlop={8}
              >
                <Text style={styles.cancelReply}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          {commentsLocked && (
            <Text style={styles.lockedText}>
              Comments are disabled for this post.
            </Text>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, commentsLocked && styles.inputDisabled]}
              value={draftComment}
              onChangeText={setDraftComment}
              placeholder={
                commentsLocked ? "Comments are disabled" : "Share your thoughts..."
              }
              placeholderTextColor="#AAAAAA"
              editable={!commentsLocked}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              onPress={() => void handleSubmitComment()}
              disabled={
                commentsLocked ||
                !postId ||
                !draftComment.trim() ||
                isSubmittingComment
              }
              hitSlop={8}
            >
              {isSubmittingComment ? (
                <ActivityIndicator color="#5B5B5B" size="small" />
              ) : (
                <Send2
                  size={28}
                  color={
                    commentsLocked || !draftComment.trim() ? "#CCCCCC" : "#5B5B5B"
                  }
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#131212",
  },
  closeBtn: {
    position: "absolute",
    right: 20,
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 16,
  },
  loader: {
    marginTop: 24,
  },
  emptyText: {
    marginTop: 24,
    fontSize: 13,
    color: "#959595",
    textAlign: "center",
  },
  // Comment row
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  replyRow: {
    marginLeft: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentBody: {
    flex: 1,
    gap: 3,
  },
  commentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: "600",
    color: "#131212",
    flexShrink: 1,
  },
  commentContent: {
    fontSize: 13,
    color: "#131212",
    lineHeight: 18,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  commentMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  commentTime: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "500",
  },
  replyBtn: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "600",
  },
  likeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  likeCount: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "500",
  },
  viewRepliesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 46,
    marginTop: 8,
  },
  repliesDivider: {
    height: 1,
    width: 16,
    backgroundColor: "#E5E7EB",
  },
  viewRepliesText: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "600",
  },
  repliesContainer: {
    marginLeft: 46,
    marginTop: 10,
    gap: 12,
  },
  showMoreText: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "600",
    marginTop: 4,
  },
  inputArea: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    gap: 6,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  replyBannerText: {
    fontSize: 11,
    color: "#959595",
  },
  replyMention: {
    color: "#1A66FF",
    fontWeight: "600",
  },
  cancelReply: {
    fontSize: 11,
    color: "#959595",
    fontWeight: "600",
  },
  lockedText: {
    fontSize: 11,
    color: "#959595",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: "#131212",
    maxHeight: 100,
    lineHeight: 18,
  },
  inputDisabled: {
    opacity: 0.5,
  },
});
