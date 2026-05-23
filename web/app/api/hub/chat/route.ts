import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const ALLOWED_HOST_SUFFIX = ".amazonaws.com";
const MAX_INLINE_DOCUMENT_BYTES = 45 * 1024 * 1024;

const MY_ARCHIVE_QUERY = `
  query JuIntelliArchive {
    myArchive {
      savedPosts {
        id
        postId
        post {
          id
          title
          description
          categories
          year
          fileUrl
          author {
            displayName
            username
          }
        }
        folder {
          id
          name
        }
      }
    }
  }
`;

const MY_HUB_CHATS_QUERY = `
  query MyHubChats {
    myHubChats {
      id
      postId
      savedPostId
      documentTitle
      createdAt
      updatedAt
      messages {
        id
        role
        text
        createdAt
      }
    }
  }
`;

const UPSERT_HUB_CHAT_MUTATION = `
  mutation UpsertHubChat(
    $postId: ID!
    $savedPostId: ID
    $documentTitle: String!
    $messages: [HubChatMessageInput!]!
  ) {
    upsertHubChat(
      postId: $postId
      savedPostId: $savedPostId
      documentTitle: $documentTitle
      messages: $messages
    ) {
      id
      postId
      savedPostId
      documentTitle
      createdAt
      updatedAt
      messages {
        id
        role
        text
        createdAt
      }
    }
  }
`;

const CLEAR_HUB_CHAT_MUTATION = `
  mutation ClearHubChat($chatId: ID!) {
    clearHubChat(chatId: $chatId)
  }
`;

const MY_AI_USAGE_QUERY = `
  query MyAiUsage {
    myAiUsage {
      dailyTokensUsed
      monthlyTokensUsed
      dailyTokenLimit
      monthlyTokenLimit
      dailyResetsAt
      monthlyResetsAt
      plan
    }
  }
`;

const RECORD_AI_TOKEN_USAGE_MUTATION = `
  mutation RecordAiTokenUsage($tokensUsed: Int!) {
    recordAiTokenUsage(tokensUsed: $tokensUsed) {
      dailyTokensUsed
      monthlyTokensUsed
      dailyTokenLimit
      monthlyTokenLimit
      dailyResetsAt
      monthlyResetsAt
      plan
    }
  }
`;

const DIRECT_POST_QUERY = `
  query JuIntelliPost($id: ID!) {
    post(id: $id) {
      id
      title
      description
      categories
      year
      fileUrl
      author {
        displayName
        username
      }
    }
  }
`;

type HubChatMessagePayload = {
  id?: string;
  role?: "user" | "assistant";
  text?: string;
  createdAt?: string;
};

type HubChatBody = {
  chatId?: string;
  savedPostId?: string;
  postId?: string;
  prompt?: string;
  history?: HubChatMessagePayload[];
};

type HubChatRecord = {
  id?: string;
  postId?: string;
  savedPostId?: string | null;
  documentTitle?: string | null;
  messages?: HubChatMessagePayload[];
  createdAt?: string;
  updatedAt?: string;
};

type ArchiveSavedPostRecord = {
  id?: string;
  postId?: string;
  post?: {
    id?: string;
    title?: string | null;
    description?: string | null;
    categories?: string[] | null;
    year?: number | null;
    fileUrl?: string | null;
    author?: {
      displayName?: string | null;
      username?: string | null;
    } | null;
  } | null;
  folder?: {
    id?: string;
    name?: string | null;
  } | null;
};

type GeminiResponseBody = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

const buildAuthHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isAllowedFileUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX) &&
      parsed.pathname.startsWith("/documents/")
    );
  } catch {
    return false;
  }
};

const extractStreamChunk = (body: GeminiResponseBody): string => {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
};

const sanitizeHistory = (
  history: HubChatBody["history"],
): Array<{
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}> => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .flatMap((message) => {
      const text = message?.text?.trim();
      if (!text) {
        return [];
      }

      const createdAt = new Date(message?.createdAt ?? "");
      const role: "user" | "assistant" =
        message?.role === "assistant" ? "assistant" : "user";

      return [
        {
          id: message?.id?.trim() || createMessageId(),
          role,
          text,
          createdAt: Number.isNaN(createdAt.getTime())
            ? new Date().toISOString()
            : createdAt.toISOString(),
        },
      ];
    })
    .slice(-20);
};

const requestGraphQL = async (
  token: string,
  query: string,
  variables?: Record<string, unknown>,
) => {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: buildAuthHeaders(token),
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.errors?.length) {
    throw new Error(body?.errors?.[0]?.message || "GraphQL request failed");
  }

  return body;
};

const persistHubChat = async ({
  token,
  postId,
  savedPostId,
  documentTitle,
  messages,
}: {
  token: string;
  postId: string;
  savedPostId?: string;
  documentTitle: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: string;
  }>;
}) => {
  const body = await requestGraphQL(token, UPSERT_HUB_CHAT_MUTATION, {
    postId,
    savedPostId: savedPostId?.trim() || null,
    documentTitle,
    messages,
  });

  return (body?.data?.upsertHubChat ?? null) as HubChatRecord | null;
};

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("mc_session")?.value;
  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await requestGraphQL(token, MY_HUB_CHATS_QUERY);

    return NextResponse.json({
      chats: Array.isArray(body?.data?.myHubChats) ? body.data.myHubChats : [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch chat history",
      },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY configuration" },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("mc_session")?.value;
  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: HubChatBody;
  try {
    body = (await req.json()) as HubChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const savedPostId = body.savedPostId?.trim() ?? "";
  const postId = body.postId?.trim() ?? "";
  const prompt = body.prompt?.trim() ?? "";
  const priorHistory = sanitizeHistory(body.history);

  if (!savedPostId && !postId) {
    return NextResponse.json(
      { error: "savedPostId or postId is required" },
      { status: 400 },
    );
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const usageBody = await requestGraphQL(token, MY_AI_USAGE_QUERY);
    const usage = usageBody?.data?.myAiUsage;

    if (usage) {
      const dailyExceeded = usage.dailyTokensUsed >= usage.dailyTokenLimit;
      const monthlyExceeded =
        usage.monthlyTokensUsed >= usage.monthlyTokenLimit;

      if (dailyExceeded || monthlyExceeded) {
        return NextResponse.json(
          {
            error: "AI_LIMIT_REACHED",
            usage,
          },
          { status: 429 },
        );
      }
    }
  } catch {
    // If usage check fails, allow the request to proceed
  }

  let archiveBody: any;
  try {
    archiveBody = await requestGraphQL(token, MY_ARCHIVE_QUERY);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load document for AI",
      },
      { status: 400 },
    );
  }

  const savedPosts: ArchiveSavedPostRecord[] = Array.isArray(
    archiveBody?.data?.myArchive?.savedPosts,
  )
    ? (archiveBody.data.myArchive.savedPosts as ArchiveSavedPostRecord[])
    : [];

  const documentLookupId = savedPostId || postId;
  let documentRecord =
    savedPosts.find(
      (entry) =>
        entry?.id === documentLookupId ||
        entry?.postId === documentLookupId ||
        entry?.post?.id === documentLookupId,
    ) ?? null;

  if (!documentRecord?.post?.id && postId) {
    try {
      const postBody = await requestGraphQL(token, DIRECT_POST_QUERY, {
        id: postId,
      });

      if (!postBody?.data?.post) {
        throw new Error("Document not found");
      }

      documentRecord = {
        id: postBody.data.post.id,
        postId: postBody.data.post.id,
        post: postBody.data.post,
        folder: null,
      };
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Document not found",
        },
        { status: 404 },
      );
    }
  }

  if (!documentRecord?.post?.id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const documentTitle =
    documentRecord.post.title?.trim() || "Untitled document";
  const documentAuthor =
    documentRecord.post.author?.displayName?.trim() ||
    documentRecord.post.author?.username?.trim() ||
    "Unknown author";
  const documentDescription =
    documentRecord.post.description?.trim() || "No description provided.";
  const documentCategories = Array.isArray(documentRecord.post.categories)
    ? documentRecord.post.categories.filter(Boolean).join(", ") ||
      "Uncategorized"
    : "Uncategorized";
  const documentFolder =
    documentRecord.folder?.name?.trim() ||
    (savedPostId ? "Saved posts" : "Opened from app");

  const parts: Array<Record<string, unknown>> = [
    {
      text:
        `Selected Material Crate document:\n` +
        `Title: ${documentTitle}\n` +
        `Author: ${documentAuthor}\n` +
        `Folder: ${documentFolder}\n` +
        `Categories: ${documentCategories}\n` +
        `Description: ${documentDescription}`,
    },
  ];

  const fileUrl = documentRecord.post.fileUrl?.trim?.() ?? "";
  if (fileUrl && isAllowedFileUrl(fileUrl)) {
    try {
      const fileResponse = await fetch(fileUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (fileResponse.ok) {
        const rawContentType =
          fileResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
        const GEMINI_SUPPORTED_MIME_TYPES = new Set([
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/heic",
          "image/heif",
          "text/plain",
          "text/html",
          "text/css",
          "text/javascript",
          "text/x-typescript",
          "text/csv",
          "text/markdown",
          "text/x-python",
          "text/xml",
          "application/rtf",
          "application/json",
        ]);
        const contentType = GEMINI_SUPPORTED_MIME_TYPES.has(rawContentType)
          ? rawContentType
          : "application/pdf";
        const arrayBuffer = await fileResponse.arrayBuffer();

        if (arrayBuffer.byteLength <= MAX_INLINE_DOCUMENT_BYTES) {
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: Buffer.from(arrayBuffer).toString("base64"),
            },
          });
        } else {
          parts.push({
            text: `The original file is too large to attach inline (${Math.round(
              arrayBuffer.byteLength / (1024 * 1024),
            )}MB). Answer using the available document metadata and the user request.`,
          });
        }
      }
    } catch {
      parts.push({
        text: "The original file could not be attached inline. Use the document metadata and conversation context to help the user.",
      });
    }
  }

  if (priorHistory.length > 0) {
    parts.push({
      text: `Conversation so far:\n${priorHistory
        .map(
          (message) =>
            `${message.role === "assistant" ? "Ju Intelli" : "User"}: ${message.text}`,
        )
        .join("\n")}`,
    });
  }

  parts.push({
    text: `User request:\n${prompt}`,
  });

  const userMessage = {
    id: createMessageId(),
    role: "user" as const,
    text: prompt,
    createdAt: new Date().toISOString(),
  };

  const resolvedPostId = documentRecord.post.id!;
  const resolvedSavedPostId =
    savedPostId ||
    (documentRecord.id !== documentRecord.post.id
      ? documentRecord.id
      : undefined);

  const geminiRequestBody = JSON.stringify({
    systemInstruction: {
      parts: [
        {
          text:
            "You are Ju Intelli, the in-app study assistant for Material Crate. " +
            "Answer clearly and concisely using the selected Material Crate document and the conversation context. " +
            "Use light Markdown formatting when helpful, such as short headings, bullet lists, numbered steps, and **bold** key terms. " +
            "Do not use HTML or code fences unless the user asks for them. " +
            "If the document does not contain enough information, say that directly instead of inventing details. " +
            "Do not mention Gemini, API keys, or internal implementation details.",
        },
      ],
    },
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = (event: Record<string, unknown>) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  void (async () => {
    let fullReply = "";
    let tokensUsed = 0;
    let warning = "";

    try {
      const geminiResponse = await fetch(
        `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: geminiRequestBody,
        },
      );

      if (!geminiResponse.ok || !geminiResponse.body) {
        const errBody = (await geminiResponse
          .json()
          .catch(() => ({}))) as GeminiResponseBody;
        throw new Error(
          errBody?.error?.message || "Failed to generate AI response",
        );
      }

      const reader = geminiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr) as GeminiResponseBody;
            const chunkText = extractStreamChunk(parsed);
            if (chunkText) {
              fullReply += chunkText;
              await sendEvent({ type: "chunk", text: chunkText });
            }
            if (parsed.usageMetadata?.totalTokenCount) {
              tokensUsed = parsed.usageMetadata.totalTokenCount;
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      if (!fullReply) {
        throw new Error("AI returned an empty response");
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "";
      warning =
        rawMsg.toLowerCase() === "fetch failed"
          ? "Could not reach the AI service. Please check your connection and try again."
          : rawMsg || "Failed to generate AI response";
      if (!fullReply) {
        const errorText = `I couldn’t respond right now. ${warning}`;
        fullReply = errorText;
        await sendEvent({ type: "chunk", text: errorText });
      }
    }

    const assistantMessage = {
      id: createMessageId(),
      role: "assistant" as const,
      text: fullReply,
      createdAt: new Date().toISOString(),
    };

    let chat: HubChatRecord | null = null;
    let usage: unknown = undefined;

    let saveError = "";
    try {
      chat = await persistHubChat({
        token,
        postId: resolvedPostId,
        savedPostId: resolvedSavedPostId,
        documentTitle,
        messages: [...priorHistory, userMessage, assistantMessage],
      });
    } catch (e) {
      saveError = e instanceof Error ? e.message : "Failed to save chat history.";
    }

    if (tokensUsed > 0) {
      try {
        const usageBody = await requestGraphQL(
          token,
          RECORD_AI_TOKEN_USAGE_MUTATION,
          { tokensUsed },
        );
        usage = usageBody?.data?.recordAiTokenUsage ?? undefined;
      } catch {
        // Non-blocking
      }
    }

    await sendEvent({
      type: "done",
      reply: fullReply,
      model,
      documentTitle,
      warning: warning || saveError || undefined,
      chat,
      tokensUsed: tokensUsed || undefined,
      usage,
    });
    await writer.close();
  })().catch(async () => {
    try {
      await writer.close();
    } catch {
      // ignore
    }
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: HubChatBody;
  try {
    body = (await req.json()) as HubChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chatId = body.chatId?.trim();
  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  try {
    const graphqlBody = await requestGraphQL(token, CLEAR_HUB_CHAT_MUTATION, {
      chatId,
    });

    return NextResponse.json({
      ok: Boolean(graphqlBody?.data?.clearHubChat),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear chat",
      },
      { status: 400 },
    );
  }
}
