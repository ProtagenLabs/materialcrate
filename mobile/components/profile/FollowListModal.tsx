import { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { ArrowLeft2, Verify } from "iconsax-react-nativejs";
import { apiUrl } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";
import { hasPaidSubscription } from "@/lib/subscription";

export type FollowListTab = "followers" | "following";

type FollowConnection = {
  id: string;
  username: string;
  displayName: string;
  profilePicture?: string | null;
  subscriptionPlan?: string | null;
  isCurrentUser: boolean;
  isFollowedByCurrentUser: boolean;
  isFollowingCurrentUser: boolean;
  followActionLabel: "Follow" | "Follow back" | "Unfollow" | null;
};

type Props = {
  isOpen: boolean;
  username?: string;
  subscriptionPlan?: string | null;
  initialTab: FollowListTab;
  onClose: () => void;
  onCountsChange?: (counts: {
    followersCount: number;
    followingCount: number;
  }) => void;
};

const norm = (v?: string | null) => String(v || "").trim().toLowerCase();

function actionLabel(
  u: Pick<
    FollowConnection,
    "isCurrentUser" | "isFollowedByCurrentUser" | "isFollowingCurrentUser"
  >
): FollowConnection["followActionLabel"] {
  if (u.isCurrentUser) return null;
  if (u.isFollowedByCurrentUser) return "Unfollow";
  if (u.isFollowingCurrentUser) return "Follow back";
  return "Follow";
}

export default function FollowListModal({
  isOpen,
  username,
  subscriptionPlan,
  initialTab,
  onClose,
  onCountsChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<FollowListTab>(initialTab);
  const [followers, setFollowers] = useState<FollowConnection[]>([]);
  const [following, setFollowing] = useState<FollowConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen || !username?.trim()) return;
    const controller = new AbortController();
    const { token } = getAuth();

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(
          apiUrl(`/api/users/${encodeURIComponent(username)}/connections`),
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Failed to load");
        if (!controller.signal.aborted) {
          const nextF = Array.isArray(body?.followers) ? body.followers : [];
          const nextFg = Array.isArray(body?.following) ? body.following : [];
          setFollowers(nextF);
          setFollowing(nextFg);
          onCountsChange?.({
            followersCount: nextF.length,
            followingCount: nextFg.length,
          });
        }
      } catch {
        if (!controller.signal.aborted) setError("Failed to load connections.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [isOpen, username, onCountsChange]);

  const activeList = useMemo(
    () => (activeTab === "followers" ? followers : following),
    [activeTab, followers, following]
  );

  const updateEntry = (
    target: string,
    fn: (e: FollowConnection) => FollowConnection
  ) => {
    setFollowers((c) =>
      c.map((e) => (norm(e.username) === target ? fn(e) : e))
    );
    setFollowing((c) =>
      c.map((e) => (norm(e.username) === target ? fn(e) : e))
    );
  };

  const handleFollowToggle = async (entry: FollowConnection) => {
    const target = norm(entry.username);
    if (!target || entry.isCurrentUser) return;
    const { token } = getAuth();
    const shouldUnfollow = entry.isFollowedByCurrentUser;
    setUpdating((c) => [...c, target]);
    updateEntry(target, (e) => {
      const next = { ...e, isFollowedByCurrentUser: !shouldUnfollow };
      return { ...next, followActionLabel: actionLabel(next) };
    });
    try {
      const res = await fetch(
        apiUrl(`/api/users/${encodeURIComponent(entry.username)}/follow`),
        {
          method: shouldUnfollow ? "DELETE" : "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error();
    } catch {
      updateEntry(target, (e) => {
        const next = { ...e, isFollowedByCurrentUser: shouldUnfollow };
        return { ...next, followActionLabel: actionLabel(next) };
      });
    } finally {
      setUpdating((c) => c.filter((u) => u !== target));
    }
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft2 size={22} color="#111111" variant="Linear" />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Text style={styles.headerName}>{username}</Text>
              {hasPaidSubscription(subscriptionPlan) && (
                <Verify size={18} color="#E1761F" variant="Bold" />
              )}
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabsRow}>
            {(["followers", "following"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={styles.tabBtn}
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
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.indicatorTrack}>
            <View
              style={[
                styles.indicator,
                activeTab === "following" && styles.indicatorRight,
              ]}
            />
          </View>
        </View>

        {/* Content */}
        {error ? (
          <Text style={styles.statusText}>{error}</Text>
        ) : isLoading ? (
          <ActivityIndicator color="#E1761F" style={styles.loader} />
        ) : activeList.length === 0 ? (
          <Text style={styles.statusText}>
            No {activeTab === "followers" ? "followers" : "following"} yet.
          </Text>
        ) : (
          <FlatList
            data={activeList}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: entry }) => {
              const isUpdating = updating.includes(norm(entry.username));
              return (
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    {entry.profilePicture ? (
                      <Image
                        source={{ uri: entry.profilePicture }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitial}>
                          {entry.displayName.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.rowMeta}>
                      <View style={styles.rowNameLine}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {entry.displayName}
                        </Text>
                        {hasPaidSubscription(entry.subscriptionPlan) && (
                          <Verify size={14} color="#E1761F" variant="Bold" />
                        )}
                      </View>
                      <Text style={styles.rowUsername}>@{entry.username}</Text>
                    </View>
                  </View>
                  {entry.followActionLabel ? (
                    <TouchableOpacity
                      style={[
                        styles.followBtn,
                        entry.followActionLabel === "Unfollow"
                          ? styles.followBtnMuted
                          : styles.followBtnPrimary,
                      ]}
                      onPress={() => void handleFollowToggle(entry)}
                      disabled={isUpdating}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.followBtnText,
                          entry.followActionLabel === "Unfollow" &&
                            styles.followBtnTextMuted,
                        ]}
                      >
                        {isUpdating ? "..." : entry.followActionLabel}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
  },
  backBtn: { padding: 4 },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerName: { fontSize: 16, fontWeight: "600", color: "#111111" },
  tabsRow: { flexDirection: "row" },
  tabBtn: { flex: 1, alignItems: "center", paddingBottom: 12 },
  tabLabel: { fontSize: 14, fontWeight: "500", color: "#9CA3AF" },
  tabLabelActive: { color: "#111111" },
  indicatorTrack: { height: 2, flexDirection: "row" },
  indicator: {
    width: "50%",
    height: 2,
    backgroundColor: "#111111",
    borderRadius: 1,
  },
  indicatorRight: { marginLeft: "50%" },
  loader: { marginTop: 40 },
  statusText: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: { width: 50, height: 50, borderRadius: 12 },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 18, fontWeight: "600", color: "#6B7280" },
  rowMeta: { flex: 1, minWidth: 0 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
    flexShrink: 1,
  },
  rowUsername: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 96,
    alignItems: "center",
  },
  followBtnPrimary: {
    backgroundColor: "#131212",
    borderColor: "#131212",
  },
  followBtnMuted: { backgroundColor: "#ffffff", borderColor: "#979797" },
  followBtnText: { fontSize: 13, fontWeight: "600", color: "#ffffff" },
  followBtnTextMuted: { color: "#111111" },
});
