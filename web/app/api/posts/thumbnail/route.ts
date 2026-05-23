import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ALLOWED_HOST_SUFFIXES = [".amazonaws.com", ".cloudfront.net"];

const THUMBNAIL_URL_QUERY = `
  query PostThumbnailUrl($id: ID!) {
    post(id: $id) {
      id
      thumbnailUrl
    }
  }
`;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const isDev = process.env.NODE_ENV === "development";

const isAllowedThumbnailUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    // In dev allow local S3 / MinIO (http://localhost:9000 etc.)
    if (isDev && LOCAL_HOSTNAMES.has(parsed.hostname)) return true;
    return (
      parsed.protocol === "https:" &&
      ALLOWED_HOST_SUFFIXES.some((s) => parsed.hostname.endsWith(s))
    );
  } catch {
    return false;
  }
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId")?.trim() ?? "";

  if (!postId) {
    return NextResponse.json({ error: "Post id is required" }, { status: 400 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query: THUMBNAIL_URL_QUERY,
      variables: { id: postId },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));
  const thumbnailUrl = graphqlBody?.data?.post?.thumbnailUrl?.trim?.() ?? "";

  if (!thumbnailUrl || !isAllowedThumbnailUrl(thumbnailUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  const upstreamResponse = await fetch(thumbnailUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new NextResponse(null, {
      status: upstreamResponse.status || 502,
    });
  }

  const contentType =
    upstreamResponse.headers.get("content-type") ?? "image/jpeg";

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
