import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const TOGGLE_LIKE_MUTATION = `
  mutation ToggleFulfillmentLike($fulfillmentId: ID!) {
    toggleFulfillmentLike(fulfillmentId: $fulfillmentId) {
      id
      likeCount
      viewerHasLiked
    }
  }
`;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: fulfillmentId } = await params;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: TOGGLE_LIKE_MUTATION,
      variables: { fulfillmentId },
    }),
  });

  const gqlBody = await res.json().catch(() => ({}));

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message || "Failed to toggle like" },
      { status: 400 },
    );
  }

  return NextResponse.json(gqlBody.data.toggleFulfillmentLike);
}
