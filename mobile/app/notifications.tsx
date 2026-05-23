import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  AppState,
  type AppStateStatus,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArchiveMinus,
  ArrowLeft2,
  Coin1,
  DocumentText1,
  Heart,
  Like1,
  Notification,
  MedalStar,
  MessageText1,
  Profile2User,
  Setting4,
  Shield,
} from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth, useAuth } from "@/lib/auth-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ApiNotification = {
  id: string;
  type?: string | null;
  actorId?: string | null;
  actorUsername?: string | null;
  postId?: string | null;
  commentId?: string | null;
  caseId?: string | null;
  followRequestId?: string | null;
  achievementId?: string | null;
  title: string;
  description: string;
  icon?: string | null;
  profilePicture?: string | null;
  unread: boolean;
  time: string;
};

type NotificationRow = ApiNotification & {
  accent: string;
  bgColor: string;
  imageLabel: string;
  IconComponent: typeof Notification;
  formattedTime: string;
  href: string | null;
};

type Section = { label: string; data: NotificationRow[] };

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const NOTIFICATIONS_QUERY = `
  query Notifications($limit: Int!, $unreadOnly: Boolean!) {
    notifications(limit: $limit, unreadOnly: $unreadOnly) {
      id type actorId actorUsername postId commentId caseId
      followRequestId achievementId title description icon
      profilePicture unread time
    }
  }
`;

const MARK_READ_MUTATION = `
  mutation MarkNotificationRead($notificationId: ID!) {
    markNotificationRead(notificationId: $notificationId) { id unread }
  }
`;

const MARK_ALL_READ_MUTATION = `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

const ACCEPT_FOLLOW_REQUEST_MUTATION = `
  mutation AcceptFollowRequest($requestId: ID!) {
    acceptFollowRequest(requestId: $requestId)
  }
`;

const DECLINE_FOLLOW_REQUEST_MUTATION = `
  mutation DeclineFollowRequest($requestId: ID!) {
    declineFollowRequest(requestId: $requestId)
  }
`;

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------
const ICON_MAP: Record<
  string,
  { accent: string; bgColor: string; IconComponent: typeof Notification }
> = {
  MessageText1: { accent: "#E1761F", bgColor: "#FFE6CF", IconComponent: MessageText1 },
  MedalStar:   { accent: "#D4971A", bgColor: "#FEF3C7", IconComponent: MedalStar },
  Award:        { accent: "#D4971A", bgColor: "#FEF3C7", IconComponent: MedalStar },
  ArchiveMinus: { accent: "#5F6FFF", bgColor: "#E8EBFF", IconComponent: ArchiveMinus },
  Profile2User: { accent: "#1F9D75", bgColor: "#DBF5EC", IconComponent: Profile2User },
  DocumentText1:{ accent: "#D14D72", bgColor: "#FFE0E8", IconComponent: DocumentText1 },
  Setting4:     { accent: "#7C5CFA", bgColor: "#EEE8FF", IconComponent: Setting4 },
  Like1:        { accent: "#D14D72", bgColor: "#FFE0E8", IconComponent: Like1 },
  Heart:        { accent: "#D14D72", bgColor: "#FFE0E8", IconComponent: Heart },
  Notification: { accent: "#1D1D1D", bgColor: "#F3F4F6", IconComponent: Notification },
  Shield:       { accent: "#C0392B", bgColor: "#FEE2E2", IconComponent: Shield },
  Coin1:        { accent: "#D97706", bgColor: "#FEF3C7", IconComponent: Coin1 },
};
const DEFAULT_ICON = ICON_MAP.Notification;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getImageLabel = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "NT";

const getDescriptionPreview = (value?: string | null, max = 88) => {
  const s = value?.trim() ?? "";
  return s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`;
};

const getGroupLabel = (time: string) => {
  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) return "Earlier this week";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.floor(
    (todayStart.getTime() - itemStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return "Today";
  if (diffDays <= 7) return "Earlier this week";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatTime = (time: string) => {
  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) return time;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getMobileHref = ({
  type,
  actorUsername,
  postId,
  commentId,
}: {
  type?: string | null;
  actorUsername?: string | null;
  postId?: string | null;
  commentId?: string | null;
}): string | null => {
  // Post-based notifications → can open post page when it exists;
  // for now navigate to actor profile if available.
  if (postId?.trim() && actorUsername?.trim()) {
    return `/(tabs)/user/${encodeURIComponent(actorUsername.trim())}`;
  }
  if (actorUsername?.trim()) {
    return `/(tabs)/user/${encodeURIComponent(actorUsername.trim())}`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// NotificationCard
// ---------------------------------------------------------------------------
type CardProps = {
  item: NotificationRow;
  onPress: (item: NotificationRow) => void;
  onAccept: (followRequestId: string, id: string) => void;
  onDecline: (followRequestId: string, id: string) => void;
};

function NotificationCard({ item, onPress, onAccept, onDecline }: CardProps) {
  const { IconComponent, accent, bgColor } = item;

  return (
    <TouchableOpacity
      style={[styles.card, item.unread && styles.cardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={item.href ? 0.7 : 1}
    >
      <View style={styles.cardRow}>
        {/* Avatar + icon badge */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            {item.profilePicture ? (
              <Image source={{ uri: item.profilePicture }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarLabel, { color: accent }]}>
                {item.imageLabel}
              </Text>
            )}
          </View>
          <View style={[styles.iconBadge, { backgroundColor: accent }]}>
            <IconComponent size={12} color="#ffffff" variant="Bulk" />
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.timeRow}>
              {item.unread && <View style={styles.unreadDot} />}
              <Text style={styles.cardTime}>{item.formattedTime}</Text>
            </View>
          </View>
          <Text style={styles.cardDescription} numberOfLines={3}>
            {getDescriptionPreview(item.description)}
          </Text>

          {/* Follow request actions */}
          {item.type === "FOLLOW_REQUEST" && item.followRequestId && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => onAccept(item.followRequestId!, item.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={() => onDecline(item.followRequestId!, item.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// NotificationsScreen
// ---------------------------------------------------------------------------
export default function NotificationsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);
  const MIN_REFRESH_INTERVAL = 1500;

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------
  const fetchNotifications = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isAuthenticated) {
        setNotifications([]);
        if (!silent) setIsLoading(false);
        return;
      }
      const { token } = getAuth();
      if (!silent) setIsLoading(true);
      setError(null);
      try {
        const data = await gql<{ notifications: ApiNotification[] }>(
          NOTIFICATIONS_QUERY,
          { limit: 100, unreadOnly: false },
          token ?? undefined,
        );
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      } catch {
        setError("Failed to load notifications.");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // ------------------------------------------------------------------
  // Pull-to-refresh
  // ------------------------------------------------------------------
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications({ silent: true }).finally(() => setRefreshing(false));
  }, [fetchNotifications]);

  // ------------------------------------------------------------------
  // AppState — refresh when app comes to foreground
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      const elapsed = Date.now() - lastRefreshRef.current;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const delay = elapsed >= MIN_REFRESH_INTERVAL ? 0 : MIN_REFRESH_INTERVAL - elapsed;
      debounceRef.current = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        void fetchNotifications({ silent: true });
      }, delay);
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => {
      sub.remove();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchNotifications]);

  // ------------------------------------------------------------------
  // Mark as read
  // ------------------------------------------------------------------
  const markOneAsRead = useCallback(
    async (id: string) => {
      const { token } = getAuth();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
      );
      try {
        await gql(MARK_READ_MUTATION, { notificationId: id }, token ?? undefined);
      } catch {
        // revert
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, unread: true } : n)),
        );
      }
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    const { token } = getAuth();
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    try {
      await gql(MARK_ALL_READ_MUTATION, {}, token ?? undefined);
    } catch {
      setError("Failed to mark all as read.");
    }
  }, []);

  // ------------------------------------------------------------------
  // Notification tap
  // ------------------------------------------------------------------
  const handleNotificationPress = useCallback(
    async (item: NotificationRow) => {
      if (item.unread) await markOneAsRead(item.id);
      if (item.href) router.push(item.href as never);
    },
    [markOneAsRead, router],
  );

  // ------------------------------------------------------------------
  // Follow request actions
  // ------------------------------------------------------------------
  const handleFollowRequestAction = useCallback(
    async (followRequestId: string, notificationId: string, action: "accept" | "decline") => {
      const { token } = getAuth();
      const mutation = action === "accept"
        ? ACCEPT_FOLLOW_REQUEST_MUTATION
        : DECLINE_FOLLOW_REQUEST_MUTATION;
      try {
        await gql(mutation, { requestId: followRequestId }, token ?? undefined);
        setNotifications((prev) =>
          prev.filter((n) => n.id !== notificationId),
        );
      } catch {
        setError(`Failed to ${action} follow request.`);
      }
    },
    [],
  );

  // ------------------------------------------------------------------
  // Build sections
  // ------------------------------------------------------------------
  const sections: Section[] = useMemo(() => {
    const map = new Map<string, NotificationRow[]>();

    for (const n of notifications) {
      const style = ICON_MAP[n.icon ?? ""] ?? DEFAULT_ICON;
      const label = getGroupLabel(n.time);
      const rows = map.get(label) ?? [];
      rows.push({
        ...n,
        accent: style.accent,
        bgColor: style.bgColor,
        IconComponent: style.IconComponent,
        imageLabel: getImageLabel(n.title),
        formattedTime: formatTime(n.time),
        href: getMobileHref({
          type: n.type,
          actorUsername: n.actorUsername,
          postId: n.postId,
          commentId: n.commentId,
        }),
      });
      map.set(label, rows);
    }

    const orderedLabels = ["Today", "Earlier this week"];
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ai = orderedLabels.indexOf(a);
        const bi = orderedLabels.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([label, data]) => ({ label, data }));
  }, [notifications]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <ArrowLeft2 size={22} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={() => void markAllAsRead()}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.markAllBtn}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#E1761F" />
        </View>
      )}

      {/* Error */}
      {error && !isLoading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && sections.length === 0 && (
        <View style={styles.emptyState}>
          <Notification size={44} color="#E1CB9F" />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>
            {"You'll see likes, comments, and follows here."}
          </Text>
        </View>
      )}

      {!isLoading && sections.length > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <NotificationCard
                item={item}
                onPress={(n) => void handleNotificationPress(n)}
                onAccept={(rid, nid) =>
                  void handleFollowRequestAction(rid, nid, "accept")
                }
                onDecline={(rid, nid) =>
                  void handleFollowRequestAction(rid, nid, "decline")
                }
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#E1761F"
              colors={["#E1761F"]}
            />
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FAFAF8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FAFAF8",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111111",
    marginLeft: 12,
  },
  markAllBtn: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9CA3AF",
  },

  loadingWrap: { paddingVertical: 48, alignItems: "center" },
  errorBanner: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
  },
  errorText: { fontSize: 13, color: "#D12F2F", textAlign: "center" },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#111111" },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#9CA3AF",
  },

  cardWrap: { marginBottom: 10 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#111111",
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardUnread: {
    borderColor: "#F0DABB",
    backgroundColor: "#FFFBF5",
  },
  cardRow: { flexDirection: "row", gap: 12 },

  avatarWrap: { position: "relative", flexShrink: 0 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 52, height: 52, borderRadius: 16 },
  avatarLabel: { fontSize: 14, fontWeight: "700" },
  iconBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  cardContent: { flex: 1, minWidth: 0 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E1761F",
  },
  cardTime: { fontSize: 11, fontWeight: "500", color: "#9CA3AF" },
  cardDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
  },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  acceptBtn: {
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  acceptBtnText: { fontSize: 12, fontWeight: "600", color: "#ffffff" },
  declineBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  declineBtnText: { fontSize: 12, fontWeight: "500", color: "#111111" },
});
