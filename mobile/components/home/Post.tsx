import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Share,
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
} from "iconsax-react-nativejs";
import { apiUrl } from "@/lib/api";

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
  const optionsRef = useRef<TouchableOpacity>(null);

  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [viewerHasLiked, setViewerHasLiked] = useState(
    Boolean(post.viewerHasLiked),
  );
  const [isLiking, setIsLiking] = useState(false);

  const authorFullName = post.author?.displayName?.trim() || "Unknown user";
  const authorUsername = post.author?.username
    ? `@${post.author.username}`
    : "@unknown";
  const hasPaidPlan = hasPaidSubscription(post.author?.subscriptionPlan);
  const createdLabel = formatTimeAgo(post.createdAt);
  const commentCount = post.commentCount ?? 0;

  const handleLike = useCallback(async () => {
    if (isLiking) return;
    setIsLiking(true);
    const wasLiked = viewerHasLiked;
    // Optimistic update
    setViewerHasLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));
    try {
      const res = await fetch(apiUrl("/api/posts/like"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.post) {
        setLikeCount(body.post.likeCount ?? likeCount);
        setViewerHasLiked(Boolean(body.post.viewerHasLiked));
      }
    } catch {
      // Revert on failure
      setViewerHasLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      setIsLiking(false);
    }
  }, [isLiking, viewerHasLiked, likeCount, post.id]);

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
            {post.author?.profilePicture ? (
              <Image
                source={{ uri: post.author.profilePicture }}
                style={styles.avatarImage}
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
              {post.author?.isBot ? (
                <Cpu size={14} color="#2196F3" variant="Bold" />
              ) : (
                hasPaidPlan && (
                  <Verify size={14} color="#E1761F" variant="Bold" />
                )
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
          onPress={() => {
            optionsRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
              onOptionsClick?.(post, { pageX, pageY, width, height });
            });
          }}
          activeOpacity={0.7}
          hitSlop={8}
          style={styles.optionsButton}
        >
          <More size={18} color="#959595" />
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
          {post.thumbnailUrl ? (
            <Image
              source={{ uri: post.thumbnailUrl }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.thumbnailPlaceholder} />
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
            style={[styles.pill, isArchived && styles.pillSaved]}
            onPress={() => {}}
            disabled={isArchiveBusy}
            activeOpacity={0.8}
          >
            <Archive
              size={16}
              color={isArchived ? "#E1761F" : "#959595"}
              variant={isArchived ? "Bold" : "Linear"}
            />
            <Text style={[styles.pillText, isArchived && styles.pillTextSaved]}>
              {isArchived ? "Saved" : "Save"}
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
  thumbnailPlaceholder: {
    flex: 1,
    backgroundColor: "#D1D5DB",
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
