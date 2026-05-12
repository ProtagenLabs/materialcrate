import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const ALLOWED_HOST_SUFFIX = ".amazonaws.com";
const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const PROTECTED_PDF_REQUEST_HEADER = "x-materialcrate-pdf-request";
const BLOCKED_FETCH_DESTINATIONS = new Set([
  "document",
  "embed",
  "frame",
  "iframe",
  "object",
]);
const FILE_URL_QUERY = `
  query PostFileUrl($id: ID!) {
    post(id: $id) {
      id
      fileUrl
      fileType
    }
  }
`;
const TRACK_FEED_INTERACTION_MUTATION = `
  mutation TrackFeedInteraction($input: FeedInteractionInput!) {
    trackFeedInteraction(input: $input)
  }
`;

const isAllowedFileUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX) &&
      parsed.pathname.startsWith("/documents/")
    );
  } catch {
    return false;
  }
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId")?.trim() ?? "";
  const requestHeaders = new Headers(req.headers);
  const requestIntent = requestHeaders
    .get(PROTECTED_PDF_REQUEST_HEADER)
    ?.trim()
    .toLowerCase();
  const fetchDestination = requestHeaders
    .get("sec-fetch-dest")
    ?.trim()
    .toLowerCase();

  if (!postId) {
    return NextResponse.json({ error: "Post id is required" }, { status: 400 });
  }

  const isViewerRequest = requestIntent === "viewer";
  const isDownloadRequest = requestIntent === "download";

  if (
    (!isViewerRequest && !isDownloadRequest) ||
    (fetchDestination && BLOCKED_FETCH_DESTINATIONS.has(fetchDestination))
  ) {
    return NextResponse.json(
      { error: "Direct file access is not allowed" },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      query: FILE_URL_QUERY,
      variables: { id: postId },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));
  const fileUrl = graphqlBody?.data?.post?.fileUrl?.trim?.() ?? "";
  const fileType: string = graphqlBody?.data?.post?.fileType ?? "pdf";

  if (!fileUrl || !isAllowedFileUrl(fileUrl)) {
    return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
  }

  const MIME_BY_TYPE: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
  };
  const EXT_BY_TYPE: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    doc: "doc",
  };
  const acceptMime = MIME_BY_TYPE[fileType] ?? "application/pdf";
  const fileExt = EXT_BY_TYPE[fileType] ?? "pdf";

  let fileBuffer: Buffer;
  try {
    const upstreamResponse = await fetch(fileUrl, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: `${acceptMime},*/*` },
      // Generous timeout — large PDFs can take a while over slower links.
      signal: AbortSignal.timeout(60000),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return NextResponse.json(
        { error: "Failed to fetch file" },
        { status: upstreamResponse.status || 502 },
      );
    }

    // Buffer the entire file before responding. Streaming without a known
    // Content-Length causes Next.js to use chunked encoding, which breaks
    // with ERR_INCOMPLETE_CHUNKED_ENCODING when the upstream connection drops.
    fileBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        err.message.includes("Timeout"));
    return NextResponse.json(
      { error: isTimeout ? "File fetch timed out" : "Failed to reach file storage" },
      { status: 504 },
    );
  }

  // Fire-and-forget interaction tracking — don't block the file response.
  fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      query: TRACK_FEED_INTERACTION_MUTATION,
      variables: {
        input: {
          postId,
          interactionType: isDownloadRequest ? "DOWNLOAD" : "OPEN_PREVIEW",
          signalKind: "positive",
          metadata: JSON.stringify({
            source: "protected-pdf-route",
            requestIntent: isDownloadRequest ? "download" : "viewer",
          }),
        },
      },
    }),
  }).catch(() => null);

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": acceptMime,
      "Content-Length": fileBuffer.byteLength.toString(),
      "Content-Disposition": isDownloadRequest
        ? `attachment; filename="materialcrate-document.${fileExt}"`
        : `inline; filename="protected-document.${fileExt}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Accept-Ranges": "none",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'self'; sandbox",
    },
  });
}
