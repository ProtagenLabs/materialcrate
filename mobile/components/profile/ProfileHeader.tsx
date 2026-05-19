import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  Animated,
  type LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Edit2,
  Setting2,
  Verify,
  Cpu,
  More,
} from "iconsax-react-nativejs";
import {
  hasPaidSubscription,
  normalizeSubscriptionPlan,
  getSubscriptionBadgeLabel,
} from "@/lib/subscription";

export type ProfileTab = "posts" | "achievements";

export type ProfileHeaderProps = {
  displayName: string;
  username: string;
  profilePictureUrl?: string;
  profileBackground?: string | null;
  followers?: number;
  following?: number;
  subscriptionPlan?: string | null;
  isBot?: boolean;
  institution?: string | null;
  institutionVisible?: boolean;
  program?: string | null;
  programVisible?: boolean;
  isOwner?: boolean;
  postsLabel?: string;
  followLabel?: "Follow" | "Following" | "Follow back" | "Requested";
  isFollowLoading?: boolean;
  onFollowClick?: () => void;
  onMessageClick?: () => void;
  onFollowListOpen?: (tab: "followers" | "following") => void;
  onMoreClick?: () => void;
  selectedTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
};

const DEFAULT_BG = "#FFF0E4";
const DEFAULT_BG_GRADIENT = "bg-linear-to-br from-[#E1761F] via-[#ffecdc] to-stone-200";

export default function ProfileHeader({
  displayName,
  username,
  profilePictureUrl,
  profileBackground,
  followers = 0,
  following = 0,
  subscriptionPlan = "free",
  isBot = false,
  institution,
  institutionVisible = true,
  program,
  programVisible = true,
  isOwner = false,
  postsLabel = "Posts",
  followLabel = "Follow",
  isFollowLoading = false,
  onFollowClick,
  onMessageClick,
  onFollowListOpen,
  onMoreClick,
  selectedTab,
  onTabChange,
}: ProfileHeaderProps) {
  const router = useRouter();
  const hasCustomBg =
    Boolean(profileBackground) &&
    profileBackground !== DEFAULT_BG_GRADIENT;

  const textColor = hasCustomBg ? "#ffffff" : "#333333";
  const secondaryColor = hasCustomBg ? "rgba(255,255,255,0.8)" : "#666666";
  const iconColor = hasCustomBg ? "#ffffff" : "#444444";
  const statLabelColor = hasCustomBg ? "rgba(255,255,255,0.78)" : "#666666";
  const iconBtnStyle = hasCustomBg ? styles.iconBtnDark : styles.iconBtnLight;
  const indicatorColor = hasCustomBg ? "#ffffff" : "#404040";
  const inactiveTabColor = hasCustomBg ? "rgba(255,255,255,0.55)" : "#787777";

  const normalizedPlan = normalizeSubscriptionPlan(subscriptionPlan);
  const hasPaidPlan = hasPaidSubscription(subscriptionPlan);
  const planLabel = getSubscriptionBadgeLabel(subscriptionPlan);

  const profileDetails: { label: string; value: string }[] = [];
  if (institutionVisible && institution?.trim())
    profileDetails.push({ label: "School", value: institution.trim() });
  if (programVisible && program?.trim())
    profileDetails.push({ label: "Program", value: program.trim() });

  // Tab indicator animation
  const [tabsWidth, setTabsWidth] = useState(0);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const handleTabsLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTabsWidth(w);
    indicatorAnim.setValue(selectedTab === "posts" ? 0 : w / 2);
  };

  useEffect(() => {
    if (tabsWidth === 0) return;
    Animated.timing(indicatorAnim, {
      toValue: selectedTab === "posts" ? 0 : tabsWidth / 2,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [selectedTab, tabsWidth]);

  const inner = (
    <View style={styles.inner}>
      {hasCustomBg && (
        <View
          style={styles.darkOverlay}
          pointerEvents="none"
        />
      )}

      {/* Top row: avatar / name / action buttons */}
      <View style={styles.topRow}>
        <View style={styles.avatarAndName}>
          {/* Avatar */}
          <View style={styles.avatar}>
            {profilePictureUrl ? (
              <Image
                source={{ uri: profilePictureUrl }}
                style={styles.avatarImg}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0)}
                </Text>
              </View>
            )}
          </View>

          {/* Name / username / badges */}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.displayName, { color: textColor }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {isBot ? (
                <Cpu size={18} color="#2196F3" variant="Bold" />
              ) : hasPaidPlan ? (
                <Verify size={18} color="#E1761F" variant="Bold" />
              ) : null}
            </View>
            <Text
              style={[styles.usernameText, { color: secondaryColor }]}
              numberOfLines={1}
            >
              {username}
            </Text>
            {profileDetails.length > 0 && (
              <View style={styles.detailsRow}>
                {profileDetails.map((d) => (
                  <View
                    key={d.label}
                    style={[
                      styles.detailBadge,
                      hasCustomBg
                        ? styles.detailBadgeDark
                        : styles.detailBadgeLight,
                    ]}
                  >
                    <Text
                      style={[styles.detailBadgeText, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {d.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Right side: owner (free plan) shows edit + settings */}
        {isOwner && normalizedPlan === "free" ? (
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={iconBtnStyle}
              onPress={() => router.push("/settings/profile" as never)}
              activeOpacity={0.8}
            >
              <Edit2 size={20} color={iconColor} />
            </TouchableOpacity>
            <TouchableOpacity
              style={iconBtnStyle}
              onPress={() => router.push("/settings" as never)}
              activeOpacity={0.8}
            >
              <Setting2 size={20} color={iconColor} />
            </TouchableOpacity>
          </View>
        ) : isOwner ? (
          // paid plan badge in top-right corner
          <TouchableOpacity style={styles.planBadge} activeOpacity={0.85}>
            <Text style={styles.planBadgeText}>{planLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats row + follow/message/more */}
      <View style={styles.statsRow}>
        <View style={styles.statsLeft}>
          <TouchableOpacity
            style={styles.statBtn}
            onPress={() => onFollowListOpen?.("followers")}
            activeOpacity={0.7}
          >
            <Text style={[styles.statLabel, { color: statLabelColor }]}>
              Followers
            </Text>
            <Text style={[styles.statValue, { color: textColor }]}>
              {followers}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBtn}
            onPress={() => onFollowListOpen?.("following")}
            activeOpacity={0.7}
          >
            <Text style={[styles.statLabel, { color: statLabelColor }]}>
              Following
            </Text>
            <Text style={[styles.statValue, { color: textColor }]}>
              {following}
            </Text>
          </TouchableOpacity>
        </View>

        {isOwner ? (
          normalizedPlan === "free" ? (
            // "View plans" upgrade nudge
            <TouchableOpacity
              style={styles.planBadge}
              onPress={() => router.push("/plans" as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.planBadgeText}>View plans</Text>
            </TouchableOpacity>
          ) : (
            // paid owner: edit + settings in stats row
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={iconBtnStyle}
                onPress={() => router.push("/settings/profile" as never)}
                activeOpacity={0.8}
              >
                <Edit2 size={20} color={iconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={iconBtnStyle}
                onPress={() => router.push("/settings" as never)}
                activeOpacity={0.8}
              >
                <Setting2 size={20} color={iconColor} />
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={styles.buttonGroup}>
            {followLabel === "Following" ? (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  hasCustomBg
                    ? styles.followBtnPrimaryDark
                    : styles.followBtnPrimary,
                ]}
                onPress={onMessageClick}
                activeOpacity={0.8}
              >
                <Text style={styles.followBtnText}>Message</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  followLabel === "Requested"
                    ? hasCustomBg
                      ? styles.followBtnMutedDark
                      : styles.followBtnMuted
                    : hasCustomBg
                    ? styles.followBtnPrimaryDark
                    : styles.followBtnPrimary,
                ]}
                onPress={onFollowClick}
                disabled={isFollowLoading}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.followBtnText,
                    followLabel === "Requested" && styles.followBtnTextMuted,
                  ]}
                >
                  {isFollowLoading ? "..." : followLabel}
                </Text>
              </TouchableOpacity>
            )}
            {onMoreClick && (
              <TouchableOpacity
                style={iconBtnStyle}
                onPress={onMoreClick}
                activeOpacity={0.8}
              >
                <More size={20} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabsContainer} onLayout={handleTabsLayout}>
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => onTabChange("posts")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color:
                    selectedTab === "posts" ? textColor : inactiveTabColor,
                  fontWeight: selectedTab === "posts" ? "600" : "500",
                },
              ]}
            >
              {postsLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => onTabChange("achievements")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color:
                    selectedTab === "achievements"
                      ? textColor
                      : inactiveTabColor,
                  fontWeight:
                    selectedTab === "achievements" ? "600" : "500",
                },
              ]}
            >
              Achievements
            </Text>
          </TouchableOpacity>
        </View>
        {/* Sliding indicator */}
        <View style={styles.indicatorTrack}>
          <Animated.View
            style={[
              styles.indicator,
              { backgroundColor: indicatorColor },
              { transform: [{ translateX: indicatorAnim }] },
            ]}
          />
        </View>
      </View>
    </View>
  );

  if (hasCustomBg) {
    return (
      <ImageBackground
        source={{ uri: profileBackground as string }}
        style={styles.container}
        resizeMode="cover"
      >
        {inner}
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: DEFAULT_BG }]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden" },
  inner: { paddingHorizontal: 16, paddingTop: 24 },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },

  // Top row
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  avatarAndName: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#D1D5DB",
    flexShrink: 0,
  },
  avatarImg: { width: 72, height: 72 },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 28, fontWeight: "700", color: "#6B7280" },
  nameBlock: { flex: 1, minWidth: 0, paddingTop: 2 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexWrap: "wrap",
  },
  displayName: { fontSize: 17, fontWeight: "600", flexShrink: 1 },
  usernameText: { fontSize: 13, marginTop: 2 },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 7,
  },
  detailBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 140,
  },
  detailBadgeLight: {
    borderColor: "#D1D5DB",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  detailBadgeDark: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  detailBadgeText: { fontSize: 11, fontWeight: "500" },
  buttonGroup: { flexDirection: "row", gap: 10, alignItems: "center" },

  // Icon buttons
  iconBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  iconBtnDark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  // Plan badge
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "#F7B500",
    borderWidth: 1,
    borderColor: "#F4B400",
  },
  planBadgeText: { fontSize: 13, fontWeight: "600", color: "#ffffff" },

  // Stats row
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  statsLeft: { flexDirection: "row", gap: 4 },
  statBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: "center",
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 20, fontWeight: "700" },

  // Follow buttons
  followBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  followBtnPrimary: { backgroundColor: "#131212", borderColor: "#131212" },
  followBtnPrimaryDark: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  followBtnMuted: { backgroundColor: "#ffffff", borderColor: "#979797" },
  followBtnMutedDark: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  followBtnText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
  followBtnTextMuted: { color: "#111111" },

  // Tabs
  tabsContainer: { marginTop: 22 },
  tabsRow: { flexDirection: "row" },
  tabBtn: { flex: 1, alignItems: "center", paddingBottom: 12 },
  tabLabel: { fontSize: 15 },
  indicatorTrack: { height: 3 },
  indicator: { width: "50%", height: 3, borderRadius: 1.5 },
});
