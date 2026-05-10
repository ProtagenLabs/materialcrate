import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const ARCHIVE_QUERY = `
  query MyArchive {
    myArchive {
      id
      userId
      name
      createdAt
      updatedAt
      folders {
        id
        archiveId
        name
        createdAt
        updatedAt
      }
      savedPosts {
        id
        archiveId
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
            profilePicture
            subscriptionPlan
          }
        }
        folder {
          id
          archiveId
          name
          createdAt
          updatedAt
        }
      }
    }
  }
`;

const SAVE_POST_MUTATION = `
  mutation SavePostToArchive($postId: ID!, $folderId: ID) {
    savePostToArchive(postId: $postId, folderId: $folderId) {
      id
      archiveId
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
          profilePicture
          subscriptionPlan
        }
      }
      folder {
        id
        archiveId
        name
        createdAt
        updatedAt
      }
    }
  }
`;

const REMOVE_SAVED_POST_MUTATION = `
  mutation RemoveArchivedPost($savedPostId: ID!) {
    removeArchivedPost(savedPostId: $savedPostId)
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
    body: JSON.stringify({ query: ARCHIVE_QUERY }),
  });
  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to fetch archive",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ archive: graphqlBody?.data?.myArchive ?? null });
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
        error: graphqlBody?.errors?.[0]?.message || "Failed to save archive file",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    savedPost: graphqlBody?.data?.savePostToArchive ?? null,
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
        error:
          graphqlBody?.errors?.[0]?.message || "Failed to remove archived file",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: Boolean(graphqlBody?.data?.removeArchivedPost),
  });
}

