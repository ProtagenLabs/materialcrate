import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const COMPARISON_QUERY = `
  query PlagiarismCaseComparison($id: ID!) {
    plagiarismCaseComparison(id: $id) {
      originalChunks {
        index text chunkType wordCount isMatched matchedIndex similarity matchType
      }
      suspectedChunks {
        index text chunkType wordCount isMatched matchedIndex similarity matchType
      }
    }
  }
`;

const getToken = async () => (await cookies()).get("mc_session")?.value ?? null;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { caseId } = await params;
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: COMPARISON_QUERY, variables: { id: caseId } }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message ?? "Failed to fetch comparison" },
      { status: 400 },
    );
  }

  return NextResponse.json({ comparison: body?.data?.plagiarismCaseComparison ?? null });
}
