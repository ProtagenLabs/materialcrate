import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const POST_QUERY = `
  query PostById($id: ID!) {
    post(id: $id) {
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

const AUTHENTICATED_POST_QUERY = `
  query PostById($id: ID!) {
    me {
      blockedUserIds
      following {
        username
      }
      mutedUsers {
        username
      }
    }
    post(id: $id) {
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

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const postId = id?.trim();
  if (!postId) {
    return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query: token ? AUTHENTICATED_POST_QUERY : POST_QUERY,
      variables: { id: postId },
    }),
    cache: "no-store",
  });
  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to fetch post",
      },
      { status: 400 },
    );
  }

  const viewerFollowingUsernames = new Set(
    (Array.isArray(graphqlBody?.data?.me?.following)
      ? graphqlBody.data.me.following
      : []
    )
      .map((entry: { username?: string | null }) =>
        entry.username?.trim().toLowerCase(),
      )
      .filter(Boolean),
  );
  const viewerMutedUsernames = new Set(
    (Array.isArray(graphqlBody?.data?.me?.mutedUsers)
      ? graphqlBody.data.me.mutedUsers
      : []
    )
      .map((entry: { username?: string | null }) =>
        entry.username?.trim().toLowerCase(),
      )
      .filter(Boolean),
  );
  const viewerBlockedUserIds = new Set(
    (Array.isArray(graphqlBody?.data?.me?.blockedUserIds)
      ? graphqlBody.data.me.blockedUserIds
      : []
    ).filter(Boolean),
  );

  const post = graphqlBody?.data?.post;
  const authorUsername = post?.author?.username?.trim().toLowerCase();

  return NextResponse.json({
    post: post
      ? {
          ...post,
          isAuthorFollowedByCurrentUser: authorUsername
            ? viewerFollowingUsernames.has(authorUsername)
            : false,
          isAuthorMutedByCurrentUser: authorUsername
            ? viewerMutedUsernames.has(authorUsername)
            : false,
          isAuthorBlockedByCurrentUser: post.author?.id
            ? viewerBlockedUserIds.has(post.author.id)
            : false,
        }
      : null,
  });
}
