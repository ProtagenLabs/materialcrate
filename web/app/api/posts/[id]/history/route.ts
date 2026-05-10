import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const POST_HISTORY_QUERY = `
  query PostHistory($postId: ID!) {
    post(id: $postId) {
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
    postVersions(postId: $postId) {
      id
      postId
      versionNumber
      title
      categories
      description
      year
      fileUrl
      thumbnailUrl
      createdAt
      editor {
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
      query: POST_HISTORY_QUERY,
      variables: { postId },
    }),
    cache: "no-store",
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          graphqlBody?.errors?.[0]?.message || "Failed to fetch post history",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    post: graphqlBody?.data?.post ?? null,
    versions: Array.isArray(graphqlBody?.data?.postVersions)
      ? graphqlBody.data.postVersions
      : [],
  });
}
