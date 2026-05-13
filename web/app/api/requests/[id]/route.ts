import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const DETAIL_QUERY = `
  query DocumentRequest($id: ID!) {
    documentRequest(id: $id) {
      id
      title
      description
      categories
      bounty
      bountyEscrowedAt
      bountyReleasedAt
      acceptedFulfillmentId
      solved
      closed
      responseCount
      viewerHasFulfilled
      viewerIsAuthor
      createdAt
      updatedAt
      author {
        id
        displayName
        username
        profilePicture
        subscriptionPlan
      }
      fulfillments {
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
          subscriptionPlan
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
      acceptedFulfillment {
        id
        postId
        authorId
        likeCount
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
        }
      }
    }
  }
`;

const DELETE_MUTATION = `
  mutation DeleteDocumentRequest($id: ID!) {
    deleteDocumentRequest(id: $id)
  }
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  const { id } = await params;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query: DETAIL_QUERY, variables: { id } }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message || "Failed to fetch request" },
      { status: 400 },
    );
  }

  if (!body.data?.documentRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json(body.data.documentRequest);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: DELETE_MUTATION, variables: { id } }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message || "Failed to delete request" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
