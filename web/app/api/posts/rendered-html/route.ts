import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

// The backend server fetches the HTML from private S3 using its AWS credentials
// and returns the content directly, so this route never touches S3 itself.
const POST_RENDERED_HTML_QUERY = `
  query PostRenderedHtml($id: ID!) {
    post(id: $id) {
      id
      fileType
    }
    postRenderedHtml(id: $id)
  }
`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId")?.trim() ?? "";

  if (!postId) {
    return NextResponse.json({ error: "Post id is required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let graphqlBody: Record<string, unknown> = {};
  try {
    const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        query: POST_RENDERED_HTML_QUERY,
        variables: { id: postId },
      }),
    });
    graphqlBody = await graphqlResponse.json().catch(() => ({}));
  } catch (err) {
    console.error("[rendered-html] GraphQL request failed:", err);
    return NextResponse.json(
      { error: "Document service unavailable" },
      { status: 503 },
    );
  }

  if ((graphqlBody?.errors as unknown[])?.length) {
    console.error("[rendered-html] GraphQL errors:", graphqlBody.errors);
    return NextResponse.json(
      { error: "Document service error" },
      { status: 503 },
    );
  }

  const data = graphqlBody?.data as Record<string, unknown> | null;
  const post = data?.post as Record<string, unknown> | null;

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const fileType = (post.fileType as string | null) ?? "pdf";
  if (fileType === "pdf") {
    return NextResponse.json(
      { error: "PDF files use the /api/posts/file viewer" },
      { status: 400 },
    );
  }

  const html = data?.postRenderedHtml as string | null;
  if (!html) {
    console.error(
      `[rendered-html] No HTML content for post ${postId} (fileType: ${fileType})`,
    );
    return NextResponse.json(
      { error: "Document preview is not available for this file" },
      { status: 404 },
    );
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'none'",
    },
  });
}
