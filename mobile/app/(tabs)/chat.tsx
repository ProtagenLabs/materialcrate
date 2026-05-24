import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Messages2,
  SearchNormal1,
  Edit2,
  ArrowLeft2,
  TickCircle,
  UserAdd,
} from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const CONVERSATIONS_QUERY = `
  query Conversations($limit: Int, $cursor: String) {
    conversations(limit: $limit, cursor: $cursor) {
      items {
        id
        participant {
          id
          name
          username
          avatar
          isOnline
        }
        lastMessage
        lastMessageTime
        lastMessageSentByMe
        lastMessageIsRead
        unreadCount
        updatedAt
      }
      nextCursor
    }
  }
`;

const START_CONVERSATION_MUTATION = `
  mutation StartConversation($userId: ID!) {
    startConversation(userId: $userId) {
      id
      participant {
        id
        name
        username
        avatar
        isOnline
      }
      lastMessage
      lastMessageTime
      lastMessageSentByMe
      lastMessageIsRead
      unreadCount
    }
  }
`;

const CHAT_USER_SUGGESTIONS_QUERY = `
  query ChatUserSuggestions($query: String) {
    chatUserSuggestions(query: $query) {
      id
      displayName
      username
      profilePicture
      followersCount
      isFollowing
      hasExistingConversation
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatFilter = "all" | "unread";

type RawParticipant = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
};

type RawConversation = {
  id: string;
  participant: RawParticipant;
  lastMessage: string | null;
  lastMessageTime: string | null;
  lastMessageSentByMe: boolean;
  lastMessageIsRead: boolean;
  unreadCount: number;
};

type ChatConversation = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  isOnline: boolean;
  isSentByMe: boolean;
  isRead: boolean;
};

type ChatUserSuggestion = {
  id: string;
  displayName: string;
  username: string;
  profilePicture: string | null;
  followersCount: number;
  isFollowing: boolean;
  hasExistingConversation: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_BG = ["#FFE6CF", "#E8EBFF", "#DBF5EC", "#FFE0E8", "#EEE8FF", "#FEF3C7"];
const AVATAR_FG = ["#B76217", "#4150D8", "#197356", "#B33F61", "#684AD9", "#92400E"];

function avatarColors(id: string) {
  const i = (id.charCodeAt(0) ?? 0) % AVATAR_BG.length;
  return { bg: AVATAR_BG[i], fg: AVATAR_FG[i] };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfMsgDay.getTime()) / 86400000,
  );
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toConversation(c: RawConversation): ChatConversation {
  return {
    id: c.id,
    name: c.participant.name,
    username: c.participant.username,
    avatar: c.participant.avatar,
    lastMessage: c.lastMessage,
    lastMessageTime: c.lastMessageTime,
    unreadCount: c.unreadCount,
    isOnline: c.participant.isOnline,
    isSentByMe: c.lastMessageSentByMe,
    isRead: c.lastMessageIsRead,
  };
}

// ─── ConversationItem ─────────────────────────────────────────────────────────

function ConversationItem({
  chat,
  onPress,
}: {
  chat: ChatConversation;
  onPress: () => void;
}) {
  const { bg, fg } = avatarColors(chat.id);
  const isUnread = chat.unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.convItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: bg }]}>
          {chat.avatar ? (
            <Image
              source={{ uri: chat.avatar }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.avatarText, { color: fg }]}>
              {getInitials(chat.name)}
            </Text>
          )}
        </View>
        {chat.isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.convBody}>
        <View style={styles.convRow}>
          <Text
            style={[styles.convName, isUnread && styles.convNameUnread]}
            numberOfLines={1}
          >
            {chat.name}
          </Text>
          <Text
            style={[styles.convTime, isUnread && styles.convTimeUnread]}
          >
            {formatRelativeTime(chat.lastMessageTime)}
          </Text>
        </View>

        <View style={styles.convRow}>
          <View style={styles.convMsgRow}>
            {chat.isSentByMe && (
              <TickCircle
                size={13}
                color={chat.isRead ? "#E1761F" : "#959595"}
                variant={chat.isRead ? "Bold" : "Linear"}
              />
            )}
            <Text
              style={[styles.convMsg, isUnread && styles.convMsgUnread]}
              numberOfLines={1}
            >
              {chat.lastMessage ?? ""}
            </Text>
          </View>
          {isUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── SkeletonRow ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View style={styles.convItem}>
      <View style={[styles.avatar, styles.skeleton]} />
      <View style={styles.convBody}>
        <View style={styles.convRow}>
          <View style={[styles.skeletonLine, { width: 120, height: 13 }]} />
          <View style={[styles.skeletonLine, { width: 36, height: 11 }]} />
        </View>
        <View style={[styles.skeletonLine, { width: 180, height: 11, marginTop: 6 }]} />
      </View>
    </View>
  );
}

// ─── ComposeView ──────────────────────────────────────────────────────────────

function ComposeView({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ChatUserSuggestion[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const fetchUsers = useCallback((q: string) => {
    const { token } = getAuth();
    setIsLoadingUsers(true);
    void gql<{ chatUserSuggestions: ChatUserSuggestion[] }>(
      CHAT_USER_SUGGESTIONS_QUERY,
      { query: q || null },
      token ?? undefined,
    )
      .then((data) => setUsers(data.chatUserSuggestions ?? []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoadingUsers(false));
  }, []);

  useEffect(() => {
    fetchUsers("");
  }, [fetchUsers]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(text.trim()), 350);
  };

  const handleSelectUser = async (user: ChatUserSuggestion) => {
    if (startingId) return;
    setStartingId(user.id);
    const { token } = getAuth();
    try {
      const data = await gql<{ startConversation: { id: string } }>(
        START_CONVERSATION_MUTATION,
        { userId: user.id },
        token ?? undefined,
      );
      const convId = data.startConversation?.id;
      if (convId) {
        onClose();
        router.push(`/chat/${encodeURIComponent(convId)}` as never);
      }
    } catch {
      // ignore
    } finally {
      setStartingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.composeSafe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.composeHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
            <ArrowLeft2 size={22} color="#111111" variant="Linear" />
          </TouchableOpacity>
          <View style={styles.composeSearch}>
            <SearchNormal1 size={15} color="#959595" variant="Linear" />
            <TextInput
              ref={inputRef}
              style={styles.composeInput}
              placeholder="Search people…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={handleQueryChange}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(""); fetchUsers(""); }} hitSlop={6}>
                <Text style={styles.composeClear}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Section label */}
        <View style={styles.composeSectionLabel}>
          <Text style={styles.composeSectionText}>
            {query ? "RESULTS" : "SUGGESTED"}
          </Text>
        </View>

        {/* User list */}
        {isLoadingUsers ? (
          <FlatList
            data={Array.from({ length: 6 }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            renderItem={() => (
              <View style={styles.suggestionItem}>
                <View style={[styles.suggestionAvatar, styles.skeleton]} />
                <View>
                  <View style={[styles.skeletonLine, { width: 110, height: 13 }]} />
                  <View style={[styles.skeletonLine, { width: 80, height: 11, marginTop: 5 }]} />
                </View>
              </View>
            )}
          />
        ) : users.length === 0 ? (
          <View style={styles.emptyCenter}>
            <View style={styles.emptyIcon}>
              <UserAdd size={28} color="#959595" variant="Bulk" />
            </View>
            <Text style={styles.emptyTitle}>
              {query ? "No users found" : "No suggestions yet"}
            </Text>
            <Text style={styles.emptyBody}>
              {query
                ? `No one matches "${query}".`
                : "Follow people or start chatting to see suggestions."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            renderItem={({ item: user }) => {
              const { bg, fg } = avatarColors(user.id);
              const hint = user.hasExistingConversation
                ? "Recent"
                : user.isFollowing
                  ? "Following"
                  : null;
              const isStarting = startingId === user.id;
              return (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() => void handleSelectUser(user)}
                  disabled={isStarting || Boolean(startingId)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.suggestionAvatar, { backgroundColor: bg }]}>
                    {user.profilePicture ? (
                      <Image
                        source={{ uri: user.profilePicture }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={[styles.avatarText, { color: fg, fontSize: 13 }]}>
                        {getInitials(user.displayName)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {user.displayName}
                    </Text>
                    <Text style={styles.suggestionUsername} numberOfLines={1}>
                      @{user.username}
                    </Text>
                  </View>
                  {isStarting ? (
                    <ActivityIndicator size="small" color="#E1761F" />
                  ) : hint ? (
                    <View style={styles.suggestionHint}>
                      <Text style={styles.suggestionHintText}>{hint}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── ChatScreen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const { token } = getAuth();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [showCompose, setShowCompose] = useState(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await gql<{
        conversations: { items: RawConversation[]; nextCursor: string | null };
      }>(CONVERSATIONS_QUERY, { limit: 20 }, token ?? undefined);
      setConversations((data.conversations.items ?? []).map(toConversation));
      setNextCursor(data.conversations.nextCursor ?? null);
    } catch {
      setError("Failed to load conversations.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const fetchMore = useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const data = await gql<{
        conversations: { items: RawConversation[]; nextCursor: string | null };
      }>(CONVERSATIONS_QUERY, { limit: 20, cursor: nextCursor }, token ?? undefined);
      setConversations((prev) => [
        ...prev,
        ...(data.conversations.items ?? []).map(toConversation),
      ]);
      setNextCursor(data.conversations.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isFetchingMore, token]);

  useFocusEffect(
    useCallback(() => {
      void fetchConversations();
    }, [fetchConversations]),
  );

  const searchLower = search.trim().toLowerCase();
  const filtered = conversations.filter((chat) => {
    const matchesFilter =
      filter === "all" || (filter === "unread" && chat.unreadCount > 0);
    const matchesSearch =
      !searchLower ||
      chat.name.toLowerCase().includes(searchLower) ||
      chat.username.toLowerCase().includes(searchLower) ||
      (chat.lastMessage?.toLowerCase().includes(searchLower) ?? false);
    return matchesFilter && matchesSearch;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Modal
        visible={showCompose}
        animationType="slide"
        onRequestClose={() => setShowCompose(false)}
      >
        <ComposeView onClose={() => setShowCompose(false)} />
      </Modal>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Messages</Text>
          {totalUnread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowCompose(true)}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Edit2 size={20} color="#111111" variant="Linear" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <SearchNormal1 size={16} color="#959595" variant="Linear" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages…"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={6}>
              <Text style={styles.composeClear}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {(["all", "unread"] as ChatFilter[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterPill, filter === tab && styles.filterPillActive]}
            onPress={() => setFilter(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>
              {tab === "unread" && totalUnread > 0
                ? `Unread (${totalUnread})`
                : tab === "all"
                  ? "All"
                  : "Unread"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <FlatList
          data={Array.from({ length: 7 }, (_, i) => i)}
          keyExtractor={(i) => String(i)}
          renderItem={() => <SkeletonRow />}
        />
      ) : error ? (
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void fetchConversations()}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCenter}>
          <View style={styles.emptyIcon}>
            <Messages2 size={28} color="#959595" variant="Bulk" />
          </View>
          <Text style={styles.emptyTitle}>
            {search
              ? "No results"
              : filter === "unread"
                ? "All caught up"
                : "No messages yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {search
              ? `No conversations match "${search}".`
              : filter === "unread"
                ? "You have no unread messages."
                : "Start a conversation by tapping the compose button."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConversationItem
              chat={item}
              onPress={() =>
                router.push(`/chat/${encodeURIComponent(item.id)}` as never)
              }
            />
          )}
          onEndReached={() => {
            if (!search && filter === "all") void fetchMore();
          }}
          onEndReachedThreshold={0.2}
          ListFooterComponent={
            isFetchingMore ? (
              <ActivityIndicator
                size="small"
                color="#E1761F"
                style={{ paddingVertical: 16 }}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111111" },

  searchRow: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111111" },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterPill: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#F3F4F6",
  },
  filterPillActive: { backgroundColor: "#111111" },
  filterText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  filterTextActive: { color: "#FFFFFF" },

  convItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "600" },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#1F9D75",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  convBody: { flex: 1, minWidth: 0 },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  convName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#111111",
  },
  convNameUnread: { fontWeight: "700" },
  convTime: { fontSize: 11, color: "#9CA3AF", flexShrink: 0 },
  convTimeUnread: { color: "#E1761F", fontWeight: "600" },
  convMsgRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  convMsg: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
  },
  convMsgUnread: { color: "#111111", fontWeight: "500" },
  badge: {
    backgroundColor: "#E1761F",
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },

  skeleton: { backgroundColor: "#E5E7EB" },
  skeletonLine: { borderRadius: 6, backgroundColor: "#E5E7EB" },

  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
    textAlign: "center",
    marginBottom: 6,
  },
  emptyBody: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#E1761F",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },

  // Compose
  composeSafe: { flex: 1, backgroundColor: "#FFFFFF" },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  composeSearch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composeInput: { flex: 1, fontSize: 14, color: "#111111" },
  composeClear: { fontSize: 12, fontWeight: "500", color: "#9CA3AF" },
  composeSectionLabel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  composeSectionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1.2,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  suggestionAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionName: { fontSize: 14, fontWeight: "600", color: "#111111" },
  suggestionUsername: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  suggestionHint: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  suggestionHintText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },
});
