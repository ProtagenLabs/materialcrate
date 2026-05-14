import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const EDIT_COMMENT_MUTATION = `
  mutation EditComment($commentId: ID!, $content: String!) {
    editComment(commentId: $commentId, content: $content) {
      id
      postId
      parentId
      content
      replyCount
      likeCount
      viewerHasLiked
      createdAt
      author {
        id
        displayName
        username
        profilePicture
        subscriptionPlan
      }
    }
  }
`;

type EditCommentBody = {
  commentId?: string;
  content?: string;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: EditCommentBody;
  try {
    body = (await req.json()) as EditCommentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commentId = body.commentId?.trim();
  const content = body.content?.trim();

  if (!commentId) {
    return NextResponse.json({ error: "commentId is required" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: EDIT_COMMENT_MUTATION,
      variables: { commentId, content },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));
  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to edit comment",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    comment: graphqlBody?.data?.editComment ?? null,
  });
}
