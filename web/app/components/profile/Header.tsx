"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Edit2, Setting2, Verify, Cpu, More } from "iconsax-reactjs";
import proStar from "@/assets/icons/pro-star.svg";
import {
  getProfileBackgroundPresentation,
  isDefaultProfileBackground,
} from "@/app/lib/profile-background";
import {
  getSubscriptionBadgeLabel,
  hasPaidSubscription,
  normalizeSubscriptionPlan,
} from "@/app/lib/subscription";

export type ProfileTab = "posts" | "achievements";

type ProfileHeaderProps = {
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

export default function Header({
  displayName,
  username,
  profilePictureUrl,
  profileBackground,
  followers = 0,
  following = 0,
  subscriptionPlan = "free",
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
  const profileBackgroundPresentation =
    getProfileBackgroundPresentation(profileBackground);
  const hasCustomBackground = !isDefaultProfileBackground(profileBackground);
  const primaryTextClass = hasCustomBackground
    ? "text-white"
    : "text-[#333333]";
  const secondaryTextClass = hasCustomBackground
    ? "text-white/80"
    : "text-[#343434]";
  const iconColor = hasCustomBackground ? "#FFFFFF" : "#444444";
  const iconButtonClass = hasCustomBackground
    ? "cursor-pointer flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-black/28 backdrop-blur-md transition-all duration-200 hover:bg-black/38 active:scale-95"
    : "cursor-pointer flex h-10 w-10 items-center justify-center rounded-full border border-edge-mid bg-white/82 backdrop-blur transition-all duration-200 hover:bg-surface hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] active:scale-95";
  const statLabelClass = hasCustomBackground
    ? "text-white/78"
    : "text-[#343434]";
  const followMutedClass = hasCustomBackground
    ? "border-white/18 bg-white/88 text-ink backdrop-blur transition-all duration-200 hover:bg-surface active:scale-95"
    : "border-[#979797] bg-surface text-ink transition-all duration-200 hover:bg-page active:scale-95";
  const followPrimaryClass = hasCustomBackground
    ? "border-white/18 bg-black/45 text-white backdrop-blur transition-all duration-200 hover:bg-black/55 active:scale-95"
    : "border-black bg-[#131212] text-white transition-all duration-200 hover:bg-[#2A2A2A] active:scale-95";
  const tabActiveClass = hasCustomBackground ? "text-white" : "text-[#1E1E1E]";
  const tabInactiveClass = hasCustomBackground
    ? "text-white/55"
    : "text-[#787777]";
  const indicatorClass = hasCustomBackground ? "bg-surface" : "bg-[#404040]";
  const detailBadgeClass = hasCustomBackground
    ? "border-white/12 bg-black/24 text-white"
    : "border-edge-mid bg-black/[0.04] text-ink";

  const normalizedSubscriptionPlan =
    normalizeSubscriptionPlan(subscriptionPlan);
  const hasPaidPlan = hasPaidSubscription(subscriptionPlan);
  const planBadgeLabel = getSubscriptionBadgeLabel(subscriptionPlan);
  const profileDetails: Array<{ label: string; value: string }> = [];

  if (institutionVisible && institution?.trim()) {
    profileDetails.push({ label: "School", value: institution.trim() });
  }

  if (programVisible && program?.trim()) {
    profileDetails.push({ label: "Program", value: program.trim() });
  }

  const Layout2 =
    institutionVisible ||
    programVisible ||
    institution !== "" ||
    program !== "";

  return (
    <header
      className={`relative z-50 w-full overflow-hidden px-4 pt-8 sm:px-6 sm:pt-10 lg:rounded-[28px] lg:shadow-[0_14px_34px_rgba(0,0,0,0.06)] ${profileBackgroundPresentation.className}`}
      style={profileBackgroundPresentation.style}
    >
      {hasCustomBackground ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.14)_32%,rgba(0,0,0,0.26)_100%)]"
        />
      ) : null}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-18 w-18 shrink-0 overflow-hidden rounded-2xl bg-gray-300 ring-1 ring-black/5 sm:h-19 sm:w-19">
            {profilePictureUrl ? (
              <Image
                src={profilePictureUrl}
                alt={displayName}
                width={76}
                height={76}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-2xl font-bold text-gray-500">
                  {displayName.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className={`${!Layout2 && "flex items-center gap-2"}`}>
              <div className="flex items-center gap-0.5">
                <p
                  className={`truncate text-lg font-medium ${primaryTextClass}`}
                >
                  {displayName}
                </p>
                {hasPaidPlan && (
                  <Verify size={18} color="#E1761F" variant="Bold" />
                )}
              </div>
              <p className={`truncate text-sm ${secondaryTextClass}`}>
                {username}
              </p>
            </div>
            {profileDetails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {profileDetails.map((detail) => (
                  <span
                    key={detail.label}
                    title={detail.value}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] leading-tight ${detailBadgeClass}`}
                  >
                    <span className="truncate">{detail.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {isOwner &&
          (normalizedSubscriptionPlan === "free" ? (
            <div className="flex items-center gap-6">
              <button
                type="button"
                aria-label="edit profile"
                onClick={() => router.replace("/settings/profile")}
                className={iconButtonClass}
              >
                <Edit2 size={20} color={iconColor} />
              </button>
              <button
                type="button"
                aria-label="settings"
                onClick={() => router.push("/settings")}
                className={iconButtonClass}
              >
                <Setting2 size={20} color={iconColor} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cursor-pointer flex items-center justify-center gap-1.5 rounded-full border border-[#F4B400] bg-linear-to-r from-[#F7B500] via-[#ffdb71] to-[#e4d9b7] px-3 py-1.5 transition-all duration-200 hover:brightness-105 active:scale-95"
            >
              <Image src={proStar} alt="Plan badge" width={16} height={16} />
              <p className="text-white text-sm font-medium">{planBadgeLabel}</p>
            </button>
          ))}
      </div>
      <div className="relative z-10 flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-2xl px-2 py-1 text-center transition-all duration-200 hover:bg-black/5 active:scale-95"
            onClick={() => onFollowListOpen?.("followers")}
          >
            <p className={`text-xs ${statLabelClass}`}>Followers</p>
            <p className={`text-xl font-semibold ${primaryTextClass}`}>
              {followers}
            </p>
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-2xl px-2 py-1 text-center transition-all duration-200 hover:bg-black/5 active:scale-95"
            onClick={() => onFollowListOpen?.("following")}
          >
            <p className={`text-xs ${statLabelClass}`}>Following</p>
            <p className={`text-xl font-semibold ${primaryTextClass}`}>
              {following}
            </p>
          </button>
        </div>
        {isOwner ? (
          normalizedSubscriptionPlan === "free" ? (
            <button
              type="button"
              className="cursor-pointer flex items-center justify-center gap-1.5 rounded-full border border-[#F4B400] bg-linear-to-r from-[#F7B500] via-[#ffdb71] to-[#e4d9b7] px-3 py-1.5 transition-all duration-200 hover:brightness-105 active:scale-95"
              onClick={() => router.push("/plans")}
            >
              <Image src={proStar} alt="View plans" width={16} height={16} />
              <p className="text-white text-sm font-medium">View plans</p>
            </button>
          ) : (
            <div className="flex items-center gap-6">
              <button
                type="button"
                aria-label="edit profile"
                onClick={() => router.replace("/settings/profile")}
                className={iconButtonClass}
              >
                <Edit2 size={20} color={iconColor} />
              </button>
              <button
                type="button"
                aria-label="settings"
                onClick={() => router.push("/settings")}
                className={iconButtonClass}
              >
                <Setting2 size={20} color={iconColor} />
              </button>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2">
            {followLabel === "Following" ? (
              <button
                type="button"
                onClick={onMessageClick}
                className={`cursor-pointer rounded-full border px-5 py-2 text-sm font-medium ${followPrimaryClass}`}
              >
                Message
              </button>
            ) : (
              <button
                type="button"
                onClick={onFollowClick}
                disabled={isFollowLoading}
                className={`cursor-pointer rounded-full border px-5 py-2 text-sm font-medium ${
                  followLabel === "Requested"
                    ? followMutedClass
                    : followPrimaryClass
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <p>{isFollowLoading ? "..." : followLabel}</p>
              </button>
            )}
            {onMoreClick && (
              <button
                type="button"
                aria-label="More options"
                onClick={onMoreClick}
                className={iconButtonClass}
              >
                <More size={20} color={iconColor} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="relative z-10 mt-8 -mx-4 grid grid-cols-2 px-4 sm:mt-10 sm:-mx-6 sm:px-6">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-0 left-6 h-0.75 w-[calc(50%-1.5rem)] ${indicatorClass} transition-transform duration-300 ease-out ${
            selectedTab === "posts" ? "translate-x-0" : "translate-x-full"
          }`}
        />
        <button
          type="button"
          className={`cursor-pointer pb-3 text-center font-medium transition-all duration-300 hover:opacity-80 active:scale-[0.98] ${
            selectedTab === "posts" ? tabActiveClass : tabInactiveClass
          }`}
          onClick={() => onTabChange("posts")}
        >
          {postsLabel}
        </button>
        <button
          type="button"
          className={`cursor-pointer pb-3 text-center font-medium transition-all duration-300 hover:opacity-80 active:scale-[0.98] ${
            selectedTab === "achievements" ? tabActiveClass : tabInactiveClass
          }`}
          onClick={() => onTabChange("achievements")}
        >
          Achievements
        </button>
      </div>
    </header>
  );
}
