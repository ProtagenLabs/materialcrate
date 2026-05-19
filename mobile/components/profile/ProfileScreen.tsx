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
import { gql, apiUrl } from "@/lib/api";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GraphQL strings
// ---------------------------------------------------------------------------
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

// Mirrors exactly what web/app/api/users/[username]/route.ts does internally:
// fetch me + userByUsername + pendingFollowRequestId in one round-trip,
// then compute the boolean social-graph fields client-side.
const PUBLIC_PROFILE_QUERY = `
  query PublicProfile($username: String!) {
    me {
      id
      username
      blockedUserIds
      mutedUsers { username }
    }
    userByUsername(username: $username) {
      id username displayName profilePicture profileBackground
      visibilityPublicProfile followersCount followingCount
      subscriptionPlan isBot
      institution institutionVisibility program programVisibility
      followers { username }
      following { username }
    }
    pendingFollowRequestId(username: $username)
  }
`;

const PROFILE_POSTS_QUERY = `
  query ProfilePosts($authorUsername: String!) {
    posts(authorUsername: $authorUsername, limit: 50, offset: 0) {
      id fileUrl thumbnailUrl title categories description year pinned
      commentsDisabled likeCount commentCount viewerHasLiked viewCount createdAt
      author { id displayName username profilePicture subscriptionPlan isBot }
    }
  }
`;

const ACHIEVEMENTS_QUERY = `
  query UserAchievements($username: String!) {
    userAchievements(username: $username) {
      id title description icon rarity unlockedAt holderPercentage
    }
  }
`;

const M = {
  follow: `mutation FollowUser($username: String!) { followUser(username: $username) { followed pending } }`,
  unfollow: `mutation UnfollowUser($username: String!) { unfollowUser(username: $username) }`,
  cancelFollow: `mutation CancelFollowRequest($username: String!) { cancelFollowRequest(username: $username) }`,
  block: `mutation BlockUser($username: String!) { blockUser(username: $username) }`,
  unblock: `mutation UnblockUser($username: String!) { unblockUser(username: $username) }`,
  mute: `mutation MuteUser($username: String!) { muteUser(username: $username) }`,
  unmute: `mutation UnmuteUser($username: String!) { unmuteUser(username: $username) }`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
  avatar: { width: 72, height: 72, borderRadius: 16, backgroundColor: "#E5E7EB" },
  nameBlock: { flex: 1, justifyContent: "center", gap: 8 },
  line1: { height: 14, width: "55%", borderRadius: 8, backgroundColor: "#E5E7EB" },
  line2: { height: 11, width: "35%", borderRadius: 8, backgroundColor: "#E5E7EB" },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#F9FAFB", borderRadius: 16, padding: 12 },
  cardThumb: { width: 80, height: 100, borderRadius: 10, backgroundColor: "#E5E7EB" },
  cardMeta: { flex: 1, justifyContent: "flex-start", gap: 8, paddingTop: 4 },
  metaLine1: { height: 12, width: "70%", borderRadius: 8, backgroundColor: "#E5E7EB" },
  metaLine2: { height: 10, width: "45%", borderRadius: 8, backgroundColor: "#E5E7EB" },
});

// ---------------------------------------------------------------------------
// Profile options bottom sheet (More button for non-owners)
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
                <Text style={mStyles.rowLabel}>Unfollow @{profile?.username}</Text>
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
                {profile?.isMutedByCurrentUser ? "Unmute" : "Mute"} @{profile?.username}
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
                {profile?.isBlockedByCurrentUser ? "Unblock" : "Block"} @{profile?.username}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[mStyles.group, mStyles.groupRed]}>
            <TouchableOpacity style={mStyles.row} onPress={onReport} activeOpacity={0.6}>
              <Flag size={18} color="#D12F2F" variant="Bold" />
              <Text style={[mStyles.rowLabel, mStyles.rowLabelRed]}>Report account</Text>
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
  group: { backgroundColor: "#ffffff", borderRadius: 20, overflow: "hidden" },
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
  const [isOwner, setIsOwner] = useState(!isPublicProfile);
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

  const [commentPost, setCommentPost] = useState<HomePost | null>(null);
  const [optionsState, setOptionsState] = useState<{
    post: HomePost;
    anchor: PostOptionsAnchor;
  } | null>(null);
  const [pdfPost, setPdfPost] = useState<HomePost | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // ------------------------------------------------------------------
  // Load own profile via GraphQL `me`
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
        setIsOwner(true);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoadingProfile(false);
      });
  }, [isAuthenticated, isPublicProfile]);

  // ------------------------------------------------------------------
  // Load public profile — replicate web REST route's combined query
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isPublicProfile || !username) return;
    const { token } = getAuth();
    setIsLoadingProfile(true);
    setError("");

    gql<{
      me?: {
        id: string;
        username: string;
        blockedUserIds: string[];
        mutedUsers: { username: string }[];
      } | null;
      userByUsername?: {
        id: string;
        username: string;
        displayName: string;
        profilePicture?: string | null;
        profileBackground?: string | null;
        visibilityPublicProfile: boolean;
        followersCount: number;
        followingCount: number;
        subscriptionPlan: string;
        isBot: boolean;
        institution?: string | null;
        institutionVisibility: string;
        program?: string | null;
        programVisibility: string;
        followers: { username: string }[];
        following: { username: string }[];
      } | null;
      pendingFollowRequestId?: string | null;
    }>(PUBLIC_PROFILE_QUERY, { username }, token ?? undefined)
      .then((d) => {
        if (!isMountedRef.current) return;
        const u = d.userByUsername;
        if (!u) { setProfile(null); return; }

        const viewerUsername = norm(d.me?.username);
        const followers = u.followers ?? [];
        const following = u.following ?? [];

        const isFollowedByCurrentUser = viewerUsername
          ? followers.some((f) => norm(f.username) === viewerUsername)
          : false;
        const isFollowingCurrentUser = viewerUsername
          ? following.some((f) => norm(f.username) === viewerUsername)
          : false;
        const isBlockedByCurrentUser = viewerUsername
          ? (d.me?.blockedUserIds ?? []).includes(u.id)
          : false;
        const isMutedByCurrentUser = viewerUsername
          ? (d.me?.mutedUsers ?? []).some(
              (mu) => norm(mu.username) === norm(u.username)
            )
          : false;
        const hasPendingFollowRequest = Boolean(d.pendingFollowRequestId);

        const currentUsername = norm(d.me?.username);
        setIsOwner(currentUsername !== "" && currentUsername === norm(u.username));

        setProfile({
          ...u,
          isFollowedByCurrentUser,
          isFollowingCurrentUser,
          hasPendingFollowRequest,
          isBlockedByCurrentUser,
          isMutedByCurrentUser,
        });
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : "Profile not found");
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoadingProfile(false);
      });
  }, [isPublicProfile, username]);

  // ------------------------------------------------------------------
  // Load posts via GraphQL `posts(authorUsername: ...)`
  // ------------------------------------------------------------------
  useEffect(() => {
    const profileUsername = profile?.username?.trim();
    if (!profileUsername) { setPosts([]); setIsLoadingPosts(false); return; }

    const { token } = getAuth();
    let cancelled = false;
    setIsLoadingPosts(true);

    gql<{ posts: HomePost[] }>(
      PROFILE_POSTS_QUERY,
      { authorUsername: profileUsername },
      token ?? undefined
    )
      .then((d) => {
        if (cancelled) return;
        setPosts(Array.isArray(d.posts) ? d.posts : []);
      })
      .catch(() => { if (!cancelled) setPosts([]); })
      .finally(() => { if (!cancelled) setIsLoadingPosts(false); });

    return () => { cancelled = true; };
  }, [profile?.username]);

  // ------------------------------------------------------------------
  // Load achievements — try GraphQL first, fall back to REST
  // ------------------------------------------------------------------
  useEffect(() => {
    const profileUsername = profile?.username?.trim();
    if (!profileUsername || selectedTab !== "achievements") return;

    const { token } = getAuth();
    let cancelled = false;
    setIsLoadingAchievements(true);

    gql<{ userAchievements: AchievementData[] }>(
      ACHIEVEMENTS_QUERY,
      { username: profileUsername },
      token ?? undefined
    )
      .then((d) => {
        if (cancelled) return;
        setAchievements(Array.isArray(d.userAchievements) ? d.userAchievements : []);
      })
      .catch(() => {
        // Fallback to REST if GraphQL query doesn't exist yet
        if (cancelled) return;
        fetch(apiUrl(`/api/users/${encodeURIComponent(profileUsername)}/achievements`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => r.json())
          .then((body) => {
            if (!cancelled)
              setAchievements(Array.isArray(body?.achievements) ? body.achievements : []);
          })
          .catch(() => { if (!cancelled) setAchievements([]); })
          .finally(() => { if (!cancelled) setIsLoadingAchievements(false); });
        return; // final() already handled in REST branch
      })
      .finally(() => { if (!cancelled) setIsLoadingAchievements(false); });

    return () => { cancelled = true; };
  }, [profile?.username, selectedTab]);

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  const displayName =
    profile?.displayName?.trim() || profile?.username?.trim() || "Unknown";
  const profileUsername = profile?.username ? `@${profile.username}` : "@unknown";
  const profilePictureUrl = profile?.profilePicture?.trim() || "";
  const followerCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const postsHeading = isOwner ? "My Posts" : "Posts";
  const isPrivateProfile = profile?.visibilityPublicProfile === false;
  const isFollower = Boolean(profile?.isFollowedByCurrentUser);
  const hasPendingRequest = Boolean(profile?.hasPendingFollowRequest);
  const canViewContent = isOwner || !isPrivateProfile || isFollower;
  const showInstitution = normFieldVisibility(profile?.institutionVisibility) !== "only_you";
  const showProgram = normFieldVisibility(profile?.programVisibility) !== "only_you";

  const followLabel: "Follow" | "Following" | "Follow back" | "Requested" =
    profile?.isFollowedByCurrentUser
      ? "Following"
      : hasPendingRequest
      ? "Requested"
      : profile?.isFollowingCurrentUser
      ? "Follow back"
      : "Follow";

  // ------------------------------------------------------------------
  // Follow toggle — GraphQL mutations (not REST)
  // ------------------------------------------------------------------
  const handleFollowToggle = useCallback(async () => {
    if (!profile?.username) return;
    if (!isAuthenticated) { router.push("/(auth)/login" as never); return; }
    if (isUpdatingFollow) return;

    const { token } = getAuth();
    const shouldUnfollow = Boolean(profile.isFollowedByCurrentUser);
    const shouldCancelRequest = Boolean(profile.hasPendingFollowRequest) && !shouldUnfollow;
    const prevFollowed = Boolean(profile.isFollowedByCurrentUser);
    const prevPending = Boolean(profile.hasPendingFollowRequest);
    const prevCount = profile.followersCount ?? 0;

    setIsUpdatingFollow(true);

    if (shouldCancelRequest) {
      setProfile((c) => (c ? { ...c, hasPendingFollowRequest: false } : c));
      try {
        await gql(M.cancelFollow, { username: profile.username }, token ?? undefined);
      } catch {
        setProfile((c) => (c ? { ...c, hasPendingFollowRequest: prevPending } : c));
      } finally {
        setIsUpdatingFollow(false);
      }
      return;
    }

    if (shouldUnfollow) {
      setProfile((c) =>
        c ? { ...c, isFollowedByCurrentUser: false, followersCount: Math.max(0, prevCount - 1) } : c
      );
      try {
        await gql(M.unfollow, { username: profile.username }, token ?? undefined);
      } catch {
        setProfile((c) =>
          c ? { ...c, isFollowedByCurrentUser: prevFollowed, followersCount: prevCount } : c
        );
      } finally {
        setIsUpdatingFollow(false);
      }
      return;
    }

    // Follow — optimistic pending for private profiles
    const isTargetPrivate = isPrivateProfile;
    setProfile((c) =>
      c
        ? {
            ...c,
            isFollowedByCurrentUser: isTargetPrivate ? false : true,
            hasPendingFollowRequest: isTargetPrivate ? true : prevPending,
            followersCount: isTargetPrivate ? prevCount : prevCount + 1,
          }
        : c
    );

    try {
      const data = await gql<{ followUser: { followed: boolean; pending: boolean } }>(
        M.follow,
        { username: profile.username },
        token ?? undefined
      );
      if (data.followUser.pending) {
        setProfile((c) =>
          c ? { ...c, isFollowedByCurrentUser: false, hasPendingFollowRequest: true, followersCount: prevCount } : c
        );
      } else {
        setProfile((c) =>
          c ? { ...c, isFollowedByCurrentUser: true, hasPendingFollowRequest: false, followersCount: prevCount + 1 } : c
        );
      }
    } catch {
      setProfile((c) =>
        c ? { ...c, isFollowedByCurrentUser: prevFollowed, hasPendingFollowRequest: prevPending, followersCount: prevCount } : c
      );
    } finally {
      setIsUpdatingFollow(false);
    }
  }, [profile, isAuthenticated, isUpdatingFollow, isPrivateProfile, router]);

  // ------------------------------------------------------------------
  // Block toggle — GraphQL mutations
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
            { text: "Block", onPress: () => resolve(true), style: "destructive" },
          ]
        );
      });
      if (!confirmed) return;
    }
    setIsUpdatingBlock(true);
    setIsProfileMenuOpen(false);
    setProfile((c) => (c ? { ...c, isBlockedByCurrentUser: !shouldUnblock } : c));
    try {
      await gql(
        shouldUnblock ? M.unblock : M.block,
        { username: profile.username },
        token ?? undefined
      );
    } catch {
      setProfile((c) => (c ? { ...c, isBlockedByCurrentUser: shouldUnblock } : c));
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  // ------------------------------------------------------------------
  // Mute toggle — GraphQL mutations
  // ------------------------------------------------------------------
  const handleMuteToggle = async () => {
    if (!profile?.username) return;
    const { token } = getAuth();
    const shouldUnmute = Boolean(profile.isMutedByCurrentUser);
    setIsUpdatingMute(true);
    setIsProfileMenuOpen(false);
    setProfile((c) => (c ? { ...c, isMutedByCurrentUser: !shouldUnmute } : c));
    try {
      await gql(
        shouldUnmute ? M.unmute : M.mute,
        { username: profile.username },
        token ?? undefined
      );
    } catch {
      setProfile((c) => (c ? { ...c, isMutedByCurrentUser: shouldUnmute } : c));
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
    if (!isAuthenticated) { router.push("/(auth)/login" as never); return; }
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
        router.push(`/chat/${encodeURIComponent(body.conversation.id)}` as never);
      }
    } catch {
      // silently fail
    }
  };

  // ------------------------------------------------------------------
  // Post event handlers
  // ------------------------------------------------------------------
  const handlePostUpdated = useCallback((updated: HomePost) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    setOptionsState((prev) =>
      prev?.post.id === updated.id ? { ...prev, post: updated } : prev
    );
    setCommentPost((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setOptionsState((prev) => (prev?.post.id === postId ? null : prev));
    setCommentPost((prev) => (prev?.id === postId ? null : prev));
    setPdfPost((prev) => (prev?.id === postId ? null : prev));
  }, []);

  const handleFollowCountsChange = useCallback(
    ({ followersCount, followingCount }: { followersCount: number; followingCount: number }) => {
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
        <Text style={styles.signInText}>Sign in to view your profile.</Text>
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

  const renderContent = () => {
    if (isLoadingProfile) return null;
    if (!profile) {
      return <Text style={styles.emptyText}>{error || "Profile not found."}</Text>;
    }
    if (!canViewContent) {
      return (
        <View style={styles.privateBox}>
          <View style={styles.lockIcon}><Text style={styles.lockIconText}>🔒</Text></View>
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
      if (isLoadingAchievements) return <ActivityIndicator color="#E1761F" style={{ marginTop: 40 }} />;
      if (achievements.length === 0) {
        return (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🏆</Text>
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.emptySubtitle}>Achievements unlock as you use Material Crate.</Text>
          </View>
        );
      }
      return (
        <View style={styles.achievementsGrid}>
          {achievements.map((a) => <AchievementCard key={a.id} achievement={a} />)}
        </View>
      );
    }
    if (isLoadingPosts && posts.length === 0) {
      return <ActivityIndicator color="#E1761F" style={{ marginTop: 40 }} />;
    }
    if (posts.length === 0) {
      return <Text style={styles.emptyText}>No posts yet.</Text>;
    }
    return null;
  };

  return (
    <View style={styles.flex}>
      {isLoadingProfile ? (
        <ProfileSkeleton />
      ) : (
        <FlatList
          data={canViewContent && selectedTab === "posts" && !isLoadingPosts ? posts : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              {renderHeader()}
              {renderContent()}
            </>
          }
          renderItem={({ item }) => (
            <Post
              post={item}
              onCommentClick={setCommentPost}
              onOptionsClick={(post, anchor) => setOptionsState({ post, anchor })}
              onFileClick={setPdfPost}
            />
          )}
          ListFooterComponent={
            isLoadingPosts && posts.length > 0 ? (
              <ActivityIndicator color="#E1761F" style={{ paddingVertical: 24 }} />
            ) : null
          }
          contentContainerStyle={styles.listContent}
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
        onUnfollow={() => { setIsProfileMenuOpen(false); void handleFollowToggle(); }}
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
  privateBox: { paddingVertical: 48, paddingHorizontal: 24, alignItems: "center" },
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
  privateTitle: { fontSize: 15, fontWeight: "600", color: "#111111", textAlign: "center" },
  privateSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", paddingHorizontal: 20, paddingTop: 20 },
  emptyBox: { paddingVertical: 48, paddingHorizontal: 24, alignItems: "center" },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#111111" },
  emptySubtitle: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 4 },
  achievementsGrid: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
});
