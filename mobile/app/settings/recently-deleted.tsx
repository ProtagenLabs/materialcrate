import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2, Trash, RotateLeft, DocumentText, InfoCircle, Clock, Warning2 } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

const RECENTLY_DELETED_QUERY = `
  query RecentlyDeleted {
    recentlyDeletedPosts(limit: 50) {
      id
      title
      categories
      fileUrl
      deletedAt
    }
    recentlyDeletedRequests(limit: 50) {
      id
      title
      categories
      bounty
      deletedAt
    }
  }
`;

const RESTORE_POST_MUTATION = `
  mutation RestorePost($postId: ID!) {
    restorePost(postId: $postId)
  }
`;

const PERMANENTLY_DELETE_POST_MUTATION = `
  mutation PermanentlyDeletePost($postId: ID!) {
    permanentlyDeletePost(postId: $postId)
  }
`;

const RESTORE_REQUEST_MUTATION = `
  mutation RestoreDocumentRequest($id: ID!) {
    restoreDocumentRequest(id: $id) { id }
  }
`;

const PERMANENTLY_DELETE_REQUEST_MUTATION = `
  mutation PermanentlyDeleteDocumentRequest($id: ID!) {
    permanentlyDeleteDocumentRequest(id: $id)
  }
`;

type DeletedPost = {
  id: string;
  title: string;
  categories: string[];
  fileUrl: string;
  deletedAt: string;
};

type DeletedRequest = {
  id: string;
  title: string;
  categories: string[];
  bounty?: number | null;
  deletedAt: string;
};

function daysRemaining(deletedAt: string): number {
  const d = new Date(deletedAt);
  if (Number.isNaN(d.getTime())) return 30;
  const ms = Date.now() - d.getTime();
  const daysElapsed = Math.floor(ms / (1000 * 60 * 60 * 24));
  return 30 - daysElapsed;
}

function daysAgoText(deletedAt: string): string {
  const d = new Date(deletedAt);
  if (Number.isNaN(d.getTime())) return "";
  const ago = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  return `${ago} days ago`;
}

function UrgencyBadge({ remaining }: { remaining: number }) {
  const isUrgent = remaining <= 5;
  const isWarning = !isUrgent && remaining <= 10;
  return (
    <View style={[styles.badge, isUrgent && styles.badgeUrgent, isWarning && styles.badgeWarning]}>
      <Text style={[styles.badgeText, isUrgent && styles.badgeTextUrgent, isWarning && styles.badgeTextWarning]}>
        {remaining}d left
      </Text>
    </View>
  );
}

export default function RecentlyDeleted() {
  const router = useRouter();
  const [posts, setPosts] = useState<DeletedPost[]>([]);
  const [requests, setRequests] = useState<DeletedRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    const { token } = getAuth();
    setIsLoading(true);
    gql<{ recentlyDeletedPosts: DeletedPost[]; recentlyDeletedRequests: DeletedRequest[] }>(
      RECENTLY_DELETED_QUERY,
      {},
      token ?? undefined,
    )
      .then((d) => {
        setPosts(d.recentlyDeletedPosts ?? []);
        setRequests(d.recentlyDeletedRequests ?? []);
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestorePost = (id: string, title: string) => {
    Alert.alert("Restore post", `Restore "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          setPosts((prev) => prev.filter((p) => p.id !== id));
          const { token } = getAuth();
          try {
            await gql(RESTORE_POST_MUTATION, { postId: id }, token ?? undefined);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const handleDeletePost = (id: string) => {
    Alert.alert("Delete permanently", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setPosts((prev) => prev.filter((p) => p.id !== id));
          const { token } = getAuth();
          try {
            await gql(PERMANENTLY_DELETE_POST_MUTATION, { postId: id }, token ?? undefined);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const handleRestoreRequest = (id: string, title: string) => {
    Alert.alert("Restore request", `Restore "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          setRequests((prev) => prev.filter((r) => r.id !== id));
          const { token } = getAuth();
          try {
            await gql(RESTORE_REQUEST_MUTATION, { id }, token ?? undefined);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const handleDeleteRequest = (id: string) => {
    Alert.alert("Delete permanently", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setRequests((prev) => prev.filter((r) => r.id !== id));
          const { token } = getAuth();
          try {
            await gql(PERMANENTLY_DELETE_REQUEST_MUTATION, { id }, token ?? undefined);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const urgentCount = [
    ...posts.filter((p) => daysRemaining(p.deletedAt) <= 5),
    ...requests.filter((r) => daysRemaining(r.deletedAt) <= 5),
  ].length;

  const totalItems = posts.length + requests.length;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recently Deleted</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1761F" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.infoBox}>
            <InfoCircle size={18} color="#A95A13" variant="Bold" />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Posts are kept for 30 days</Text>
              <Text style={styles.infoDesc}>
                After 30 days, deleted posts and their files are permanently removed and cannot be
                recovered. Restore anything you want to keep.
              </Text>
            </View>
          </View>

          {urgentCount > 0 && (
            <View style={styles.urgentBanner}>
              <Warning2 size={14} color="#DC2626" variant="Bold" />
              <Text style={styles.urgentText}>
                {urgentCount === 1
                  ? "1 item is expiring in 5 days or less"
                  : `${urgentCount} items are expiring in 5 days or less`}
              </Text>
            </View>
          )}

          {totalItems === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Trash size={24} color="#A95A13" variant="Bold" />
              </View>
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptyDesc}>
                Posts and requests you delete will appear here for 30 days before being permanently
                removed.
              </Text>
            </View>
          ) : (
            <>
              {posts.length > 0 && (
                <>
                  <Text style={styles.groupLabel}>DOCUMENTS · {posts.length}</Text>
                  {posts.map((post) => {
                    const remaining = daysRemaining(post.deletedAt);
                    return (
                      <View key={post.id} style={styles.card}>
                        <View style={styles.cardIcon}>
                          <DocumentText size={22} color="#9CA3AF" variant="Bold" />
                        </View>
                        <View style={styles.cardContent}>
                          <View style={styles.cardRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle} numberOfLines={1}>{post.title}</Text>
                              <Text style={styles.cardSub}>
                                {post.categories[0]
                                  ? post.categories[0].charAt(0).toUpperCase() + post.categories[0].slice(1)
                                  : "Uncategorized"}
                              </Text>
                            </View>
                            <UrgencyBadge remaining={remaining} />
                          </View>
                          <View style={styles.cardActions}>
                            <Text style={styles.deletedText}>Deleted {daysAgoText(post.deletedAt)}</Text>
                            <View style={styles.actionButtons}>
                              <TouchableOpacity
                                style={styles.restoreBtn}
                                onPress={() => handleRestorePost(post.id, post.title)}
                                activeOpacity={0.7}
                              >
                                <RotateLeft size={12} color="#6B7280" variant="Linear" />
                                <Text style={styles.restoreBtnText}>Restore</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => handleDeletePost(post.id)}
                                activeOpacity={0.7}
                              >
                                <Trash size={12} color="#9CA3AF" variant="Linear" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {requests.length > 0 && (
                <>
                  <Text style={styles.groupLabel}>REQUESTS · {requests.length}</Text>
                  {requests.map((req) => {
                    const remaining = daysRemaining(req.deletedAt);
                    return (
                      <View key={req.id} style={styles.card}>
                        <View style={[styles.cardIcon, styles.cardIconBlue]}>
                          <DocumentText size={22} color="#1D4ED8" variant="Bold" />
                        </View>
                        <View style={styles.cardContent}>
                          <View style={styles.cardRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle} numberOfLines={1}>{req.title}</Text>
                              <Text style={styles.cardSub}>
                                {req.categories[0]
                                  ? req.categories[0].charAt(0).toUpperCase() + req.categories[0].slice(1)
                                  : "Request"}
                                {req.bounty ? ` · ${req.bounty.toLocaleString()} tokens` : ""}
                              </Text>
                            </View>
                            <UrgencyBadge remaining={remaining} />
                          </View>
                          <View style={styles.cardActions}>
                            <Text style={styles.deletedText}>Deleted {daysAgoText(req.deletedAt)}</Text>
                            <View style={styles.actionButtons}>
                              <TouchableOpacity
                                style={styles.restoreBtn}
                                onPress={() => handleRestoreRequest(req.id, req.title)}
                                activeOpacity={0.7}
                              >
                                <RotateLeft size={12} color="#6B7280" variant="Linear" />
                                <Text style={styles.restoreBtnText}>Restore</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => handleDeleteRequest(req.id)}
                                activeOpacity={0.7}
                              >
                                <Trash size={12} color="#9CA3AF" variant="Linear" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: { fontSize: 17, fontWeight: "600", color: "#111111" },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },

  infoBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F6EFE5",
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: "600", color: "#A95A13" },
  infoDesc: { fontSize: 12, color: "#A95A13", lineHeight: 18, marginTop: 2, opacity: 0.8 },

  urgentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  urgentText: { fontSize: 12, fontWeight: "500", color: "#DC2626" },

  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#9CA3AF",
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 2,
  },

  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    opacity: 0.8,
  },
  cardIconBlue: { backgroundColor: "#EFF6FF" },
  cardContent: { flex: 1, gap: 8 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: "500", color: "#111111" },
  cardSub: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deletedText: { fontSize: 11, color: "#9CA3AF" },
  actionButtons: { flexDirection: "row", gap: 6 },
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  restoreBtnText: { fontSize: 11, fontWeight: "500", color: "#6B7280" },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeUrgent: { backgroundColor: "#FEE2E2" },
  badgeWarning: { backgroundColor: "#FEF3C7" },
  badgeText: { fontSize: 11, fontWeight: "500", color: "#9CA3AF" },
  badgeTextUrgent: { color: "#DC2626" },
  badgeTextWarning: { color: "#D97706" },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#F6EFE5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#111111" },
  emptyDesc: { fontSize: 12, color: "#9CA3AF", textAlign: "center", lineHeight: 18 },
});
