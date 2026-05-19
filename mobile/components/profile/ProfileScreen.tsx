import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Share,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Flag,
  Link21,
  Slash,
  VolumeMute,
  UserRemove,
} from "iconsax-react-nativejs";
import { apiUrl, gql } from "@/lib/api";
import { getAuth, useAuth } from "@/lib/auth-store";
import Post, {
  type HomePost,
  type PostOptionsAnchor,
} from "@/components/home/Post";
import CommentDrawer from "@/components/home/CommentDrawer";
import PostOptionsSheet from "@/components/home/PostOptionsSheet";
import PdfViewerModal from "@/components/home/PdfViewerModal";
import ProfileHeader, { type ProfileTab } from "./ProfileHeader";
import AchievementCard, { type AchievementData } from "./AchievementCard";
import FollowListModal from "./FollowListModal";

type ProfileUser = {
  id: string;
  username: string;
  displayName: string;
  profilePicture?: string | null;
  profileBackground?: string | null;
  followersCount?: number | null;
  followingCount?: number | null;
  subscriptionPlan?: string | null;
  isBot?: boolean;
  institution?: string | null;
  institutionVisibility?: string | null;
  program?: string | null;
  programVisibility?: string | null;
  visibilityPublicProfile?: boolean;
  isFollowedByCurrentUser?: boolean;
  isFollowingCurrentUser?: boolean;
  hasPendingFollowRequest?: boolean;
  isBlockedByCurrentUser?: boolean;
  isMutedByCurrentUser?: boolean;
};

const ME_QUERY = `
  query Me {
    me {
      id username displayName profilePicture profileBackground
      followersCount followingCount subscriptionPlan isBot
      institution institutionVisibility program programVisibility
      visibilityPublicProfile
    }
  }
`;

const ME_BASIC_QUERY = `query Me { me { id username } }`;

const norm = (v?: string | null) => String(v || "").trim().toLowerCase();

function normFieldVisibility(
  v?: string | null
): "everyone" | "followers" | "only_you" {
  const n = norm(v);
  if (n === "followers" || n === "only_you") return n;
  return "everyone";
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function ProfileSkeleton() {
  return (
    <View style={skStyles.container}>
      <View style={skStyles.header}>
        <View style={skStyles.avatar} />
        <View style={skStyles.nameBlock}>
          <View style={skStyles.line1} />
          <View style={skStyles.line2} />
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={skStyles.card}>
          <View style={skStyles.cardThumb} />
          <View style={skStyles.cardMeta}>
            <View style={skStyles.metaLine1} />
            <View style={skStyles.metaLine2} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  header: { flexDirection: "row", gap: 12, marginBottom: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  nameBlock: { flex: 1, justifyContent: "center", gap: 8 },
  line1: {
    height: 14,
    width: "55%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  line2: {
    height: 11,
    width: "35%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
  },
  cardThumb: {
    width: 80,
    height: 100,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
  },
  cardMeta: { flex: 1, justifyContent: "flex-start", gap: 8, paddingTop: 4 },
  metaLine1: {
    height: 12,
    width: "70%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  metaLine2: {
    height: 10,
    width: "45%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
});

// ---------------------------------------------------------------------------
// Profile options menu (More button for non-owners)
// ---------------------------------------------------------------------------
type ProfileMenuProps = {
  visible: boolean;
  profile: ProfileUser | null;
  isFollower: boolean;
  isUpdatingFollow: boolean;
  isUpdatingBlock: boolean;
  isUpdatingMute: boolean;
  onClose: () => void;
  onUnfollow: () => void;
  onMuteToggle: () => void;
  onBlockToggle: () => void;
  onCopyLink: () => void;
  onReport: () => void;
};

function ProfileOptionsMenu({
  visible,
  profile,
  isFollower,
  isUpdatingFollow,
  isUpdatingBlock,
  isUpdatingMute,
  onClose,
  onUnfollow,
  onMuteToggle,
  onBlockToggle,
  onCopyLink,
  onReport,
}: ProfileMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={mStyles.backdrop} onPress={onClose}>
        <Pressable style={mStyles.sheet} onPress={() => {}}>
          <View style={mStyles.group}>
            {isFollower && (
              <TouchableOpacity
                style={[mStyles.row, mStyles.rowDivider]}
                onPress={onUnfollow}
                disabled={isUpdatingFollow}
                activeOpacity={0.6}
              >
                <UserRemove size={18} color="#111111" variant="Bold" />
                <Text style={mStyles.rowLabel}>
                  Unfollow @{profile?.username}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[mStyles.row, mStyles.rowDivider]}
              onPress={onMuteToggle}
              disabled={isUpdatingMute}
              activeOpacity={0.6}
            >
              <VolumeMute size={18} color="#111111" variant="Bold" />
              <Text style={mStyles.rowLabel}>
                {profile?.isMutedByCurrentUser ? "Unmute" : "Mute"} @
                {profile?.username}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mStyles.row, mStyles.rowDivider]}
              onPress={onCopyLink}
              activeOpacity={0.6}
            >
              <Link21 size={18} color="#111111" variant="Bold" />
              <Text style={mStyles.rowLabel}>Copy profile link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={mStyles.row}
              onPress={onBlockToggle}
              disabled={isUpdatingBlock}
              activeOpacity={0.6}
            >
              <Slash size={18} color="#D12F2F" variant="Bold" />
              <Text style={[mStyles.rowLabel, mStyles.rowLabelRed]}>
                {profile?.isBlockedByCurrentUser ? "Unblock" : "Block"} @
                {profile?.username}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[mStyles.group, mStyles.groupRed]}>
            <TouchableOpacity
              style={mStyles.row}
              onPress={onReport}
              activeOpacity={0.6}
            >
              <Flag size={18} color="#D12F2F" variant="Bold" />
              <Text style={[mStyles.rowLabel, mStyles.rowLabelRed]}>
                Report account
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FAFAFA",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 12,
    paddingBottom: 32,
    gap: 8,
  },
  group: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
  },
  groupRed: { backgroundColor: "#FFF1F1" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowLabel: { fontSize: 14, fontWeight: "500", color: "#111111", flex: 1 },
  rowLabelRed: { color: "#D12F2F" },
});

// ---------------------------------------------------------------------------
// Main ProfileScreen
// ---------------------------------------------------------------------------
type Props = { username?: string };

export default function ProfileScreen({ username }: Props) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const isPublicProfile = Boolean(username?.trim());

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [currentUserUsername, setCurrentUserUsername] = useState<string>("");
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState<ProfileTab>("posts");
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [isUpdatingMute, setIsUpdatingMute] = useState(false);
  const [selectedFollowList, setSelectedFollowList] = useState<
    "followers" | "following" | null
  >(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Post drawers
  const [commentPost, setCommentPost] = useState<HomePost | null>(null);
  const [optionsState, setOptionsState] = useState<{
    post: HomePost;
    anchor: PostOptionsAnchor;
  } | null>(null);
  const [pdfPost, setPdfPost] = useState<HomePost | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // Load current user identity (to compute isOwner on public profiles)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !isPublicProfile) return;
    const { token } = getAuth();
    gql<{ me: { id: string; username: string } }>(
      ME_BASIC_QUERY,
      {},
      token ?? undefined
    )
      .then((d) => {
        if (isMountedRef.current) setCurrentUserUsername(norm(d.me?.username));
      })
      .catch(() => {});
  }, [isAuthenticated, isPublicProfile]);

  // ------------------------------------------------------------------
  // Load own profile (own tab, no username)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isPublicProfile) return;
    if (!isAuthenticated) {
      setIsLoadingProfile(false);
      return;
    }

    const { token } = getAuth();
    setIsLoadingProfile(true);
    setError("");

    gql<{ me: ProfileUser }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => {
        if (!isMountedRef.current) return;
        setProfile(d.me ?? null);
        setCurrentUserUsername(norm(d.me?.username));
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setError(
          err instanceof Error ? err.message : "Failed to load profile"
        );
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoadingProfile(false);
      });
  }, [isAuthenticated, isPublicProfile]);

  // ------------------------------------------------------------------
  // Load public profile
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isPublicProfile || !username) return;
    const { token } = getAuth();
    const controller = new AbortController();
    setIsLoadingProfile(true);
    setError("");

    fetch(apiUrl(`/api/users/${encodeURIComponent(username)}`), {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((body) => {
        if (controller.signal.aborted) return;
        if (body?.error) throw new Error(body.error);
        setProfile(body?.user ?? null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to load profile"
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingProfile(false);
      });

    return () => controller.abort();
  }, [isPublicProfile, username]);

  // ------------------------------------------------------------------
  // Load posts once we have the profile username
  // ------------------------------------------------------------------
  useEffect(() => {
    const profileUsername = profile?.username?.trim();
    if (!profileUsername) {
      setPosts([]);
      setIsLoadingPosts(false);
      return;
    }

    const { token } = getAuth();
    const controller = new AbortController();
    setIsLoadingPosts(true);

    fetch(apiUrl(`/api/posts?author=${encodeURIComponent(profileUsername)}`), {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((body) => {
        if (controller.signal.aborted) return;
        setPosts(Array.isArray(body?.posts) ? body.posts : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPosts([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingPosts(false);
      });

    return () => controller.abort();
  }, [profile?.username]);

  // ------------------------------------------------------------------
  // Load achievements on tab change
  // ------------------------------------------------------------------
  useEffect(() => {
    const profileUsername = profile?.username?.trim();
    if (!profileUsername || selectedTab !== "achievements") return;

    const { token } = getAuth();
    const controller = new AbortController();
    setIsLoadingAchievements(true);

    fetch(
      apiUrl(
        `/api/users/${encodeURIComponent(profileUsername)}/achievements`
      ),
      {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    )
      .then((r) => r.json())
      .then((body) => {
        if (!controller.signal.aborted)
          setAchievements(
            Array.isArray(body?.achievements) ? body.achievements : []
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAchievements([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingAchievements(false);
      });

    return () => controller.abort();
  }, [profile?.username, selectedTab]);

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  const isOwner =
    !isPublicProfile ||
    (currentUserUsername !== "" &&
      currentUserUsername === norm(profile?.username));
  const displayName =
    profile?.displayName?.trim() || profile?.username?.trim() || "Unknown";
  const profileUsername = profile?.username
    ? `@${profile.username}`
    : "@unknown";
  const profilePictureUrl = profile?.profilePicture?.trim() || "";
  const followerCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const postsHeading = isOwner ? "My Posts" : "Posts";
  const isPrivateProfile = profile?.visibilityPublicProfile === false;
  const isFollower = Boolean(profile?.isFollowedByCurrentUser);
  const hasPendingRequest = Boolean(profile?.hasPendingFollowRequest);
  const canViewContent = isOwner || !isPrivateProfile || isFollower;
  const showInstitution =
    normFieldVisibility(profile?.institutionVisibility) !== "only_you";
  const showProgram =
    normFieldVisibility(profile?.programVisibility) !== "only_you";

  const followLabel: "Follow" | "Following" | "Follow back" | "Requested" =
    profile?.isFollowedByCurrentUser
      ? "Following"
      : hasPendingRequest
      ? "Requested"
      : profile?.isFollowingCurrentUser
      ? "Follow back"
      : "Follow";

  // ------------------------------------------------------------------
  // Follow toggle
  // ------------------------------------------------------------------
  const handleFollowToggle = useCallback(async () => {
    if (!profile?.username) return;
    if (!isAuthenticated) {
      router.push("/(auth)/login" as never);
      return;
    }
    if (isUpdatingFollow) return;

    const { token } = getAuth();
    const shouldUnfollow = Boolean(profile.isFollowedByCurrentUser);
    const shouldCancelRequest =
      Boolean(profile.hasPendingFollowRequest) && !shouldUnfollow;
    const prevFollowed = Boolean(profile.isFollowedByCurrentUser);
    const prevPending = Boolean(profile.hasPendingFollowRequest);
    const prevCount = profile.followersCount ?? 0;

    setIsUpdatingFollow(true);

    if (shouldCancelRequest) {
      setProfile((c) => (c ? { ...c, hasPendingFollowRequest: false } : c));
      try {
        await fetch(
          apiUrl(
            `/api/users/${encodeURIComponent(profile.username)}/follow?cancelRequest=true`
          ),
          {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
      } catch {
        setProfile((c) =>
          c ? { ...c, hasPendingFollowRequest: prevPending } : c
        );
      } finally {
        setIsUpdatingFollow(false);
      }
      return;
    }

    const isTargetPrivate = isPrivateProfile && !shouldUnfollow;
    setProfile((c) =>
      c
        ? {
            ...c,
            isFollowedByCurrentUser: isTargetPrivate ? false : !shouldUnfollow,
            hasPendingFollowRequest: isTargetPrivate ? true : prevPending,
            followersCount: isTargetPrivate
              ? prevCount
              : Math.max(0, prevCount + (shouldUnfollow ? -1 : 1)),
          }
        : c
    );

    try {
      const res = await fetch(
        apiUrl(`/api/users/${encodeURIComponent(profile.username)}/follow`),
        {
          method: shouldUnfollow ? "DELETE" : "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error);
      if (body?.pending) {
        setProfile((c) =>
          c
            ? {
                ...c,
                isFollowedByCurrentUser: false,
                hasPendingFollowRequest: true,
                followersCount: prevCount,
              }
            : c
        );
      }
    } catch {
      setProfile((c) =>
        c
          ? {
              ...c,
              isFollowedByCurrentUser: prevFollowed,
              hasPendingFollowRequest: prevPending,
              followersCount: prevCount,
            }
          : c
      );
    } finally {
      setIsUpdatingFollow(false);
    }
  }, [
    profile,
    isAuthenticated,
    isUpdatingFollow,
    isPrivateProfile,
    router,
  ]);

  // ------------------------------------------------------------------
  // Block toggle
  // ------------------------------------------------------------------
  const handleBlockToggle = async () => {
    if (!profile?.username) return;
    const { token } = getAuth();
    const shouldUnblock = Boolean(profile.isBlockedByCurrentUser);
    if (!shouldUnblock) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `Block @${profile.username}?`,
          "They won't be able to find your profile or posts.",
          [
            { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
            {
              text: "Block",
              onPress: () => resolve(true),
              style: "destructive",
            },
          ]
        );
      });
      if (!confirmed) return;
    }
    setIsUpdatingBlock(true);
    setIsProfileMenuOpen(false);
    setProfile((c) => (c ? { ...c, isBlockedByCurrentUser: !shouldUnblock } : c));
    try {
      const res = await fetch(
        apiUrl(`/api/users/${encodeURIComponent(profile.username)}/block`),
        {
          method: shouldUnblock ? "DELETE" : "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error();
    } catch {
      setProfile((c) =>
        c ? { ...c, isBlockedByCurrentUser: shouldUnblock } : c
      );
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  // ------------------------------------------------------------------
  // Mute toggle
  // ------------------------------------------------------------------
  const handleMuteToggle = async () => {
    if (!profile?.username) return;
    const { token } = getAuth();
    const shouldUnmute = Boolean(profile.isMutedByCurrentUser);
    setIsUpdatingMute(true);
    setIsProfileMenuOpen(false);
    setProfile((c) => (c ? { ...c, isMutedByCurrentUser: !shouldUnmute } : c));
    try {
      const res = await fetch(
        apiUrl(`/api/users/${encodeURIComponent(profile.username)}/mute`),
        {
          method: shouldUnmute ? "DELETE" : "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error();
    } catch {
      setProfile((c) =>
        c ? { ...c, isMutedByCurrentUser: shouldUnmute } : c
      );
    } finally {
      setIsUpdatingMute(false);
    }
  };

  // ------------------------------------------------------------------
  // Share / report
  // ------------------------------------------------------------------
  const handleShareProfile = () => {
    setIsProfileMenuOpen(false);
    void Share.share({
      url: `https://materialcrate.com/u/${profile?.username}`,
      message: profile?.displayName ?? "",
    });
  };

  const handleReportProfile = () => {
    setIsProfileMenuOpen(false);
    router.push(
      `/settings/support/guidelines?report=user&username=${encodeURIComponent(profile?.username ?? "")}` as never
    );
  };

  // ------------------------------------------------------------------
  // Message
  // ------------------------------------------------------------------
  const handleMessageClick = async () => {
    if (!profile?.id) return;
    if (!isAuthenticated) {
      router.push("/(auth)/login" as never);
      return;
    }
    const { token } = getAuth();
    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: profile.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.conversation?.id) {
        router.push(
          `/chat/${encodeURIComponent(body.conversation.id)}` as never
        );
      }
    } catch {
      // silently fail
    }
  };

  // ------------------------------------------------------------------
  // Post event handlers
  // ------------------------------------------------------------------
  const handlePostUpdated = useCallback((updated: HomePost) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    setOptionsState((prev) =>
      prev?.post.id === updated.id ? { ...prev, post: updated } : prev
    );
    setCommentPost((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setOptionsState((prev) =>
      prev?.post.id === postId ? null : prev
    );
    setCommentPost((prev) => (prev?.id === postId ? null : prev));
    setPdfPost((prev) => (prev?.id === postId ? null : prev));
  }, []);

  // ------------------------------------------------------------------
  // Follow counts update from FollowListModal
  // ------------------------------------------------------------------
  const handleFollowCountsChange = useCallback(
    ({
      followersCount,
      followingCount,
    }: {
      followersCount: number;
      followingCount: number;
    }) => {
      setProfile((c) => (c ? { ...c, followersCount, followingCount } : c));
    },
    []
  );

  // ------------------------------------------------------------------
  // Not logged in (own profile)
  // ------------------------------------------------------------------
  if (!isPublicProfile && !isAuthenticated && !isLoadingProfile) {
    return (
      <View style={styles.signInBox}>
        <Text style={styles.signInText}>
          Sign in to view your profile.
        </Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push("/(auth)/login" as never)}
          activeOpacity={0.85}
        >
          <Text style={styles.signInBtnText}>Go to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const renderHeader = () => (
    <ProfileHeader
      displayName={displayName}
      username={profileUsername}
      profilePictureUrl={profilePictureUrl}
      profileBackground={profile?.profileBackground}
      followers={followerCount}
      following={followingCount}
      subscriptionPlan={profile?.subscriptionPlan ?? "free"}
      isBot={profile?.isBot ?? false}
      institution={profile?.institution}
      institutionVisible={showInstitution}
      program={profile?.program}
      programVisible={showProgram}
      isOwner={isOwner}
      postsLabel={postsHeading}
      followLabel={followLabel}
      isFollowLoading={isUpdatingFollow}
      onFollowClick={() => void handleFollowToggle()}
      onMessageClick={() => void handleMessageClick()}
      onFollowListOpen={(tab) => setSelectedFollowList(tab)}
      onMoreClick={!isOwner && isAuthenticated ? () => setIsProfileMenuOpen(true) : undefined}
      selectedTab={selectedTab}
      onTabChange={setSelectedTab}
    />
  );

  // Content under the header depending on tab / state
  const renderContent = () => {
    if (isLoadingProfile) return null; // skeleton is shown outside FlatList
    if (!profile) {
      return (
        <Text style={styles.emptyText}>{error || "Profile not found."}</Text>
      );
    }
    if (!canViewContent) {
      return (
        <View style={styles.privateBox}>
          <View style={styles.lockIcon}>
            <Text style={styles.lockIconText}>🔒</Text>
          </View>
          <Text style={styles.privateTitle}>This account is private</Text>
          <Text style={styles.privateSubtitle}>
            {hasPendingRequest
              ? "Your follow request is pending."
              : "Follow this account to see their posts and achievements."}
          </Text>
        </View>
      );
    }
    if (selectedTab === "achievements") {
      if (isLoadingAchievements) {
        return (
          <ActivityIndicator
            color="#E1761F"
            style={{ marginTop: 40 }}
          />
        );
      }
      if (achievements.length === 0) {
        return (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🏆</Text>
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.emptySubtitle}>
              Achievements unlock as you use Material Crate.
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.achievementsGrid}>
          {achievements.map((a) => (
            <AchievementCard key={a.id} achievement={a} />
          ))}
        </View>
      );
    }

    // Posts tab
    if (isLoadingPosts && posts.length === 0) {
      return (
        <ActivityIndicator color="#E1761F" style={{ marginTop: 40 }} />
      );
    }
    if (posts.length === 0) {
      return <Text style={styles.emptyText}>No posts yet.</Text>;
    }
    return null; // posts are rendered by FlatList
  };

  const headerContent = (
    <>
      {renderHeader()}
      {renderContent()}
    </>
  );

  return (
    <View style={styles.flex}>
      {isLoadingProfile ? (
        <>
          <ProfileSkeleton />
        </>
      ) : (
        <FlatList
          data={
            canViewContent && selectedTab === "posts" && !isLoadingPosts
              ? posts
              : []
          }
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerContent}
          renderItem={({ item }) => (
            <Post
              post={item}
              onCommentClick={setCommentPost}
              onOptionsClick={(post, anchor) =>
                setOptionsState({ post, anchor })
              }
              onFileClick={setPdfPost}
            />
          )}
          ListFooterComponent={
            isLoadingPosts && posts.length > 0 ? (
              <ActivityIndicator
                color="#E1761F"
                style={{ paddingVertical: 24 }}
              />
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Drawers / modals */}
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
      <FollowListModal
        isOpen={selectedFollowList !== null}
        username={profile?.username}
        subscriptionPlan={profile?.subscriptionPlan}
        initialTab={selectedFollowList ?? "followers"}
        onClose={() => setSelectedFollowList(null)}
        onCountsChange={handleFollowCountsChange}
      />
      <ProfileOptionsMenu
        visible={isProfileMenuOpen}
        profile={profile}
        isFollower={isFollower}
        isUpdatingFollow={isUpdatingFollow}
        isUpdatingBlock={isUpdatingBlock}
        isUpdatingMute={isUpdatingMute}
        onClose={() => setIsProfileMenuOpen(false)}
        onUnfollow={() => {
          setIsProfileMenuOpen(false);
          void handleFollowToggle();
        }}
        onMuteToggle={() => void handleMuteToggle()}
        onBlockToggle={() => void handleBlockToggle()}
        onCopyLink={handleShareProfile}
        onReport={handleReportProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#ffffff" },
  listContent: { paddingBottom: 32 },

  // Sign-in box
  signInBox: {
    margin: 20,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  signInText: { fontSize: 14, color: "#6B7280" },
  signInBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#E1761F",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  signInBtnText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },

  // Private account
  privateBox: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  lockIconText: { fontSize: 24 },
  privateTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
    textAlign: "center",
  },
  privateSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },

  // Empty / error
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  emptyBox: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#111111" },
  emptySubtitle: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },

  // Achievements grid
  achievementsGrid: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
});
