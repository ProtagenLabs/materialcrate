import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const ACCEPT_MUTATION = `
  mutation AcceptFulfillment($fulfillmentId: ID!) {
    acceptFulfillment(fulfillmentId: $fulfillmentId) {
      id
      solved
      acceptedFulfillmentId
      bountyReleasedAt
    }
  }
`;

const CLOSE_MUTATION = `
  mutation CloseDocumentRequest($id: ID!) {
    closeDocumentRequest(id: $id) {
      id
      closed
      bountyReleasedAt
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

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const fulfillmentId = body?.fulfillmentId?.trim();
  const action = body?.action;

  if (action === "close") {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: CLOSE_MUTATION, variables: { id } }),
    });

    const gqlBody = await res.json().catch(() => ({}));

    if (!res.ok || gqlBody?.errors?.length) {
      return NextResponse.json(
        { error: gqlBody?.errors?.[0]?.message || "Failed to close request" },
        { status: 400 },
      );
    }

    return NextResponse.json(gqlBody.data.closeDocumentRequest);
  }

  if (!fulfillmentId) {
    return NextResponse.json(
      { error: "fulfillmentId is required" },
      { status: 400 },
    );
  }

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: ACCEPT_MUTATION, variables: { fulfillmentId } }),
  });

  const gqlBody = await res.json().catch(() => ({}));

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message || "Failed to accept fulfillment" },
      { status: 400 },
    );
  }

  return NextResponse.json(gqlBody.data.acceptFulfillment);
}
