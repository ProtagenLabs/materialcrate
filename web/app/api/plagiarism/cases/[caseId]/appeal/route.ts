import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const SUBMIT_APPEAL_MUTATION = `
  mutation SubmitCaseAppeal($caseId: ID!, $reason: String!) {
    submitCaseAppeal(caseId: $caseId, reason: $reason) {
      id caseId userId reason status response createdAt updatedAt
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
  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reason = body.reason?.trim();
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: SUBMIT_APPEAL_MUTATION, variables: { caseId, reason } }),
  });
  const gqlBody = await res.json().catch(() => ({}));

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      { error: gqlBody?.errors?.[0]?.message ?? "Failed to submit appeal" },
      { status: 400 },
    );
  }

  return NextResponse.json({ appeal: gqlBody?.data?.submitCaseAppeal ?? null });
}
