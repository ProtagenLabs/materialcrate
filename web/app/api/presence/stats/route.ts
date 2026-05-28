import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/app/lib/admin-auth";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

const PRESENCE_STATS_QUERY = `
  query PresenceStats {
    presenceStats {
      activeUsers
      dailyActiveUsers
      monthlyActiveUsers
    }
  }
`;

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ query: PRESENCE_STATS_QUERY }),
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message || "Failed to load presence stats" },
      { status: 400 },
    );
  }

  return NextResponse.json({ stats: body?.data?.presenceStats ?? null });
}
