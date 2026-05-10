import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const WORKSPACE_QUERY = `
  query MyWorkspace {
    myWorkspace {
      id
      userId
      name
      createdAt
      updatedAt
      folders {
        id
        workspaceId
        name
        createdAt
        updatedAt
      }
      savedPosts {
        id
        workspaceId
        folderId
        postId
        createdAt
        post {
          id
          fileUrl
          thumbnailUrl
          fileType
          title
          categories
          description
          year
          commentsDisabled
          likeCount
          commentCount
          viewerHasLiked
      viewCount
          createdAt
          author {
            id
            displayName
            username
          }
        }
        folder {
          id
          workspaceId
          name
          createdAt
          updatedAt
        }
      }
    }
  }
`;

const SAVE_POST_MUTATION = `
  mutation SavePostToWorkspace($postId: ID!, $folderId: ID) {
    savePostToWorkspace(postId: $postId, folderId: $folderId) {
      id
      workspaceId
      folderId
      postId
      createdAt
      post {
        id
        fileUrl
        thumbnailUrl
        title
        categories
        description
        year
        commentsDisabled
        likeCount
        commentCount
        viewerHasLiked
      viewCount
        createdAt
        author {
          id
          displayName
          username
        }
      }
      folder {
        id
        workspaceId
        name
        createdAt
        updatedAt
      }
    }
  }
`;

const REMOVE_SAVED_POST_MUTATION = `
  mutation RemoveSavedPost($savedPostId: ID!) {
    removeSavedPost(savedPostId: $savedPostId)
  }
`;

const buildAuthHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

type SavePostBody = {
  postId?: string;
  folderId?: string | null;
};

type RemoveSavedPostBody = {
  savedPostId?: string;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ query: WORKSPACE_QUERY }),
  });
  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to fetch workspace",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ workspace: graphqlBody?.data?.myWorkspace ?? null });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: SavePostBody;
  try {
    body = (await req.json()) as SavePostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const postId = body.postId?.trim();
  const folderId = body.folderId?.trim() || null;
  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      query: SAVE_POST_MUTATION,
      variables: { postId, folderId },
    }),
  });
  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to save post",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    savedPost: graphqlBody?.data?.savePostToWorkspace ?? null,
  });
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: RemoveSavedPostBody;
  try {
    body = (await req.json()) as RemoveSavedPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const savedPostId = body.savedPostId?.trim();
  if (!savedPostId) {
    return NextResponse.json(
      { error: "savedPostId is required" },
      { status: 400 },
    );
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      query: REMOVE_SAVED_POST_MUTATION,
      variables: { savedPostId },
    }),
  });
  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to remove saved post",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: Boolean(graphqlBody?.data?.removeSavedPost),
  });
}

