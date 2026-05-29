import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/app/lib/admin-auth";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

const ALLOWED_HOST_SUFFIX = ".amazonaws.com";

function isAllowedFileUrl(value: string) {
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
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token || !verifyAdminToken(token)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Fetch URLs from GraphQL using admin secret
  const gqlRes = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({
      query: `query AdminGetPostUrls($id: ID!) {
        adminGetPostUrls(id: $id) { fileUrl fileType renderedHtml }
      }`,
      variables: { id },
    }),
    cache: "no-store",
  });

  const gqlBody = await gqlRes.json().catch(() => ({}));
  if (gqlBody?.errors?.length) {
    return NextResponse.json({ error: gqlBody.errors[0].message }, { status: 400 });
  }

  const urls = gqlBody?.data?.adminGetPostUrls as {
    fileUrl: string;
    fileType: string;
    renderedHtml: string | null;
  } | null;

  if (!urls) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const { fileUrl, fileType, renderedHtml } = urls;

  // Return rendered HTML for word documents
  if (fileType !== "pdf" && renderedHtml) {
    return new NextResponse(renderedHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'none'",
      },
    });
  }

  // Proxy the raw file (PDF or DOCX download)
  if (!isAllowedFileUrl(fileUrl)) {
    return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
  }

  const MIME: Record<string, string> = {
    pdf:  "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc:  "application/msword",
  };
  const acceptMime = MIME[fileType] ?? "application/pdf";

  let fileBuffer: Buffer;
  try {
    const upstream = await fetch(fileUrl, {
      cache: "no-store",
      headers: { Accept: `${acceptMime},*/*` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
    }
    fileBuffer = Buffer.from(await upstream.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "File fetch failed" }, { status: 504 });
  }

  const totalSize = fileBuffer.byteLength;
  const baseHeaders: Record<string, string> = {
    "Content-Type": acceptMime,
    "Content-Disposition": `inline; filename="document.${fileType}"`,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
  };

  // Support range requests (pdfjs needs them)
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end   = match[2] ? parseInt(match[2], 10) : totalSize - 1;
      const s = Math.max(0, Math.min(start, totalSize - 1));
      const e = Math.max(s, Math.min(end, totalSize - 1));
      const chunk = fileBuffer.subarray(s, e + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: { ...baseHeaders, "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${s}-${e}/${totalSize}` },
      });
    }
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(totalSize) },
  });
}
