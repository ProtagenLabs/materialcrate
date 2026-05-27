import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminToken, decodeAdminToken } from "@/app/lib/admin-auth";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token || !verifyAdminToken(token)) return null;
  return decodeAdminToken(token);
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

// GET — list all admin users
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const data = await gql(`
    query { adminListAdmins { id email role name createdAt } }
  `).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ admins: data.adminListAdmins ?? [] });
}

// POST — create admin
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, password, role, name } = body;

  if (!email || !password || !role) {
    return NextResponse.json({ error: "email, password and role are required" }, { status: 400 });
  }

  const data = await gql(
    `mutation AdminCreateAdmin($email: String!, $password: String!, $role: String!, $name: String) {
       adminCreateAdmin(email: $email, password: $password, role: $role, name: $name) {
         id email role name createdAt
       }
     }`,
    { email, password, role, name: name || null },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ admin: data.adminCreateAdmin });
}

// PATCH — update role or name
export async function PATCH(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, role, name } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const data = await gql(
    `mutation AdminUpdateAdmin($id: ID!, $role: String, $name: String) {
       adminUpdateAdmin(id: $id, role: $role, name: $name) {
         id email role name createdAt
       }
     }`,
    { id, role: role ?? null, name: name ?? undefined },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ admin: data.adminUpdateAdmin });
}

// DELETE — remove admin (cannot remove yourself)
export async function DELETE(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Prevent self-deletion — compare against current user's email
  const listData = await gql(
    `query { adminListAdmins { id email } }`,
  ).catch(() => ({ adminListAdmins: [] }));

  const target = (listData.adminListAdmins as { id: string; email: string }[]).find(
    (a) => a.id === id,
  );
  if (target?.email === me.email) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  const data = await gql(
    `mutation AdminRemoveAdmin($id: ID!) { adminRemoveAdmin(id: $id) }`,
    { id },
  ).catch((e) => ({ error: e.message }));

  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
