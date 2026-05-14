import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const REPORT_COMMENT_MUTATION = `
  mutation ReportComment($commentId: ID!, $reason: String!) {
    reportComment(commentId: $commentId, reason: $reason)
  }
`;

type ReportCommentBody = {
  commentId?: string;
  reason?: string;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ReportCommentBody;
  try {
    body = (await req.json()) as ReportCommentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commentId = body.commentId?.trim();
  const reason = body.reason?.trim() || "Inappropriate content";

  if (!commentId) {
    return NextResponse.json({ error: "commentId is required" }, { status: 400 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: REPORT_COMMENT_MUTATION,
      variables: { commentId, reason },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));
  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to report comment",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
