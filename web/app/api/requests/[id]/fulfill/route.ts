import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const FULFILL_MUTATION = `
  mutation FulfillDocumentRequest($requestId: ID!, $postId: ID!) {
    fulfillDocumentRequest(requestId: $requestId, postId: $postId) {
      id
      requestId
      postId
      authorId
      likeCount
      viewerHasLiked
      isAccepted
      createdAt
      author {
        id
        displayName
        username
        profilePicture
      }
      post {
        id
        title
        thumbnailUrl
        fileType
        categories
        likeCount
        viewCount
        createdAt
      }
    }
  }
`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: requestId } = await params;
  const body = await request.json().catch(() => null);
  const postId = body?.postId?.trim();

  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: FULFILL_MUTATION,
      variables: { requestId, postId },
    }),
  });

  const gqlBody = await res.json().catch(() => ({}));

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message || "Failed to fulfill request" },
      { status: 400 },
    );
  }

  return NextResponse.json(gqlBody.data.fulfillDocumentRequest, { status: 201 });
}
