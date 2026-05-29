import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/app/lib/admin-auth";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token || !verifyAdminToken(token)) return false;
  return true;
}

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (body?.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

// GET — list posts + stats
export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "stats" | "plagiarism" | null

  if (type === "plagiarism") {
    const status = searchParams.get("status") ?? undefined;
    const limit = Number(searchParams.get("limit")) || 50;
    const data = await gql(
      `query AdminPlagiarismCases($status: String, $limit: Int) {
         adminListPlagiarismCases(status: $status, limit: $limit) {
           id originalPostId originalTitle originalAuthor
           suspectedPostId suspectedTitle suspectedAuthor
           similarityScore verdict status createdAt
         }
       }`,
      { status, limit },
    ).catch((e) => ({ error: e.message }));
    if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
    return NextResponse.json({ cases: data.adminListPlagiarismCases ?? [] });
  }

  if (type === "stats") {
    const data = await gql(`
      query { adminUploadStats {
        totalActive totalRemoved
        categories { name count }
        fileTypes { type count percent }
      }}
    `).catch((e) => ({ error: e.message }));
    if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
    return NextResponse.json(data.adminUploadStats);
  }

  const deleted = searchParams.get("deleted") === "true" ? true : searchParams.get("deleted") === "false" ? false : undefined;
  const search = searchParams.get("search") ?? undefined;
  const limit = Number(searchParams.get("limit")) || 20;
  const offset = Number(searchParams.get("offset")) || 0;

  const data = await gql(
    `query AdminListPosts($limit: Int, $offset: Int, $search: String, $deleted: Boolean) {
       adminListPosts(limit: $limit, offset: $offset, search: $search, deleted: $deleted) {
         total
         posts {
           id title authorId authorUsername categories fileType
           viewCount likeCount downloadCount revenue createdAt deleted thumbnailUrl
         }
       }
     }`,
    { limit, offset, search, deleted },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json(data.adminListPosts);
}

// DELETE — soft-delete a post
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const data = await gql(
    `mutation AdminDeletePost($id: ID!) { adminDeletePost(id: $id) }`,
    { id },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// PATCH — restore a deleted post
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const data = await gql(
    `mutation AdminRestorePost($id: ID!) { adminRestorePost(id: $id) }`,
    { id },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
