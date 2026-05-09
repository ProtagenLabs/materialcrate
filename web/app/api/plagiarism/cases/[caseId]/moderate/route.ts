import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const MODERATE_MUTATION = `
  mutation ModerateCase($caseId: ID!, $action: String!, $note: String) {
    moderateCase(caseId: $caseId, action: $action, note: $note) {
      id verdict status resolvedAt moderatorNote updatedAt viewerRole
      events { id type description actorId createdAt }
    }
  }
`;

const getToken = async () => (await cookies()).get("mc_session")?.value ?? null;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { caseId } = await params;
  let body: { action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action?.trim();
  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: MODERATE_MUTATION,
      variables: { caseId, action, note: body.note?.trim() ?? null },
    }),
  });
  const gqlBody = await res.json().catch(() => ({}));

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message ?? "Failed to moderate case" },
      { status: gqlBody?.errors?.[0]?.message?.includes("authorized") ? 403 : 400 },
    );
  }

  return NextResponse.json({ case: gqlBody?.data?.moderateCase ?? null });
}
