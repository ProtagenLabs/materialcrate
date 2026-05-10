import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const RECENTLY_DELETED_QUERY = `
  query RecentlyDeletedPosts($limit: Int, $offset: Int) {
    recentlyDeletedPosts(limit: $limit, offset: $offset) {
      id
      title
      categories
      fileUrl
      thumbnailUrl
      fileType
      deletedAt
    }
  }
`;

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: RECENTLY_DELETED_QUERY,
      variables: { limit, offset },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          graphqlBody?.errors?.[0]?.message ?? "Failed to fetch deleted posts",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    posts: graphqlBody?.data?.recentlyDeletedPosts ?? [],
  });
}
