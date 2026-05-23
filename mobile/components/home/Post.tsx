import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Share,
  Animated,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Heart,
  Messages2,
  Archive,
  More,
  User,
  Verify,
  Cpu,
  Send2,
  Eye,
  DocumentText,
  Folder2,
} from "iconsax-react-nativejs";
import { gql, WEB_URL } from "@/lib/api";
import { useAuth, getAuth } from "@/lib/auth-store";

// ---------------------------------------------------------------------------
// Archive GraphQL + types
// ---------------------------------------------------------------------------
const ARCHIVE_LITE_QUERY = `
  query ArchiveLite {
    myArchive {
      folders { id name }
      savedPosts { id postId }
    }
  }
`;

const SAVE_POST_MUTATION = `
  mutation SavePostToArchive($postId: ID!, $folderId: ID) {
    savePostToArchive(postId: $postId, folderId: $folderId) { id }
  }
`;

const REMOVE_POST_MUTATION = `
  mutation RemoveArchivedPost($savedPostId: ID!) {
    removeArchivedPost(savedPostId: $savedPostId)
  }
`;

type ArchiveFolder = { id: string; name: string };

// ---------------------------------------------------------------------------
// ArchiveSheet
// ---------------------------------------------------------------------------
type ArchiveSheetProps = {
  visible: boolean;
  postId: string;
  onClose: () => void;
  onSaved: (savedPostId: string) => void;
  onUnsaved: () => void;
};

function ArchiveSheet({
  visible,
  postId,
  onClose,
  onSaved,
  onUnsaved,
}: ArchiveSheetProps) {
  const { token } = getAuth();
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    gql<{
      myArchive: {
        folders: ArchiveFolder[];
        savedPosts: { id: string; postId: string }[];
      } | null;
    }>(ARCHIVE_LITE_QUERY, {}, token ?? undefined)
      .then((data) => {
        setFolders(data.myArchive?.folders ?? []);
        const match = data.myArchive?.savedPosts?.find(
          (p) => p.postId === postId,
        );
        setSavedPostId(match?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [visible, postId, token]);

  const handleSave = async (folderId?: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const data = await gql<{ savePostToArchive: { id: string } }>(
        SAVE_POST_MUTATION,
        { postId, folderId: folderId ?? null },
        token ?? undefined,
      );
      onSaved(data.savePostToArchive.id);
      onClose();
    } catch {
      Alert.alert("Error", "Failed to save file.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnsave = async () => {
    if (!savedPostId || isBusy) return;
    setIsBusy(true);
    try {
      await gql(REMOVE_POST_MUTATION, { savedPostId }, token ?? undefined);
      onUnsaved();
      onClose();
    } catch {
      Alert.alert("Error", "Failed to remove saved file.");
    } finally {
      setIsBusy(false);
    }
  };

  const isAlreadySaved = Boolean(savedPostId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={asStyles.backdrop} onPress={onClose}>
        <Pressable style={asStyles.sheet} onPress={() => {}}>
          <View style={asStyles.handle} />
          <Text style={asStyles.title}>
            {isAlreadySaved ? "Saved to Library" : "Save to Library"}
          </Text>

          {isLoading ? (
            <ActivityIndicator color="#E1761F" style={asStyles.loader} />
          ) : isAlreadySaved ? (
            <TouchableOpacity
              style={asStyles.removeBtn}
              onPress={() => void handleUnsave()}
              disabled={isBusy}
              activeOpacity={0.8}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#D12F2F" />
              ) : (
                <Text style={asStyles.removeBtnText}>Remove from saved</Text>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={asStyles.option}
                onPress={() => void handleSave()}
                disabled={isBusy}
                activeOpacity={0.75}
              >
                <Archive size={18} color="#E1761F" variant="Bold" />
                <Text style={asStyles.optionText}>Save to Library</Text>
                {isBusy && !folders.length && (
                  <ActivityIndicator size="small" color="#E1761F" />
                )}
              </TouchableOpacity>

              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={asStyles.option}
                  onPress={() => void handleSave(folder.id)}
                  disabled={isBusy}
                  activeOpacity={0.75}
                >
                  <Folder2 size={18} color="#9CA3AF" variant="Bold" />
                  <Text style={asStyles.optionText}>{folder.name}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const asStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FAFAF8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
    gap: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#111111", marginBottom: 8 },
  loader: { marginVertical: 20 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  optionText: { fontSize: 14, fontWeight: "500", color: "#111111", flex: 1 },
  removeBtn: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
  },
  removeBtnText: { fontSize: 14, fontWeight: "600", color: "#D12F2F" },
});

export type PostOptionsAnchor = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export type HomePost = {
  id: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
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
  createdAt: string;
  author?: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    subscriptionPlan?: string | null;
    isBot?: boolean;
  } | null;
};

type PostProps = {
  post: HomePost;
  onCommentClick?: (post: HomePost) => void;
  onOptionsClick?: (post: HomePost, anchor: PostOptionsAnchor) => void;
  onFileClick?: (post: HomePost) => void;
  isArchived?: boolean;
  isArchiveBusy?: boolean;
};

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

function hasPaidSubscription(plan?: string | null) {
  return plan === "pro" || plan === "premium";
}

export default function Post({
  post,
  onCommentClick,
  onOptionsClick,
  onFileClick,
  isArchived = false,
  isArchiveBusy = false,
}: PostProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const optionsRef = useRef<View>(null);

  const moreScaleAnim = useRef(new Animated.Value(1)).current;

  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [viewerHasLiked, setViewerHasLiked] = useState(
    Boolean(post.viewerHasLiked),
  );
  const [isLiking, setIsLiking] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const [localIsArchived, setLocalIsArchived] = useState(isArchived);
  const [showArchiveSheet, setShowArchiveSheet] = useState(false);
  useEffect(() => {
    setLocalIsArchived(isArchived);
  }, [isArchived]);

  // Reset image errors when FlatList recycles this component for a different post
  useEffect(() => {
    setThumbError(false);
  }, [post.id]);
  useEffect(() => {
    setAvatarError(false);
  }, [post.author?.profilePicture]);

  const authorFullName = post.author?.displayName?.trim() || "Unknown user";
  const authorUsername = post.author?.username
    ? `@${post.author.username}`
    : "@unknown";
  const hasPaidPlan = hasPaidSubscription(post.author?.subscriptionPlan);
  const createdLabel = formatTimeAgo(post.createdAt);
  const commentCount = post.commentCount ?? 0;

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      router.push("/(auth)/login");
      return;
    }
    if (isLiking) return;
    setIsLiking(true);
    const wasLiked = viewerHasLiked;
    setViewerHasLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));
    try {
      const { token } = getAuth();
      const data = await gql<{
        togglePostLike: {
          id: string;
          likeCount: number;
          viewerHasLiked: boolean;
        };
      }>(
        `mutation TogglePostLike($postId: ID!) {
          togglePostLike(postId: $postId) { id likeCount viewerHasLiked }
        }`,
        { postId: post.id },
        token ?? undefined,
      );
      setLikeCount(data.togglePostLike.likeCount);
      setViewerHasLiked(data.togglePostLike.viewerHasLiked);
    } catch {
      setViewerHasLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      setIsLiking(false);
    }
  }, [isAuthenticated, isLiking, viewerHasLiked, post.id, router]);

  const handleShare = useCallback(async () => {
    await Share.share({
      url: `https://materialcrate.com/post/${encodeURIComponent(post.id)}`,
      message: post.title,
    });
  }, [post.id, post.title]);

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <TouchableOpacity
          style={styles.authorInfo}
          activeOpacity={0.7}
          onPress={() => {
            if (!post.author?.username) return;
            router.push(
              `/user/${encodeURIComponent(post.author.username)}` as never,
            );
          }}
        >
          <View style={styles.avatar}>
            {post.author?.profilePicture && !avatarError ? (
              <Image
                source={{ uri: post.author.profilePicture }}
                style={styles.avatarImage}
                onError={() => setAvatarError(true)}
              />
            ) : (
              <User size={18} color="#AAAAAA" variant="Bold" />
            )}
          </View>
          <View style={styles.authorMeta}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorFullName}
              </Text>
              {hasPaidPlan && (
                <Verify size={14} color="#E1761F" variant="Bold" />
              )}
            </View>
            <Text style={styles.authorSub}>
              {authorUsername}
              {"  •  "}
              {createdLabel}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          ref={optionsRef}
          onPressIn={() =>
            Animated.spring(moreScaleAnim, {
              toValue: 0.8,
              useNativeDriver: true,
              damping: 15,
              stiffness: 500,
            }).start()
          }
          onPressOut={() =>
            Animated.spring(moreScaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              damping: 10,
              stiffness: 200,
            }).start()
          }
          onPress={() => {
            optionsRef.current?.measure(
              (
                _x: number,
                _y: number,
                width: number,
                height: number,
                pageX: number,
                pageY: number,
              ) => {
                onOptionsClick?.(post, { pageX, pageY, width, height });
              },
            );
          }}
          activeOpacity={1}
          hitSlop={8}
          style={styles.optionsButton}
        >
          <Animated.View style={{ transform: [{ scale: moreScaleAnim }] }}>
            <More size={18} color="#959595" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {!!post.description && (
        <Text style={styles.description}>{post.description}</Text>
      )}

      <TouchableOpacity
        style={styles.docCard}
        activeOpacity={0.85}
        onPress={() => onFileClick?.(post)}
      >
        <View style={styles.thumbnail}>
          {post.thumbnailUrl && !thumbError ? (
            <Image
              key={post.id}
              source={{
                uri: `${WEB_URL}/api/posts/thumbnail?postId=${encodeURIComponent(post.id)}`,
              }}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <View style={styles.thumbnailFallback}>
              <DocumentText size={36} color="#C4BAB0" variant="Bulk" />
            </View>
          )}
        </View>
        <View style={styles.docMeta}>
          <View style={styles.categories}>
            {post.categories.slice(0, 2).map((cat) => (
              <Text key={cat} style={styles.category}>
                {cat.toUpperCase()}
              </Text>
            ))}
            {post.year != null && <Text style={styles.year}>{post.year}</Text>}
          </View>
          <Text style={styles.docTitle} numberOfLines={2}>
            {post.title}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          <TouchableOpacity
            style={[styles.pill, viewerHasLiked && styles.pillLiked]}
            onPress={handleLike}
            disabled={isLiking}
            activeOpacity={0.8}
          >
            <Heart
              size={16}
              color={viewerHasLiked ? "#E00505" : "#959595"}
              variant={viewerHasLiked ? "Bold" : "Linear"}
            />
            <Text
              style={[styles.pillText, viewerHasLiked && styles.pillTextLiked]}
            >
              {likeCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pill}
            onPress={() => onCommentClick?.(post)}
            activeOpacity={0.8}
          >
            <Messages2 size={16} color="#959595" />
            <Text style={styles.pillText}>{commentCount}</Text>
          </TouchableOpacity>

          {(post.viewCount ?? 0) > 0 && (
            <View style={styles.pill}>
              <Eye size={16} color="#959595" />
              <Text style={styles.pillText}>{post.viewCount}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.pill, localIsArchived && styles.pillSaved]}
            onPress={() => {
              if (!isAuthenticated) {
                router.push("/(auth)/login" as never);
                return;
              }
              setShowArchiveSheet(true);
            }}
            disabled={isArchiveBusy}
            activeOpacity={0.8}
          >
            <Archive
              size={16}
              color={localIsArchived ? "#E1761F" : "#959595"}
              variant={localIsArchived ? "Bold" : "Linear"}
            />
            <Text
              style={[styles.pillText, localIsArchived && styles.pillTextSaved]}
            >
              {localIsArchived ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.pill}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <Send2 size={16} color="#959595" />
          <Text style={styles.pillText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ArchiveSheet
        visible={showArchiveSheet}
        postId={post.id}
        onClose={() => setShowArchiveSheet(false)}
        onSaved={() => setLocalIsArchived(true)}
        onUnsaved={() => setLocalIsArchived(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  authorMeta: {
    flex: 1,
    minWidth: 0,
  },
  authorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#131212",
    flexShrink: 1,
  },
  authorSub: {
    fontSize: 12,
    color: "#959595",
    marginTop: 2,
  },
  optionsButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: "#131212",
    marginTop: 10,
    paddingHorizontal: 4,
  },
  docCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 12,
  },
  thumbnail: {
    width: 112,
    height: 160,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  thumbnailImage: {
    width: 112,
    height: 160,
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  docMeta: {
    flex: 1,
    gap: 6,
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  category: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: "#6B7280",
  },
  year: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  docTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#131212",
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    marginTop: 12,
    paddingVertical: 10,
  },
  actionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillLiked: {
    backgroundColor: "#FDE9E9",
  },
  pillSaved: {
    backgroundColor: "#FFF3E7",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  pillTextLiked: {
    color: "#C53B3B",
  },
  pillTextSaved: {
    color: "#E1761F",
  },
});
