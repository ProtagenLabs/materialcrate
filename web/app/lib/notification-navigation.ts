export type NotificationNavigationPayload = {
  type?: string | null;
  actorUsername?: string | null;
  postId?: string | null;
  commentId?: string | null;
  caseId?: string | null;
  achievementId?: string | null;
};

export const getNotificationDescriptionPreview = (
  value?: string | null,
  maxLength = 88,
) => {
  const normalizedValue = value?.trim() || "";
  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 3).trimEnd()}...`;
};

export const getNotificationHref = ({
  type,
  actorUsername,
  postId,
  commentId,
  caseId,
  achievementId,
}: NotificationNavigationPayload) => {
  const normalizedPostId = postId?.trim();
  const normalizedCommentId = commentId?.trim();
  const normalizedCaseId = caseId?.trim();
  const normalizedActorUsername = actorUsername?.trim();
  const normalizedAchievementId = achievementId?.trim();

  if (type === "ACHIEVEMENT_UNLOCKED" && normalizedAchievementId) {
    return `/achievements/${encodeURIComponent(normalizedAchievementId)}`;
  }

  if (
    (type === "PLAGIARISM_ORIGINAL_AUTHOR" || type === "PLAGIARISM_FLAGGED_UPLOAD") &&
    normalizedCaseId
  ) {
    return `/cases/${encodeURIComponent(normalizedCaseId)}`;
  }

  if (normalizedPostId) {
    const searchParams = new URLSearchParams();

    if (
      type === "COMMENT" ||
      type === "COMMENT_LIKE" ||
      type === "MENTION" ||
      Boolean(normalizedCommentId)
    ) {
      searchParams.set("openComments", "1");
    }

    if (normalizedCommentId) {
      searchParams.set("commentId", normalizedCommentId);
    }

    const query = searchParams.toString();
    return `/post/${encodeURIComponent(normalizedPostId)}${query ? `?${query}` : ""}`;
  }

  if (normalizedActorUsername) {
    return `/user/${encodeURIComponent(normalizedActorUsername)}`;
  }

  return null;
};
