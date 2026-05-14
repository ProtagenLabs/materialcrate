import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const LIST_QUERY = `
  query DocumentRequests($filter: String, $feed: Boolean, $limit: Int, $offset: Int) {
    documentRequests(filter: $filter, feed: $feed, limit: $limit, offset: $offset) {
      requests {
        id
        title
        description
        categories
        bounty
        bountyEscrowedAt
        bountyReleasedAt
        solved
        closed
        responseCount
        viewerHasFulfilled
        viewerIsAuthor
        createdAt
        author {
          id
          displayName
          username
          profilePicture
          subscriptionPlan
        }
      }
      hasMore
      total
    }
  }
`;

const CREATE_MUTATION = `
  mutation CreateDocumentRequest(
    $title: String!
    $description: String!
    $categories: [String!]!
    $bounty: Int
  ) {
    createDocumentRequest(
      title: $title
      description: $description
      categories: $categories
      bounty: $bounty
    ) {
      id
      title
      description
      categories
      bounty
      solved
      closed
      responseCount
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

async function graphql(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? undefined;
  const feed = searchParams.get("feed") === "true" ? true : undefined;
  const limit = Math.min(Number(searchParams.get("limit") || 20), 100);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const { ok, body } = await graphql(
    LIST_QUERY,
    { filter, feed, limit, offset },
    token,
  );

  if (!ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message || "Failed to fetch requests" },
      { status: 400 },
    );
  }

  return NextResponse.json(body.data.documentRequests);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, description, categories, bounty } = body;

  const { ok, body: gqlBody } = await graphql(
    CREATE_MUTATION,
    {
      title,
      description,
      categories: Array.isArray(categories) ? categories : [],
      bounty: bounty ?? null,
    },
    token,
  );

  if (!ok || gqlBody?.errors?.length) {
    console.error("[POST /api/requests]", gqlBody?.errors);
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message || "Failed to create request" },
      { status: 400 },
    );
  }

  return NextResponse.json(gqlBody.data.createDocumentRequest, { status: 201 });
}
