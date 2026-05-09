import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const CASE_QUERY = `
  query PlagiarismCase($id: ID!) {
    plagiarismCase(id: $id) {
      id
      similarityScore
      verdict
      status
      matchedChunkCount
      totalChunkCount
      revenueRedirectEnabled
      matchSummaryJson
      moderatorNote
      resolvedAt
      createdAt
      updatedAt
      viewerRole
      originalPost {
        id title thumbnailUrl authorId authorUsername
        viewCount isFree price createdAt
      }
      suspectedPost {
        id title thumbnailUrl authorId authorUsername
        viewCount isFree price createdAt
      }
      revenueRedirect {
        active redirectPercentage beneficiaryUserId
      }
      events {
        id caseId type description actorId metadata createdAt
      }
      appeals {
        id caseId userId reason status response createdAt updatedAt
      }
    }
  }
`;

const runGraphQL = async (query: string, variables: Record<string, unknown>, token: string) => {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: await res.json().catch(() => ({})) };
};

const getToken = async () => (await cookies()).get("mc_session")?.value ?? null;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { caseId } = await params;
  const { res, body } = await runGraphQL(CASE_QUERY, { id: caseId }, token);

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message ?? "Failed to fetch case" },
      { status: body?.errors?.[0]?.message?.includes("Access denied") ? 403 : 400 },
    );
  }

  return NextResponse.json({ case: body?.data?.plagiarismCase ?? null });
}
