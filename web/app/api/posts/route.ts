import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runGql, getClientIp } from "../../lib/gql";

const POSTS_QUERY = `
  query Posts($authorUsername: String, $limit: Int!, $offset: Int!) {
    posts(authorUsername: $authorUsername, limit: $limit, offset: $offset) {
      id
      fileUrl
      thumbnailUrl
      fileType
      title
      categories
      description
      year
      pinned
      commentsDisabled
      likeCount
      commentCount
      viewerHasLiked
      viewCount
      createdAt
      author {
        id
        displayName
        username
        profilePicture
        subscriptionPlan
        isBot
      }
    }
  }
`;

const AUTHENTICATED_POSTS_QUERY = `
  query Posts($authorUsername: String, $limit: Int!, $offset: Int!) {
    me {
      username
      blockedUserIds
      following {
        username
      }
      mutedUsers {
        username
      }
    }
    posts(authorUsername: $authorUsername, limit: $limit, offset: $offset) {
      id
      fileUrl
      thumbnailUrl
      fileType
      title
      categories
      description
      year
      pinned
      commentsDisabled
      likeCount
      commentCount
      viewerHasLiked
      viewCount
      createdAt
      author {
        id
        displayName
        username
        profilePicture
        subscriptionPlan
      }
    }
  }
`;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  const { searchParams } = new URL(request.url);
  const authorUsername = searchParams.get("author")?.trim() || null;
  const parsedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
  const parsedOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;
  const safeOffset = Number.isFinite(parsedOffset)
    ? Math.max(parsedOffset, 0)
    : 0;
  const queryLimit = safeLimit + 1;

  const result = await runGql({
    query: token ? AUTHENTICATED_POSTS_QUERY : POSTS_QUERY,
    variables: {
      authorUsername,
      limit: queryLimit,
      offset: safeOffset,
    },
    token,
    forwardedFor: getClientIp(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.errors?.[0]?.message || "Failed to fetch posts" },
      { status: 400 },
    );
  }

  const me = result.data?.me as {
    following?: { username?: string | null }[];
    mutedUsers?: { username?: string | null }[];
    blockedUserIds?: string[];
  } | null ?? null;

  const viewerFollowingUsernames = new Set(
    (Array.isArray(me?.following) ? me!.following! : [])
      .map((entry) => entry.username?.trim().toLowerCase())
      .filter(Boolean),
  );
  const viewerMutedUsernames = new Set(
    (Array.isArray(me?.mutedUsers) ? me!.mutedUsers! : [])
      .map((entry) => entry.username?.trim().toLowerCase())
      .filter(Boolean),
  );
  const viewerBlockedUserIds = new Set(
    (Array.isArray(me?.blockedUserIds) ? me!.blockedUserIds! : []).filter(Boolean),
  );

  const mappedPosts = (
    Array.isArray(result.data?.posts) ? (result.data!.posts as Record<string, unknown>[]) : []
  ).map((post) => {
    const author = (post.author ?? null) as {
      id?: string | null;
      username?: string | null;
    } | null;
    const authorUsername = author?.username?.trim().toLowerCase();

    return {
      ...post,
      isAuthorFollowedByCurrentUser: authorUsername
        ? viewerFollowingUsernames.has(authorUsername)
        : false,
      isAuthorMutedByCurrentUser: authorUsername
        ? viewerMutedUsernames.has(authorUsername)
        : false,
      isAuthorBlockedByCurrentUser: author?.id
        ? viewerBlockedUserIds.has(author.id)
        : false,
    };
  });

  const hasMore = mappedPosts.length > safeLimit;
  const posts = hasMore ? mappedPosts.slice(0, safeLimit) : mappedPosts;

  return NextResponse.json({ posts, hasMore });
}
