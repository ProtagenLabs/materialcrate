import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const CONVERSATIONS_QUERY = `
  query Conversations($limit: Int, $cursor: String) {
    conversations(limit: $limit, cursor: $cursor) {
      items {
        id
        participant {
          id
          name
          username
          avatar
          isOnline
        }
        lastMessage
        lastMessageTime
        lastMessageSentByMe
        lastMessageIsRead
        unreadCount
        updatedAt
      }
      nextCursor
    }
  }
`;

const START_CONVERSATION_MUTATION = `
  mutation StartConversation($userId: ID!) {
    startConversation(userId: $userId) {
      id
      participant {
        id
        name
        username
        avatar
        isOnline
      }
      lastMessage
      lastMessageTime
      lastMessageSentByMe
      lastMessageIsRead
      unreadCount
      updatedAt
    }
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
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
};

export async function GET(request: Request) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = 15;

  const { res, body } = await runGraphQL({
    query: CONVERSATIONS_QUERY,
    variables: { limit, cursor },
    token,
  });

  if (!res.ok || body?.errors?.length) {
    return NextResponse.json(
      { error: body?.errors?.[0]?.message || "Failed to fetch conversations" },
      { status: 400 },
    );
  }

  const items = (body?.data?.conversations?.items ?? []).map((item: {
    id: string;
    participant: { id: string; name: string; username: string; avatar: string | null; isOnline: boolean };
    lastMessage: string | null;
    lastMessageTime: string | null;
    lastMessageSentByMe: boolean;
    lastMessageIsRead: boolean;
    unreadCount: number;
  }) => ({
    id: item.id,
    participant: {
      id: item.participant?.id ?? "",
      name: item.participant?.name ?? "",
      username: item.participant?.username ?? "",
      avatar: item.participant?.avatar ?? null,
      isOnline: item.participant?.isOnline ?? false,
    },
    lastMessage: item.lastMessage,
    lastMessageTime: item.lastMessageTime,
    lastMessageSentByMe: item.lastMessageSentByMe,
    lastMessageIsRead: item.lastMessageIsRead,
    unreadCount: item.unreadCount,
  }));

  return NextResponse.json({
    conversations: items,
    nextCursor: body?.data?.conversations?.nextCursor ?? null,
  });
}

export async function POST(request: Request) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { userId?: string };
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { res, body: gqlBody } = await runGraphQL({
    query: START_CONVERSATION_MUTATION,
    variables: { userId },
    token,
  });

  if (!res.ok || gqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error:
          gqlBody?.errors?.[0]?.message || "Failed to start conversation",
      },
      { status: 400 },
    );
  }

  const conv = gqlBody?.data?.startConversation ?? null;
  return NextResponse.json({
    conversation: conv ? {
      id: conv.id,
      participant: {
        id: conv.participant?.id ?? "",
        name: conv.participant?.name ?? "",
        username: conv.participant?.username ?? "",
        avatar: conv.participant?.avatar ?? null,
        isOnline: conv.participant?.isOnline ?? false,
      },
      lastMessage: conv.lastMessage,
      lastMessageTime: conv.lastMessageTime,
      lastMessageSentByMe: conv.lastMessageSentByMe,
      lastMessageIsRead: conv.lastMessageIsRead,
      unreadCount: conv.unreadCount,
    } : null,
  });
}
