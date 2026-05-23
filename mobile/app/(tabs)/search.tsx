import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SearchNormal1, User, Verify } from "iconsax-react-nativejs";
import { SafeAreaView } from "react-native-safe-area-context";
import { gql } from "@/lib/api";
import { getAuth, useAuth } from "@/lib/auth-store";
import { hasPaidSubscription } from "@/lib/subscription";
import Post, { type HomePost, type PostOptionsAnchor } from "@/components/home/Post";
import PostOptionsSheet from "@/components/home/PostOptionsSheet";
import CommentDrawer from "@/components/home/CommentDrawer";
import PdfViewerModal from "@/components/home/PdfViewerModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SearchTab = "documents" | "users";

type SearchUser = {
  id: string;
  username: string;
  displayName: string;
  profilePicture?: string | null;
  followersCount?: number | null;
  followingCount?: number | null;
  subscriptionPlan?: string | null;
  isBot?: boolean;
  institution?: string | null;
  program?: string | null;
};

type ListRow =
  | { type: "post"; item: HomePost }
  | { type: "user"; item: SearchUser };

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const PAGE_SIZE = 12;

const SEARCH_QUERY = `
  query Search($query: String!, $limit: Int!, $offset: Int!) {
    searchUsers(query: $query, limit: $limit, offset: $offset) {
      id username displayName profilePicture
      followersCount followingCount subscriptionPlan isBot institution program
    }
    searchPosts(query: $query, limit: $limit, offset: $offset) {
      id fileUrl thumbnailUrl fileType title categories description year pinned
      commentsDisabled likeCount commentCount viewerHasLiked viewCount createdAt
      author { id displayName username profilePicture subscriptionPlan isBot }
    }
  }
`;

const AUTHENTICATED_SEARCH_QUERY = `
  query Search($query: String!, $limit: Int!, $offset: Int!) {
    me { blockedUserIds following { username } mutedUsers { username } }
    searchUsers(query: $query, limit: $limit, offset: $offset) {
      id username displayName profilePicture
      followersCount followingCount subscriptionPlan isBot institution program
    }
    searchPosts(query: $query, limit: $limit, offset: $offset) {
      id fileUrl thumbnailUrl fileType title categories description year pinned
      commentsDisabled likeCount commentCount viewerHasLiked viewCount createdAt
      author { id displayName username profilePicture subscriptionPlan isBot }
    }
  }
`;

// ---------------------------------------------------------------------------
// UserCard
// ---------------------------------------------------------------------------
function UserCard({ user, onPress }: { user: SearchUser; onPress: () => void }) {
  const isPaid = hasPaidSubscription(user.subscriptionPlan);

  return (
    <TouchableOpacity style={ucStyles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={ucStyles.avatar}>
        {user.profilePicture ? (
          <Image source={{ uri: user.profilePicture }} style={ucStyles.avatarImg} />
        ) : (
          <User size={20} color="#8d7a67" variant="Bold" />
        )}
      </View>
      <View style={ucStyles.info}>
        <View style={ucStyles.nameRow}>
          <Text style={ucStyles.displayName} numberOfLines={1}>
            {user.displayName || user.username}
          </Text>
          {isPaid && <Verify size={15} color="#E1761F" variant="Bold" />}
        </View>
        <Text style={ucStyles.username} numberOfLines={1}>@{user.username}</Text>
      </View>
    </TouchableOpacity>
  );
}

const ucStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f4f1eb",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44, borderRadius: 12 },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  displayName: { fontSize: 14, fontWeight: "600", color: "#111111", flexShrink: 1 },
  username: { fontSize: 12, fontWeight: "500", color: "#6B7280", marginTop: 1 },
});

// ---------------------------------------------------------------------------
// SearchScreen
// ---------------------------------------------------------------------------
export default function SearchScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("documents");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [documents, setDocuments] = useState<HomePost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const [commentPost, setCommentPost] = useState<HomePost | null>(null);
  const [optionsState, setOptionsState] = useState<{
    post: HomePost;
    anchor: PostOptionsAnchor;
  } | null>(null);
  const [pdfPost, setPdfPost] = useState<HomePost | null>(null);

  const offsetRef = useRef({ users: 0, documents: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ------------------------------------------------------------------
  // Core fetch
  // ------------------------------------------------------------------
  const fetchSearch = useCallback(
    async (
      q: string,
      offset: number,
      signal: AbortSignal,
    ): Promise<{ users: SearchUser[]; documents: HomePost[]; hasMore: boolean }> => {
      const { token } = getAuth();
      const queryStr =
        isAuthenticated && token ? AUTHENTICATED_SEARCH_QUERY : SEARCH_QUERY;

      const data = await gql<{
        me?: {
          blockedUserIds: string[];
          following: { username: string }[];
          mutedUsers: { username: string }[];
        } | null;
        searchUsers: SearchUser[];
        searchPosts: (HomePost & {
          author?: { id?: string | null; username?: string | null } | null;
        })[];
      }>(queryStr, { query: q, limit: PAGE_SIZE, offset }, token ?? undefined, signal);

      const rawUsers = data.searchUsers ?? [];
      const rawPosts = data.searchPosts ?? [];

      const followingSet = new Set(
        (data.me?.following ?? [])
          .map((f) => f.username?.trim().toLowerCase())
          .filter(Boolean),
      );
      const mutedSet = new Set(
        (data.me?.mutedUsers ?? [])
          .map((m) => m.username?.trim().toLowerCase())
          .filter(Boolean),
      );
      const blockedSet = new Set(
        (data.me?.blockedUserIds ?? []).filter(Boolean),
      );

      const docs: HomePost[] = rawPosts.map((post) => ({
        ...post,
        isAuthorFollowedByCurrentUser: post.author?.username
          ? followingSet.has(post.author.username.trim().toLowerCase())
          : false,
        isAuthorMutedByCurrentUser: post.author?.username
          ? mutedSet.has(post.author.username.trim().toLowerCase())
          : false,
        isAuthorBlockedByCurrentUser: post.author?.id
          ? blockedSet.has(post.author.id)
          : false,
      }));

      return {
        users: rawUsers,
        documents: docs,
        hasMore: rawPosts.length === PAGE_SIZE || rawUsers.length === PAGE_SIZE,
      };
    },
    [isAuthenticated],
  );

  // ------------------------------------------------------------------
  // Debounced search on query change
  // ------------------------------------------------------------------
  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setUsers([]);
      setDocuments([]);
      setHasMore(false);
      setError("");
      setIsLoading(false);
      offsetRef.current = { users: 0, documents: 0 };
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError("");
      offsetRef.current = { users: 0, documents: 0 };

      fetchSearch(trimmed, 0, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setUsers(result.users);
          setDocuments(result.documents);
          setHasMore(result.hasMore);
          offsetRef.current = {
            users: result.users.length,
            documents: result.documents.length,
          };
        })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError") return;
          if (controller.signal.aborted) return;
          setUsers([]);
          setDocuments([]);
          setHasMore(false);
          setError("Search failed. Try again.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSearch]);

  // ------------------------------------------------------------------
  // Re-run search when tab changes (instant, no debounce)
  // ------------------------------------------------------------------
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError("");
    offsetRef.current = { users: 0, documents: 0 };

    fetchSearch(trimmed, 0, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setUsers(result.users);
        setDocuments(result.documents);
        setHasMore(result.hasMore);
        offsetRef.current = {
          users: result.users.length,
          documents: result.documents.length,
        };
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (!controller.signal.aborted) setError("Search failed. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ------------------------------------------------------------------
  // Load more (infinite scroll)
  // ------------------------------------------------------------------
  const loadMore = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isFetchingMore || !hasMore) return;

    const offset =
      activeTab === "users"
        ? offsetRef.current.users
        : offsetRef.current.documents;

    const controller = new AbortController();
    setIsFetchingMore(true);
    try {
      const result = await fetchSearch(trimmed, offset, controller.signal);
      setUsers((prev) =>
        activeTab === "users" ? [...prev, ...result.users] : prev,
      );
      setDocuments((prev) =>
        activeTab === "documents" ? [...prev, ...result.documents] : prev,
      );
      setHasMore(result.hasMore);
      offsetRef.current = {
        users:
          activeTab === "users"
            ? offsetRef.current.users + result.users.length
            : offsetRef.current.users,
        documents:
          activeTab === "documents"
            ? offsetRef.current.documents + result.documents.length
            : offsetRef.current.documents,
      };
    } catch {
      // silently fail — user can scroll again
    } finally {
      setIsFetchingMore(false);
    }
  }, [query, isFetchingMore, hasMore, activeTab, fetchSearch]);

  // ------------------------------------------------------------------
  // Post event handlers
  // ------------------------------------------------------------------
  const handlePostUpdated = useCallback((updated: HomePost) => {
    setDocuments((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );
    setOptionsState((prev) =>
      prev?.post.id === updated.id ? { ...prev, post: updated } : prev,
    );
    setCommentPost((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev,
    );
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setDocuments((prev) => prev.filter((p) => p.id !== postId));
    setOptionsState((prev) => (prev?.post.id === postId ? null : prev));
    setCommentPost((prev) => (prev?.id === postId ? null : prev));
    setPdfPost((prev) => (prev?.id === postId ? null : prev));
  }, []);

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------
  const hasQuery = query.trim().length > 0;
  const visibleCount = activeTab === "users" ? users.length : documents.length;
  const showEmpty = hasQuery && !isLoading && visibleCount === 0 && !error;

  const listData: ListRow[] =
    activeTab === "documents"
      ? documents.map((d) => ({ type: "post", item: d }))
      : users.map((u) => ({ type: "user", item: u }));

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <SearchNormal1 size={18} color="#c56f1b" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Find users and documents..."
            placeholderTextColor="#B8A898"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {isLoading && (
            <ActivityIndicator size="small" color="#E1761F" style={styles.loadingSpinner} />
          )}
        </View>
      </View>

      {/* Loading bar */}
      {isLoading && <View style={styles.loadingBar} />}

      {/* Tab switcher */}
      {hasQuery && (
        <View style={styles.tabs}>
          {(["documents", "users"] as SearchTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {!hasQuery ? (
        <View style={styles.emptyState}>
          <SearchNormal1 size={44} color="#E1CB9F" />
          <Text style={styles.emptyTitle}>Search</Text>
          <Text style={styles.emptySubtitle}>
            Find users and documents across Material Crate
          </Text>
        </View>
      ) : showEmpty ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>
            {`Nothing matched "${query.trim()}". Try a broader keyword or switch tabs.`}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.noResults}>
          <Text style={[styles.noResultsText, styles.errorText]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(row, i) => `${row.type}-${row.item.id ?? i}`}
          renderItem={({ item: row, index }) => {
            if (row.type === "user") {
              return (
                <UserCard
                  user={row.item}
                  onPress={() =>
                    router.push(
                      `/(tabs)/user/${encodeURIComponent(row.item.username)}` as never,
                    )
                  }
                />
              );
            }
            return (
              <>
                <Post
                  post={row.item}
                  onCommentClick={setCommentPost}
                  onOptionsClick={(post, anchor) =>
                    setOptionsState({ post, anchor })
                  }
                  onFileClick={setPdfPost}
                />
                {index < listData.length - 1 && (
                  <View style={styles.divider} />
                )}
              </>
            );
          }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingMore ? (
              <ActivityIndicator
                color="#E1761F"
                style={styles.footerSpinner}
              />
            ) : null
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      <CommentDrawer
        postId={commentPost?.id ?? null}
        post={commentPost}
        isOpen={commentPost !== null}
        onClose={() => setCommentPost(null)}
      />
      <PostOptionsSheet
        post={optionsState?.post ?? null}
        anchor={optionsState?.anchor ?? null}
        isOpen={optionsState !== null}
        onClose={() => setOptionsState(null)}
        onPostUpdated={handlePostUpdated}
        onPostDeleted={handlePostDeleted}
        onPostHidden={handlePostDeleted}
      />
      <PdfViewerModal
        post={pdfPost}
        isOpen={pdfPost !== null}
        onClose={() => setPdfPost(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#ffffff" },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fffaf4",
    borderWidth: 1,
    borderColor: "#f0dfc8",
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#5c3910",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111111",
    paddingVertical: 0,
  },
  loadingSpinner: { marginLeft: 4 },
  loadingBar: {
    height: 2,
    backgroundColor: "#E1761F",
    marginHorizontal: 16,
    borderRadius: 1,
  },
  tabs: {
    flexDirection: "row",
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabLabelActive: {
    color: "#111111",
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#111111",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },
  noResults: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  noResultsText: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
  },
  errorText: { color: "#D12F2F" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 20,
    marginVertical: 8,
  },
  listContent: { paddingBottom: 32 },
  footerSpinner: { paddingVertical: 20 },
});
