import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const NOTIFICATIONS_QUERY = `
  query Notifications($limit: Int!, $unreadOnly: Boolean!) {
    notifications(limit: $limit, unreadOnly: $unreadOnly) {
      id
      type
      actorId
      actorUsername
      postId
      commentId
      caseId
      followRequestId
      achievementId
      title
      description
      icon
      profilePicture
      unread
      time
    }
  }
`;

const CREATE_NOTIFICATION_MUTATION = `
  mutation CreateNotification(
    $type: String
    $title: String!
    $description: String!
    $icon: String!
    $profilePicture: String
    $userId: ID
    $postId: ID
    $commentId: ID
  ) {
    createNotification(
      type: $type
      title: $title
      description: $description
      icon: $icon
      profilePicture: $profilePicture
      userId: $userId
      postId: $postId
      commentId: $commentId
    ) {
      id
      type
      actorId
      actorUsername
      postId
      commentId
      title
      description
      icon
      profilePicture
      unread
      time
    }
  }
`;

const MARK_NOTIFICATION_READ_MUTATION = `
  mutation MarkNotificationRead($notificationId: ID!) {
    markNotificationRead(notificationId: $notificationId) {
      id
      type
      actorId
      actorUsername
      postId
      commentId
      title
      description
      icon
      profilePicture
      unread
      time
    }
  }
`;

const MARK_ALL_NOTIFICATIONS_READ_MUTATION = `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

const getAuthToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get("mc_session")?.value ?? null;
};

const runGraphQL = async ({
  query,
  variables,
  token,
}: {
  query: string;
  variables?: Record<string, unknown>;
  token: string;
}) => {
  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));
  return { graphqlResponse, graphqlBody };
};

export async function GET(request: NextRequest) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limitInput = Number.parseInt(searchParams.get("limit") || "", 10);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Number.isFinite(limitInput)
    ? Math.min(Math.max(limitInput, 1), 100)
    : 50;

  const { graphqlResponse, graphqlBody } = await runGraphQL({
    query: NOTIFICATIONS_QUERY,
    variables: { limit, unreadOnly },
    token,
  });

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          graphqlBody?.errors?.[0]?.message || "Failed to fetch notifications",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  const notifications = Array.isArray(graphqlBody?.data?.notifications)
    ? graphqlBody.data.notifications
    : [];

  return NextResponse.json({ notifications });
}

type CreateNotificationBody = {
  type?: string;
  title?: string;
  description?: string;
  icon?: string;
  profilePicture?: string;
  userId?: string;
  postId?: string;
  commentId?: string;
};

export async function POST(request: Request) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateNotificationBody;
  try {
    body = (await request.json()) as CreateNotificationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = body.type?.trim() || undefined;
  const title = body.title?.trim();
  const description = body.description?.trim();
  const icon = body.icon?.trim() || "Notification";
  const profilePicture = body.profilePicture?.trim() || undefined;
  const userId = body.userId?.trim() || undefined;
  const postId = body.postId?.trim() || undefined;
  const commentId = body.commentId?.trim() || undefined;

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 },
    );
  }

  const { graphqlResponse, graphqlBody } = await runGraphQL({
    query: CREATE_NOTIFICATION_MUTATION,
    variables: {
      type,
      title,
      description,
      icon,
      profilePicture,
      userId,
      postId,
      commentId,
    },
    token,
  });

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          graphqlBody?.errors?.[0]?.message || "Failed to create notification",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    notification: graphqlBody?.data?.createNotification ?? null,
  });
}

type PatchNotificationBody = {
  notificationId?: string;
  markAll?: boolean;
};

export async function PATCH(request: Request) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: PatchNotificationBody;
  try {
    body = (await request.json()) as PatchNotificationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const markAll = Boolean(body.markAll);
  const notificationId = body.notificationId?.trim();

  if (!markAll && !notificationId) {
    return NextResponse.json(
      { error: "notificationId is required when markAll is false" },
      { status: 400 },
    );
  }

  if (markAll) {
    const { graphqlResponse, graphqlBody } = await runGraphQL({
      query: MARK_ALL_NOTIFICATIONS_READ_MUTATION,
      token,
    });

    if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
      return NextResponse.json(
        {
          error:
            graphqlBody?.errors?.[0]?.message ||
            "Failed to mark all notifications as read",
          details: graphqlBody?.errors ?? null,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: Boolean(graphqlBody?.data?.markAllNotificationsRead),
    });
  }

  const { graphqlResponse, graphqlBody } = await runGraphQL({
    query: MARK_NOTIFICATION_READ_MUTATION,
    variables: { notificationId },
    token,
  });

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          graphqlBody?.errors?.[0]?.message ||
          "Failed to mark notification read",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    notification: graphqlBody?.data?.markNotificationRead ?? null,
  });
}
