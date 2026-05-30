"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/auth-client";
import { useSystemPopup } from "@/app/components/SystemPopup";
import { Flag, Link21, Slash, VolumeMute, UserRemove } from "iconsax-reactjs";
import { subscribeToFollowActivity } from "@/app/lib/post-activity-realtime";
import Acheivement, {
  type AchievementData,
} from "@/app/components/profile/Acheivement";
import Header, { type ProfileTab } from "@/app/components/profile/Header";
import Post, {
  type HomePost,
  type PostOptionsAnchor,
} from "@/app/components/home/Post";
import CommentDrawer from "@/app/components/home/CommentDrawer";
import OptionsDrawer from "@/app/components/home/PostOptions";
import DocumentViewer from "@/app/components/home/DocumentViewer";
import FollowersnFollowingList from "./FollowersnFollowingList";
import RightSidebar from "../RightSidebar";
import Alert from "../Alert";

type ProfileFieldVisibility = "everyone" | "followers" | "only_you";

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

type ProfilePageProps = {
  username?: string;
};

const normalizeUsername = (value?: string | null) =>
  value?.trim().toLowerCase() || "";

const normalizeProfileFieldVisibility = (
  value?: string | null,
): ProfileFieldVisibility => {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "followers" || normalized === "only_you") {
    return normalized;
  }

  return "everyone";
};

function ProfileSkeleton() {
  const sk = "skeleton";
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full overflow-hidden px-4 pt-8 pb-0 sm:px-6 sm:pt-10 lg:rounded-[28px] lg:shadow-[0_14px_34px_rgba(0,0,0,0.06)]"
        style={{ background: "var(--skeleton-base)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`${sk} h-18 w-18 shrink-0 rounded-2xl`} />
            <div className="space-y-2">
              <div className={`${sk} h-4 w-32 rounded-full`} />
              <div className={`${sk} h-3 w-24 rounded-full`} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className={`${sk} h-10 w-10 rounded-full`} />
            <div className={`${sk} h-10 w-10 rounded-full`} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`${sk} h-10 w-16 rounded-xl`} />
            <div className={`${sk} h-10 w-16 rounded-xl`} />
          </div>
          <div className={`${sk} h-9 w-24 rounded-full`} />
        </div>
        <div className="mt-8 -mx-4 grid grid-cols-2 sm:-mx-6">
          <div className={`${sk} h-10 rounded-none`} />
          <div className={`${sk} h-10 rounded-none opacity-60`} />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-full px-3">
          <article className="lg:rounded-xl lg:border lg:border-edge lg:bg-surface lg:shadow-sm">
            <div className="flex items-start justify-between px-2 pt-2">
              <div className="flex items-center gap-3">
                <div className={`${sk} h-11 w-11 shrink-0 rounded-full`} />
                <div className="space-y-2">
                  <div className={`${sk} h-3.5 w-32 rounded-full`} />
                  <div className={`${sk} h-2.5 w-24 rounded-full`} />
                </div>
              </div>
              <div className={`${sk} h-8 w-8 rounded-full`} />
            </div>
            <div className={`${sk} mx-2 mt-3 h-36 rounded-xl`} />
            <div className="px-2 pt-3 space-y-2">
              <div className={`${sk} h-3.5 w-3/4 rounded-full`} />
              <div className="flex gap-2">
                <div className={`${sk} h-5 w-16 rounded-full`} />
                <div className={`${sk} h-5 w-20 rounded-full`} />
              </div>
            </div>
            <div className="flex items-center gap-4 px-2 py-3">
              <div className={`${sk} h-5 w-12 rounded-full`} />
              <div className={`${sk} h-5 w-12 rounded-full`} />
              <div className={`${sk} h-5 w-12 rounded-full`} />
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage({ username }: ProfilePageProps) {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const routeUsername = username?.trim() || "";
  const isPublicProfile = routeUsername.length > 0;
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [error, setError] = useState<string>("");
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(false);
  const [isPostOptionsDrawerOpen, setIsPostOptionsDrawerOpen] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(
    null,
  );
  const [activeCommentPost, setActiveCommentPost] = useState<HomePost | null>(
    null,
  );
  const [activeOptionsPost, setActiveOptionsPost] = useState<HomePost | null>(
    null,
  );
  const [activeOptionsAnchor, setActiveOptionsAnchor] =
    useState<PostOptionsAnchor | null>(null);
  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ProfileTab>("posts");
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [selectedFollowList, setSelectedFollowList] = useState<
    "followers" | "following" | null
  >(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [isUpdatingMute, setIsUpdatingMute] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const popup = useSystemPopup();

  const handleFollowCountsChange = useCallback(
    ({
      followersCount,
      followingCount,
    }: {
      followersCount: number;
      followingCount: number;
    }) => {
      setProfile((current) =>
        current
          ? {
              ...current,
              followersCount,
              followingCount,
            }
          : current,
      );
    },
    [],
  );

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!(e.target instanceof Node)) return;
      if (profileMenuRef.current?.contains(e.target)) return;
      setIsProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isProfileMenuOpen]);

  const handleBlockToggle = async () => {
    if (!profile?.username) return;
    const shouldUnblock = Boolean(profile.isBlockedByCurrentUser);
    if (!shouldUnblock) {
      const confirmed = await popup.confirm({
        title: `Block @${profile.username}?`,
        message: "They won't be able to find your profile or posts.",
        confirmLabel: "Block",
        cancelLabel: "Cancel",
        isDestructive: true,
      });
      if (!confirmed) return;
    }
    setIsUpdatingBlock(true);
    setIsProfileMenuOpen(false);
    setProfile((c) =>
      c ? { ...c, isBlockedByCurrentUser: !shouldUnblock } : c,
    );
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(profile.username)}/block`,
        {
          method: shouldUnblock ? "DELETE" : "POST",
        },
      );
      if (!res.ok) throw new Error();
    } catch {
      setProfile((c) =>
        c ? { ...c, isBlockedByCurrentUser: shouldUnblock } : c,
      );
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  const handleMuteToggle = async () => {
    if (!profile?.username) return;
    const shouldUnmute = Boolean(profile.isMutedByCurrentUser);
    setIsUpdatingMute(true);
    setIsProfileMenuOpen(false);
    setProfile((c) => (c ? { ...c, isMutedByCurrentUser: !shouldUnmute } : c));
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(profile.username)}/mute`,
        {
          method: shouldUnmute ? "DELETE" : "POST",
        },
      );
      if (!res.ok) throw new Error();
    } catch {
      setProfile((c) => (c ? { ...c, isMutedByCurrentUser: shouldUnmute } : c));
    } finally {
      setIsUpdatingMute(false);
    }
  };

  const handleShareProfile = () => {
    const url = `${window.location.origin}/u/${profile?.username}`;
    if (navigator.share) {
      void navigator.share({ title: profile?.displayName ?? "", url });
    } else {
      void navigator.clipboard.writeText(url);
    }
    setIsProfileMenuOpen(false);
  };

  const handleReportProfile = () => {
    setIsProfileMenuOpen(false);
    router.push(
      `/settings/support/guidelines?report=user&username=${encodeURIComponent(profile?.username ?? "")}`,
    );
  };

  const handleMessageClick = async () => {
    if (!profile?.id) return;
    if (!user) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id }),
      });
      const body = await res.json().catch(() => ({}));
      const conversationId = body?.conversation?.id;
      if (conversationId) {
        router.push(`/chat/${encodeURIComponent(conversationId)}`);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async () => {
      setError("");
      setIsLoadingProfile(true);

      try {
        if (!isPublicProfile) {
          if (isLoadingAuth) {
            return;
          }

          if (!user) {
            if (!isCancelled) {
              setProfile(null);
              setIsLoadingProfile(false);
            }
            return;
          }

          if (!isCancelled) {
            setProfile(user as ProfileUser);
            setIsLoadingProfile(false);
          }
          return;
        }

        const response = await fetch(
          `/api/users/${encodeURIComponent(routeUsername)}`,
          {
            cache: "no-store",
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to load profile");
        }

        if (!isCancelled) {
          setProfile(body?.user ?? null);
          setIsLoadingProfile(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setProfile(null);
          setError(
            err instanceof Error ? err.message : "Failed to load profile",
          );
          setIsLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [isLoadingAuth, isPublicProfile, routeUsername, user]);

  useEffect(() => {
    const profileUsername = profile?.username?.trim();

    if (!profileUsername) {
      setPosts([]);
      setIsLoadingPosts(false);
      return;
    }

    const controller = new AbortController();

    const loadPosts = async () => {
      setIsLoadingPosts(true);

      try {
        const response = await fetch(
          `/api/posts?author=${encodeURIComponent(profileUsername)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to load posts");
        }

        if (!controller.signal.aborted) {
          setPosts(Array.isArray(body?.posts) ? body.posts : []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setPosts([]);
          setError("Failed to load posts");
          console.error("Failed to load posts: ", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPosts(false);
        }
      }
    };

    void loadPosts();

    return () => controller.abort();
  }, [profile?.username]);

  useEffect(() => {
    const profileUsername = profile?.username?.trim();
    if (!profileUsername || selectedTab !== "achievements") return;

    const controller = new AbortController();

    const loadAchievements = async () => {
      setIsLoadingAchievements(true);
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(profileUsername)}/achievements`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json().catch(() => ({}));
        if (!controller.signal.aborted) {
          setAchievements(
            Array.isArray(body?.achievements) ? body.achievements : [],
          );
        }
      } catch {
        if (!controller.signal.aborted) setAchievements([]);
      } finally {
        if (!controller.signal.aborted) setIsLoadingAchievements(false);
      }
    };

    void loadAchievements();
    return () => controller.abort();
  }, [profile?.username, selectedTab]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isDisposed = false;

    void subscribeToFollowActivity(profile.id, (event) => {
      setProfile((current) => {
        if (!current || current.id !== event.userId) {
          return current;
        }

        const nextProfile: ProfileUser = {
          ...current,
          followersCount:
            typeof event.followersCount === "number"
              ? event.followersCount
              : current.followersCount,
          followingCount:
            typeof event.followingCount === "number"
              ? event.followingCount
              : current.followingCount,
        };

        if (user?.id && event.actorId === user.id) {
          if (event.reason === "unfollowed") {
            nextProfile.isFollowedByCurrentUser = false;
            nextProfile.hasPendingFollowRequest = false;
          } else {
            nextProfile.isFollowedByCurrentUser = true;
            nextProfile.hasPendingFollowRequest = false;
          }
        }

        return nextProfile;
      });
    }).then((cleanup) => {
      if (isDisposed) {
        cleanup();
        return;
      }

      unsubscribe = cleanup;
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [profile?.id, user?.id]);

  const isOwner =
    normalizeUsername(user?.username as string) !== "" &&
    normalizeUsername(user?.username as string) ===
      normalizeUsername(profile?.username as string);
  const displayName =
    profile?.displayName?.trim() || profile?.username?.trim() || "Unknown User";
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
    normalizeProfileFieldVisibility(profile?.institutionVisibility) !==
    "only_you";
  const showProgram =
    normalizeProfileFieldVisibility(profile?.programVisibility) !== "only_you";
  const followLabel: "Follow" | "Following" | "Follow back" | "Requested" =
    profile?.isFollowedByCurrentUser
      ? "Following"
      : hasPendingRequest
        ? "Requested"
        : profile?.isFollowingCurrentUser
          ? "Follow back"
          : "Follow";

  const handleFollowToggle = async () => {
    if (!profile?.username) {
      return;
    }

    if (!user) {
      router.push("/login");
      return;
    }

    if (isUpdatingFollow) {
      return;
    }

    const shouldUnfollow = Boolean(profile.isFollowedByCurrentUser);
    const shouldCancelRequest =
      Boolean(profile.hasPendingFollowRequest) && !shouldUnfollow;
    const previousFollowed = Boolean(profile.isFollowedByCurrentUser);
    const previousPending = Boolean(profile.hasPendingFollowRequest);
    const previousFollowerCount = profile.followersCount ?? 0;

    setIsUpdatingFollow(true);
    setError("");

    if (shouldCancelRequest) {
      // Cancel pending follow request
      setProfile((current) =>
        current ? { ...current, hasPendingFollowRequest: false } : current,
      );

      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(profile.username)}/follow?cancelRequest=true`,
          { method: "DELETE" },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || "Failed to cancel follow request");
        }
      } catch (err) {
        setProfile((current) =>
          current
            ? { ...current, hasPendingFollowRequest: previousPending }
            : current,
        );
        setError("Failed to cancel follow request");
        console.error("Error cancelling follow request:", err);
      } finally {
        setIsUpdatingFollow(false);
      }
      return;
    }

    // Normal follow/unfollow
    // For private profiles, optimistically show "Requested" instead of "Following"
    const isTargetPrivate = isPrivateProfile && !shouldUnfollow;
    setProfile((current) =>
      current
        ? {
            ...current,
            isFollowedByCurrentUser: isTargetPrivate ? false : !shouldUnfollow,
            hasPendingFollowRequest: isTargetPrivate ? true : previousPending,
            followersCount: isTargetPrivate
              ? previousFollowerCount
              : Math.max(0, previousFollowerCount + (shouldUnfollow ? -1 : 1)),
          }
        : current,
    );

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(profile.username)}/follow`,
        {
          method: shouldUnfollow ? "DELETE" : "POST",
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to update follow state");
      }

      // If the response indicates it was a pending request (private profile)
      if (body?.pending) {
        setProfile((current) =>
          current
            ? {
                ...current,
                isFollowedByCurrentUser: false,
                hasPendingFollowRequest: true,
                followersCount: previousFollowerCount,
              }
            : current,
        );
      }
    } catch (err) {
      setProfile((current) =>
        current
          ? {
              ...current,
              isFollowedByCurrentUser: previousFollowed,
              hasPendingFollowRequest: previousPending,
              followersCount: previousFollowerCount,
            }
          : current,
      );
      setError("Failed to update follow state");
      console.error("Error updating follow state:", err);
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  const handlePostPinned = (pinnedPost: HomePost) => {
    setPosts((current) => {
      const nextPosts = current.map((post) => {
        if (post.id === pinnedPost.id) {
          return { ...post, ...pinnedPost, pinned: Boolean(pinnedPost.pinned) };
        }

        if (
          post.author?.id &&
          pinnedPost.author?.id &&
          post.author.id === pinnedPost.author.id
        ) {
          return { ...post, pinned: false };
        }

        return post;
      });

      nextPosts.sort((left, right) => {
        if (Boolean(left.pinned) === Boolean(right.pinned)) return 0;
        return left.pinned ? -1 : 1;
      });

      return nextPosts;
    });

    setActiveOptionsPost((current) =>
      current?.id === pinnedPost.id
        ? { ...current, ...pinnedPost, pinned: Boolean(pinnedPost.pinned) }
        : current,
    );
  };

  const handlePostUpdated = (updatedPost: HomePost) => {
    const updatedAuthorUsername =
      updatedPost.author?.username?.trim().toLowerCase() || "";

    setPosts((current) =>
      current.map((post) =>
        post.id === updatedPost.id
          ? { ...post, ...updatedPost }
          : updatedAuthorUsername &&
              post.author?.username?.trim().toLowerCase() ===
                updatedAuthorUsername
            ? {
                ...post,
                isAuthorFollowedByCurrentUser:
                  updatedPost.isAuthorFollowedByCurrentUser,
                isAuthorMutedByCurrentUser:
                  updatedPost.isAuthorMutedByCurrentUser,
                isAuthorBlockedByCurrentUser:
                  updatedPost.isAuthorBlockedByCurrentUser,
              }
            : post,
      ),
    );
    setActiveOptionsPost((current) =>
      current?.id === updatedPost.id ? { ...current, ...updatedPost } : current,
    );
    setActiveCommentPost((current) =>
      current?.id === updatedPost.id ? { ...current, ...updatedPost } : current,
    );
  };

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts((current) => current.filter((post) => post.id !== deletedPostId));
    setActiveOptionsPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setActiveCommentPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
    setActiveCommentPostId((current) =>
      current === deletedPostId ? null : current,
    );
    setActivePdfPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
  };

  if (!isPublicProfile && isLoadingAuth) {
    return <p className="px-6 py-8 text-sm text-ink-2">Loading profile...</p>;
  }

  if (!isPublicProfile && !user) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-md space-y-4 rounded-3xl bg-surface p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
          <p className="text-sm text-ink-2">Sign in to view your profile.</p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="cursor-pointer rounded-full bg-[#E1761F] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-[#c86518] active:scale-[0.98]"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-8">
      <Alert message={error} type="error" />
      <CommentDrawer
        isOpen={isCommentDrawerOpen}
        onClose={() => {
          setIsCommentDrawerOpen(false);
          setActiveCommentPostId(null);
          setActiveCommentPost(null);
        }}
        postId={activeCommentPostId}
        post={activeCommentPost}
      />
      <OptionsDrawer
        isOpen={isPostOptionsDrawerOpen}
        onClose={() => {
          setIsPostOptionsDrawerOpen(false);
          setActiveOptionsPost(null);
          setActiveOptionsAnchor(null);
        }}
        post={activeOptionsPost}
        anchor={activeOptionsAnchor}
        onPostPinned={handlePostPinned}
        onPostUpdated={handlePostUpdated}
        onPostDeleted={handlePostDeleted}
        onEditPost={(selectedPost) => {
          router.push(`/create?postId=${selectedPost.id}`);
        }}
      />
      <DocumentViewer
        isOpen={Boolean(activePdfPost)}
        post={activePdfPost}
        onClose={() => setActivePdfPost(null)}
      />
      <div className="lg:mx-auto lg:max-w-255 lg:grid lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-6 lg:px-4 lg:items-start">
        <main className="mx-auto flex w-full max-w-140 2xl:max-w-120 flex-col gap-2 lg:max-w-none lg:mx-0 pt-2">
        {isLoadingProfile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <div className="relative">
              <Header
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
                onFollowClick={handleFollowToggle}
                onMessageClick={() => void handleMessageClick()}
                onFollowListOpen={(tab) => setSelectedFollowList(tab)}
                onMoreClick={
                  !isOwner && user
                    ? () => setIsProfileMenuOpen((v) => !v)
                    : undefined
                }
                selectedTab={selectedTab}
                onTabChange={setSelectedTab}
              />
              {/* Profile options menu */}
              {isProfileMenuOpen && (
                <div
                  ref={profileMenuRef}
                  className="absolute right-4 top-14 z-200 w-52 rounded-[20px] border border-edge bg-surface p-2 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
                >
                  <div className="overflow-hidden rounded-2xl bg-page">
                    {isFollower && (
                      <button
                        type="button"
                        disabled={isUpdatingFollow}
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          void handleFollowToggle();
                        }}
                        className="flex w-full items-center gap-3 border-b border-edge px-4 py-3.5 text-left text-sm text-ink transition-colors hover:bg-black/3 disabled:opacity-60"
                      >
                        <UserRemove size={18} color="#111111" variant="Bold" />
                        Unfollow @{profile?.username}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isUpdatingMute}
                      onClick={handleMuteToggle}
                      className="flex w-full items-center gap-3 border-b border-edge px-4 py-3.5 text-left text-sm text-ink transition-colors hover:bg-black/3 disabled:opacity-60"
                    >
                      <VolumeMute size={18} color="#111111" variant="Bold" />
                      {profile?.isMutedByCurrentUser ? "Unmute" : "Mute"} @
                      {profile?.username}
                    </button>
                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="flex w-full items-center gap-3 border-b border-edge px-4 py-3.5 text-left text-sm text-ink transition-colors hover:bg-black/3"
                    >
                      <Link21 size={18} color="#111111" variant="Bold" />
                      Copy profile link
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingBlock}
                      onClick={handleBlockToggle}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-[#D12F2F] transition-colors hover:bg-[#fff1f1] disabled:opacity-60"
                    >
                      <Slash size={18} color="#D12F2F" variant="Bold" />
                      {profile?.isBlockedByCurrentUser ? "Unblock" : "Block"} @
                      {profile?.username}
                    </button>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-2xl bg-[#FFF1F1]">
                    <button
                      type="button"
                      onClick={handleReportProfile}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-[#D12F2F] transition-colors hover:bg-[#ffe7e7]"
                    >
                      <Flag size={18} color="#D12F2F" variant="Bold" />
                      Report account
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!profile ? (
              <p className="px-6 py-8 text-sm text-ink-2">
                {error || "Profile not found."}
              </p>
            ) : !canViewContent ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-high">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#999"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">
                  This account is private
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {hasPendingRequest
                    ? "Your follow request is pending."
                    : "Follow this account to see their posts and achievements."}
                </p>
              </div>
            ) : (
              <>
                {selectedTab === "achievements" ? (
                  <section className="px-4 sm:px-6 lg:px-0">
                    {isLoadingAchievements ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-edge-strong border-t-transparent" />
                      </div>
                    ) : achievements.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <span className="mb-3 text-4xl">🏆</span>
                        <p className="text-sm font-medium text-ink">
                          No achievements yet
                        </p>
                        <p className="mt-1 text-xs text-ink-3">
                          Achievements unlock as you use Material Crate.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {achievements.map((a) => (
                          <Acheivement key={a.id} achievement={a} />
                        ))}
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="space-y-4">
                    {error && posts.length === 0 && isLoadingPosts ? (
                      <p className="px-4 py-8 text-sm text-ink-2 sm:px-6 lg:px-0">
                        Loading posts...
                      </p>
                    ) : posts.length === 0 ? (
                      <p className="px-4 py-8 text-sm text-ink-2 sm:px-6 lg:px-0">
                        No posts yet.
                      </p>
                    ) : (
                      posts.map((post) => (
                        <div key={post.id} className="w-full px-3">
                          <Post
                            post={post}
                            showPinnedIndicator
                            onCommentClick={(selectedPost) => {
                              setActiveCommentPostId(selectedPost.id);
                              setActiveCommentPost(selectedPost);
                              setIsCommentDrawerOpen(true);
                              setIsPostOptionsDrawerOpen(false);
                              setActiveOptionsPost(null);
                              setActiveOptionsAnchor(null);
                              setActivePdfPost(null);
                            }}
                            onOptionsClick={(selectedPost, anchor) => {
                              setActiveOptionsPost(selectedPost);
                              setActiveOptionsAnchor(anchor);
                              setIsPostOptionsDrawerOpen(true);
                              setIsCommentDrawerOpen(false);
                              setActiveCommentPostId(null);
                              setActiveCommentPost(null);
                              setActivePdfPost(null);
                            }}
                            onFileClick={(selectedPost) => {
                              setActivePdfPost(selectedPost);
                              setIsCommentDrawerOpen(false);
                              setActiveCommentPostId(null);
                              setActiveCommentPost(null);
                              setIsPostOptionsDrawerOpen(false);
                              setActiveOptionsPost(null);
                              setActiveOptionsAnchor(null);
                            }}
                          />
                        </div>
                      ))
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        </main>
        <RightSidebar profileUsername={profile?.username} />
      </div>
      <FollowersnFollowingList
        isOpen={selectedFollowList !== null}
        userId={profile?.id}
        username={profile?.username}
        subscriptionPlan={profile?.subscriptionPlan}
        initialTab={selectedFollowList ?? "followers"}
        onClose={() => setSelectedFollowList(null)}
        onCountsChange={handleFollowCountsChange}
      />
    </div>
  );
}
