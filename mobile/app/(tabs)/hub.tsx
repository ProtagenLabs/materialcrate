import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  Dimensions,
} from "react-native";

const LIST_MAX_HEIGHT = Dimensions.get("window").height * 0.5;
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Add,
  ArrowLeft2,
  ArrowRight2,
  CloseCircle,
  Clock,
  DocumentText1,
  InfoCircle,
} from "iconsax-react-nativejs";
import { gql, WEB_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ArchiveSavedPost = {
  id: string;
  postId: string;
  createdAt?: string;
  post: {
    id: string;
    title?: string | null;
    description?: string | null;
    categories?: string[] | null;
    year?: number | null;
    author?: { displayName?: string | null; username?: string | null } | null;
  };
  folder?: { id: string; name: string } | null;
};

type ArchiveData = { savedPosts: ArchiveSavedPost[] };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  documentId: string;
  documentTitle: string;
  chatId?: string;
};

type ChatMeta = { id: string; documentTitle: string; updatedAt: string };

type HubChatRecord = {
  id: string;
  postId: string;
  savedPostId?: string | null;
  documentTitle: string;
  messages?: Array<Pick<ChatMessage, "id" | "role" | "text" | "createdAt">>;
  createdAt: string;
  updatedAt: string;
};

type HistoryEntry = {
  id: string;
  documentId: string;
  documentTitle: string;
  previewText: string;
  updatedAt: string;
};

type AiUsage = {
  dailyTokensUsed: number;
  monthlyTokensUsed: number;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  dailyResetsAt: string;
  monthlyResetsAt: string;
  plan: string;
};

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const ARCHIVE_QUERY = `
  query HubArchive {
    myArchive {
      savedPosts {
        id postId
        post { id title description categories year author { displayName username } }
        folder { id name }
      }
    }
  }
`;


const AI_USAGE_QUERY = `
  query MyAiUsage {
    myAiUsage {
      dailyTokensUsed monthlyTokensUsed
      dailyTokenLimit monthlyTokenLimit
      dailyResetsAt monthlyResetsAt plan
    }
  }
`;

const POST_QUERY = `
  query HubPost($id: ID!) {
    post(id: $id) {
      id title description categories year
      author { displayName username }
    }
  }
`;

const CLEAR_CHAT_MUTATION = `
  mutation ClearHubChat($chatId: ID!) {
    clearHubChat(chatId: $chatId)
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatHistoryTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatTokenCount = (count: number) => {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
};

const formatResetTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "soon";
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffH >= 24) {
    const d = Math.ceil(diffH / 24);
    return `in ${d} day${d === 1 ? "" : "s"}`;
  }
  if (diffH > 0) return `in ${diffH}h ${diffM}m`;
  return `in ${diffM}m`;
};

const mapChatRowsToMessages = (rows: HubChatRecord[]): ChatMessage[] =>
  rows
    .flatMap((chat) =>
      (Array.isArray(chat.messages) ? chat.messages : []).map((msg) => ({
        ...msg,
        documentId: chat.postId,
        documentTitle: chat.documentTitle,
        chatId: chat.id,
      })),
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

const mapChatRowsToMeta = (rows: HubChatRecord[]): Record<string, ChatMeta> =>
  Object.fromEntries(
    rows
      .filter((c) => c.id && c.postId)
      .map((c) => [
        c.postId,
        { id: c.id, documentTitle: c.documentTitle, updatedAt: c.updatedAt },
      ]),
  );

const PROMPT_SUGGESTIONS = [
  "Summarize the key points from this document.",
  "Explain the hardest concept in simpler words.",
  "Turn this into 5 revision questions with answers.",
  "Pull out the main formulas, keywords, and takeaways.",
];

// ---------------------------------------------------------------------------
// Inline text: **bold** and `code`
// ---------------------------------------------------------------------------
function InlineText({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={idx} style={msgStyles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={idx} style={msgStyles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={idx}>{part}</Text>;
      })}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// MessageText: simplified markdown → RN
// ---------------------------------------------------------------------------
function MessageText({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) {
    return <Text style={msgStyles.userText}>{text}</Text>;
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) {
          i++;
          break;
        }
        if (!/^[-*•]\s+/.test(l)) break;
        items.push(l.replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <View key={`b${blocks.length}`} style={msgStyles.listBlock}>
          {items.map((item, j) => (
            <View key={j} style={msgStyles.listRow}>
              <Text style={msgStyles.assistantText}>{"• "}</Text>
              <InlineText text={item} style={msgStyles.assistantFlex} />
            </View>
          ))}
        </View>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) {
          i++;
          break;
        }
        if (!/^\d+\.\s+/.test(l)) break;
        items.push(l.replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <View key={`n${blocks.length}`} style={msgStyles.listBlock}>
          {items.map((item, j) => (
            <View key={j} style={msgStyles.listRow}>
              <Text style={msgStyles.assistantText}>{`${j + 1}. `}</Text>
              <InlineText text={item} style={msgStyles.assistantFlex} />
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const lt = l.trim();
      if (!lt) {
        i++;
        break;
      }
      if (/^[-*•]\s+/.test(lt) || /^\d+\.\s+/.test(lt)) break;
      paraLines.push(l.trimEnd());
      i++;
    }

    const paraText = paraLines.join("\n").trim();
    const isHeading = paraLines.length === 1 && /^#{1,3}\s+/.test(paraText);
    const display = isHeading ? paraText.replace(/^#{1,3}\s+/, "") : paraText;

    blocks.push(
      <InlineText
        key={`p${blocks.length}`}
        text={display}
        style={isHeading ? msgStyles.heading : msgStyles.assistantText}
      />,
    );
  }

  return <View style={msgStyles.assistantContent}>{blocks}</View>;
}

const msgStyles = StyleSheet.create({
  userText: { fontSize: 14, color: "#FFFFFF", lineHeight: 22 },
  assistantText: { fontSize: 14, color: "#111111", lineHeight: 22 },
  assistantFlex: { fontSize: 14, color: "#111111", lineHeight: 22, flex: 1 },
  assistantContent: { gap: 8 },
  bold: { fontWeight: "700" },
  code: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  heading: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
    lineHeight: 22,
  },
  listBlock: { gap: 6 },
  listRow: { flexDirection: "row", alignItems: "flex-start" },
});

// ---------------------------------------------------------------------------
// HubScreen
// ---------------------------------------------------------------------------
export default function HubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string }>();
  const rawPostId = Array.isArray(params.postId)
    ? params.postId[0]
    : params.postId;
  const requestedPostId = rawPostId?.trim() ?? "";

  const scrollViewRef = useRef<ScrollView>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const streamingTextRef = useRef("");

  const [archive, setArchive] = useState<ArchiveData | null>(null);
  const [directDocument, setDirectDocument] = useState<ArchiveSavedPost | null>(
    null,
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMetaByDocumentId, setChatMetaByDocumentId] = useState<
    Record<string, ChatMeta>
  >({});
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isResolvingDocument, setIsResolvingDocument] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [error, setError] = useState("");
  const [historyLoadError, setHistoryLoadError] = useState("");
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  // Load archive
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { token } = getAuth();
      setIsLoadingArchive(true);
      try {
        const data = await gql<{ myArchive: ArchiveData | null }>(
          ARCHIVE_QUERY,
          {},
          token ?? undefined,
        );
        if (!cancelled) setArchive(data.myArchive);
      } catch {
        if (!cancelled) setError("Failed to load your saved files.");
      } finally {
        if (!cancelled) setIsLoadingArchive(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch history from the web route so it hits the same backend as chat saves.
  const loadHistory = useCallback(async () => {
    const { token } = getAuth();
    setIsLoadingHistory(true);
    setHistoryLoadError("");
    try {
      const res = await fetch(`${WEB_URL}/api/hub/chat`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as {
        chats?: HubChatRecord[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to load history.");
      const chats = json.chats ?? [];
      setHistoryEntries(
        chats
          .filter((c) => c.id && c.postId)
          .map((c) => {
            const msgs = Array.isArray(c.messages) ? c.messages : [];
            const latestUser = [...msgs].reverse().find((m) => m.role === "user");
            const latest = msgs[msgs.length - 1];
            return {
              id: c.id,
              documentId: c.postId,
              documentTitle: c.documentTitle,
              previewText: latestUser?.text || latest?.text || "Open conversation",
              updatedAt: latest?.createdAt || c.updatedAt,
            };
          })
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      );
      setHistory(mapChatRowsToMessages(chats));
      setChatMetaByDocumentId(mapChatRowsToMeta(chats));
    } catch (e) {
      setHistoryLoadError(
        e instanceof Error ? e.message : "Failed to load history.",
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Load AI usage
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { token } = getAuth();
      try {
        const data = await gql<{ myAiUsage: AiUsage }>(
          AI_USAGE_QUERY,
          {},
          token ?? undefined,
        );
        if (!cancelled && data.myAiUsage) setAiUsage(data.myAiUsage);
      } catch {
        // non-blocking
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve requested document from URL param — fetch in parallel with archive
  useEffect(() => {
    if (!requestedPostId) return;
    setSelectedDocumentId(requestedPostId);
    let cancelled = false;
    const load = async () => {
      setIsResolvingDocument(true);
      const { token } = getAuth();
      try {
        const data = await gql<{
          post: ArchiveSavedPost["post"] | null;
        }>(POST_QUERY, { id: requestedPostId }, token ?? undefined);
        if (!cancelled && data.post?.id) {
          setDirectDocument({
            id: data.post.id,
            postId: data.post.id,
            post: data.post,
            folder: null,
          });
        }
      } catch {
        if (!cancelled) setDirectDocument(null);
      } finally {
        if (!cancelled) setIsResolvingDocument(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [requestedPostId]);

  const savedDocuments = useMemo(() => archive?.savedPosts ?? [], [archive]);

  const documents = useMemo(() => {
    if (!directDocument) return savedDocuments;
    const already = savedDocuments.some((sp) =>
      [sp.id, sp.postId, sp.post.id].includes(directDocument.post.id),
    );
    return already ? savedDocuments : [directDocument, ...savedDocuments];
  }, [directDocument, savedDocuments]);

  const requestedDocument = useMemo(
    () =>
      requestedPostId
        ? (documents.find((d) =>
            [d.id, d.postId, d.post.id].includes(requestedPostId),
          ) ?? null)
        : null,
    [documents, requestedPostId],
  );

  useEffect(() => {
    if (documents.length === 0 && !requestedDocument) return;
    setSelectedDocumentId((cur) => {
      if (requestedDocument?.post.id) return requestedDocument.post.id;
      if (cur && documents.some((d) => d.post.id === cur)) return cur;
      // Don't fall back to first doc while a direct post is still being resolved
      if (cur && requestedPostId) return cur;
      return documents[0]?.post.id ?? "";
    });
  }, [documents, requestedDocument, requestedPostId]);

  const selectedDocument = useMemo(
    () =>
      documents.find((d) => d.post.id === selectedDocumentId) ??
      requestedDocument ??
      documents[0] ??
      null,
    [documents, requestedDocument, selectedDocumentId],
  );

  const selectedChatId = useMemo(
    () =>
      selectedDocument
        ? (chatMetaByDocumentId[selectedDocument.post.id]?.id ?? "")
        : "",
    [chatMetaByDocumentId, selectedDocument],
  );

  const conversation = useMemo(
    () =>
      selectedDocument
        ? history.filter((m) =>
            [selectedDocument.post.id, selectedDocument.id].includes(
              m.documentId,
            ),
          )
        : [],
    [history, selectedDocument],
  );


  const syncChatFromServer = useCallback((chat: HubChatRecord) => {
    if (!chat?.id || !chat?.postId) return;
    setChatMetaByDocumentId((prev) => ({
      ...prev,
      [chat.postId]: {
        id: chat.id,
        documentTitle: chat.documentTitle,
        updatedAt: chat.updatedAt,
      },
    }));
    const next = mapChatRowsToMessages([chat]);
    setHistory((prev) => {
      const rest = prev.filter(
        (m) => m.documentId !== chat.postId && m.chatId !== chat.id,
      );
      return [...rest, ...next].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    setHistoryEntries((prev) => {
      const msgs = Array.isArray(chat.messages) ? chat.messages : [];
      const latestUser = [...msgs].reverse().find((m) => m.role === "user");
      const latest = msgs[msgs.length - 1];
      const entry: HistoryEntry = {
        id: chat.id,
        documentId: chat.postId,
        documentTitle: chat.documentTitle,
        previewText: latestUser?.text || latest?.text || "Open conversation",
        updatedAt: latest?.createdAt || chat.updatedAt,
      };
      const rest = prev.filter(
        (e) => e.id !== chat.id && e.documentId !== chat.postId,
      );
      return [entry, ...rest].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [conversation.length, streamingText]);

  const handleSelectDocument = (docId: string) => {
    setSelectedDocumentId(docId);
    setIsPickerOpen(false);
  };

  const handleClearChat = useCallback(() => {
    if (!selectedDocument || !selectedChatId || isClearingChat) return;
    Alert.alert(
      "Clear chat?",
      "This will permanently remove this Ju Intelli conversation from your history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            const { token } = getAuth();
            setIsClearingChat(true);
            setError("");
            try {
              await gql(
                CLEAR_CHAT_MUTATION,
                { chatId: selectedChatId },
                token ?? undefined,
              );
              setHistory((prev) =>
                prev.filter((m) => m.chatId !== selectedChatId),
              );
              setChatMetaByDocumentId((prev) => {
                const next = { ...prev };
                delete next[selectedDocument.post.id];
                return next;
              });
              setHistoryEntries((prev) =>
                prev.filter((e) => e.id !== selectedChatId),
              );
              setPrompt("");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Failed to clear chat.",
              );
            } finally {
              setIsClearingChat(false);
            }
          },
        },
      ],
    );
  }, [isClearingChat, selectedChatId, selectedDocument]);

  const handleSendPrompt = useCallback(async () => {
    if (!selectedDocument || !prompt.trim() || isSending) return;

    if (aiUsage) {
      const exceeded =
        aiUsage.dailyTokensUsed >= aiUsage.dailyTokenLimit ||
        aiUsage.monthlyTokensUsed >= aiUsage.monthlyTokenLimit;
      if (exceeded) {
        setIsLimitModalOpen(true);
        return;
      }
    }

    const { token } = getAuth();
    const nextPrompt = prompt.trim();
    const documentTitle =
      selectedDocument.post.title?.trim() || "Untitled document";

    const userMsg: ChatMessage = {
      id: createMessageId(),
      role: "user",
      text: nextPrompt,
      createdAt: new Date().toISOString(),
      documentId: selectedDocument.post.id,
      documentTitle,
    };

    setHistory((prev) => [...prev, userMsg]);
    setPrompt("");
    setError("");
    setIsSending(true);
    streamingTextRef.current = "";
    setStreamingText("");

    const reqBody = JSON.stringify({
      postId: selectedDocument.post.id,
      savedPostId:
        selectedDocument.id !== selectedDocument.post.id
          ? selectedDocument.id
          : undefined,
      prompt: nextPrompt,
      history: conversation.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt,
      })),
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open("POST", `${WEB_URL}/api/hub/chat`);
        xhr.setRequestHeader("Content-Type", "application/json");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        let processed = 0;
        let done = false;
        let sseBuffer = "";

        const processChunks = () => {
          if (done) return;
          const newText = xhr.responseText.slice(processed);
          if (!newText) return;
          processed = xhr.responseText.length;

          // Accumulate in buffer so events split across XHR reads are reassembled
          sseBuffer += newText;
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? ""; // last element may be an incomplete line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const ev = JSON.parse(jsonStr) as Record<string, unknown>;
              if (ev.type === "chunk" && typeof ev.text === "string") {
                streamingTextRef.current += ev.text as string;
                setStreamingText(streamingTextRef.current);
              } else if (ev.type === "done") {
                done = true;
                if (ev.usage) setAiUsage(ev.usage as AiUsage);
                if (ev.chat) syncChatFromServer(ev.chat as HubChatRecord);
                else if (typeof ev.reply === "string") {
                  setHistory((prev) => [
                    ...prev,
                    {
                      id: createMessageId(),
                      role: "assistant",
                      text: ev.reply as string,
                      createdAt: new Date().toISOString(),
                      documentId: selectedDocument.post.id,
                      documentTitle,
                      chatId: selectedChatId || undefined,
                    },
                  ]);
                }
                if (typeof ev.warning === "string")
                  setError(ev.warning as string);
                resolve();
              }
            } catch {
              // ignore malformed events
            }
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState >= 3) processChunks();
          if (xhr.readyState === 4 && !done) {
            if (xhr.status === 429) {
              try {
                const b = JSON.parse(xhr.responseText) as {
                  usage?: AiUsage;
                };
                if (b.usage) setAiUsage(b.usage);
              } catch {
                // ignore
              }
              setHistory((prev) => prev.filter((m) => m.id !== userMsg.id));
              setPrompt(nextPrompt);
              setIsLimitModalOpen(true);
              resolve();
            } else if (xhr.status === 0 || xhr.status >= 400) {
              let errMsg = "Could not reach the server. Please try again.";
              try {
                const b = JSON.parse(xhr.responseText) as { error?: string };
                if (b.error) errMsg = b.error;
              } catch {
                // ignore
              }
              reject(new Error(errMsg));
            } else {
              resolve();
            }
          }
        };

        xhr.onprogress = () => processChunks();
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Request aborted"));

        xhr.send(reqBody);
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to get Ju Intelli response.";
      if (msg !== "Request aborted") {
        setError(msg);
        setHistory((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            text: `I couldn't respond right now. ${msg}`,
            createdAt: new Date().toISOString(),
            documentId: selectedDocument.post.id,
            documentTitle,
          },
        ]);
      }
    } finally {
      xhrRef.current = null;
      streamingTextRef.current = "";
      setStreamingText("");
      setIsSending(false);
    }
  }, [
    selectedDocument,
    prompt,
    isSending,
    aiUsage,
    conversation,
    selectedChatId,
    syncChatFromServer,
  ]);

  const handleUseHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      setIsHistoryOpen(false);
      const match = documents.find((d) =>
        [d.post.id, d.id].includes(entry.documentId),
      );
      if (match?.post.id) {
        setSelectedDocumentId(match.post.id);
        return;
      }
      setIsResolvingDocument(true);
      const { token } = getAuth();
      try {
        const data = await gql<{ post: ArchiveSavedPost["post"] | null }>(
          POST_QUERY,
          { id: entry.documentId },
          token ?? undefined,
        );
        if (data.post?.id) {
          setDirectDocument({
            id: data.post.id,
            postId: data.post.id,
            post: data.post,
            folder: null,
          });
          setSelectedDocumentId(data.post.id);
          setError("");
        }
      } catch {
        setError("Failed to reopen that document.");
      } finally {
        setIsResolvingDocument(false);
      }
    },
    [documents],
  );

  const requestedDocumentMissing =
    Boolean(requestedPostId) &&
    !isLoadingArchive &&
    !isResolvingDocument &&
    !requestedDocument;

  const isLoading = isLoadingArchive || isLoadingHistory;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.backBtn}
          >
            <ArrowLeft2 size={22} color="#111111" variant="Linear" />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerLabel}>HUB</Text>
            <Text style={styles.headerTitle}>Ju Intelli</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {isLoading && (
            <ActivityIndicator
              size="small"
              color="#E1761F"
              style={{ marginRight: 4 }}
            />
          )}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { setIsHistoryOpen(true); void loadHistory(); }}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Clock size={18} color="#111111" variant="Linear" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setIsPickerOpen(true)}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Add size={18} color="#111111" variant="Linear" />
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.chatContainer}>
          {requestedDocumentMissing && (
            <View style={styles.missingDocBanner}>
              <Text style={styles.missingDocText}>
                {
                  "That file couldn't be loaded. Tap + to choose another document."
                }
              </Text>
            </View>
          )}

          {/* Document bar */}
          <View style={styles.docBar}>
            <View style={styles.docBarLeft}>
              {isResolvingDocument && !selectedDocument ? (
                <View style={styles.docBarLoadingRow}>
                  <ActivityIndicator size="small" color="#9CA3AF" />
                  <Text style={styles.docTitleMuted}>Loading document…</Text>
                </View>
              ) : (
                <Text style={styles.docTitle} numberOfLines={1}>
                  {selectedDocument?.post.title?.trim() || "Choose a document"}
                </Text>
              )}
              <Text style={styles.docSubtitle} numberOfLines={1}>
                {selectedDocument
                  ? `${
                      selectedDocument.post.author?.displayName?.trim() ||
                      selectedDocument.post.author?.username?.trim() ||
                      "Unknown author"
                    }${
                      selectedDocument.folder?.name
                        ? ` • ${selectedDocument.folder.name}`
                        : selectedDocument.id === selectedDocument.post.id
                          ? " • Opened from app"
                          : " • Saved posts"
                    }`
                  : isResolvingDocument
                    ? ""
                    : "Select a saved document using the + button above."}
              </Text>
            </View>
            {selectedDocument && conversation.length > 0 && (
              <TouchableOpacity
                style={styles.clearChatBtn}
                onPress={handleClearChat}
                disabled={isClearingChat}
                activeOpacity={0.7}
              >
                <Text style={styles.clearChatText}>
                  {isClearingChat ? "Clearing..." : "Clear chat"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {selectedDocument ? (
              conversation.length > 0 ? (
                <>
                  {conversation.map((msg) => (
                    <View
                      key={msg.id}
                      style={[
                        styles.messageRow,
                        msg.role === "user"
                          ? styles.messageRowUser
                          : styles.messageRowAssistant,
                      ]}
                    >
                      <View
                        style={[
                          styles.messageBubble,
                          msg.role === "user"
                            ? styles.bubbleUser
                            : styles.bubbleAssistant,
                        ]}
                      >
                        <MessageText
                          text={msg.text}
                          isUser={msg.role === "user"}
                        />
                        <Text
                          style={[
                            styles.messageTime,
                            msg.role === "user"
                              ? styles.timeUser
                              : styles.timeAssistant,
                          ]}
                        >
                          {formatHistoryTime(msg.createdAt)}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {isSending && (
                    <View
                      style={[styles.messageRow, styles.messageRowAssistant]}
                    >
                      <View
                        style={[styles.messageBubble, styles.bubbleAssistant]}
                      >
                        {streamingText ? (
                          <Text style={msgStyles.assistantText}>
                            {streamingText}
                            {"▇"}
                          </Text>
                        ) : (
                          <Text style={styles.thinkingText}>
                            Ju Intelli is thinking…
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <DocumentText1 size={20} color="#111111" variant="Linear" />
                  </View>
                  <Text style={styles.emptyTitle}>Start a new chat</Text>
                  <Text style={styles.emptySubtitle}>
                    {
                      "Ask Ju Intelli about this document. Your chat is saved to your account history."
                    }
                  </Text>
                  <View style={styles.suggestions}>
                    {PROMPT_SUGGESTIONS.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.suggestionBtn}
                        onPress={() => setPrompt(s)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )
            ) : isResolvingDocument ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color="#E1761F" />
                <Text style={styles.emptyTitle}>Loading document…</Text>
                <Text style={styles.emptySubtitle}>
                  {"Getting your file ready for Ju Intelli."}
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Choose a document</Text>
                <Text style={styles.emptySubtitle}>
                  {
                    "Ju Intelli works with saved posts and files opened directly from elsewhere in the app."
                  }
                </Text>
                <TouchableOpacity
                  style={styles.pickDocBtn}
                  onPress={() => setIsPickerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Add size={16} color="#FFFFFF" variant="Linear" />
                  <Text style={styles.pickDocText}>Pick from Saved</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Message Ju Intelli about this document..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!selectedDocument || !prompt.trim() || isSending) &&
                  styles.sendBtnDisabled,
              ]}
              onPress={() => void handleSendPrompt()}
              disabled={!selectedDocument || !prompt.trim() || isSending}
              activeOpacity={0.8}
            >
              <ArrowRight2 size={18} color="#FFFFFF" variant="Linear" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Document Picker Modal */}
      <Modal
        visible={isPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerOpen(false)}
      >
        <View style={styles.modalWrapper}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setIsPickerOpen(false)}
          />
          <View style={[styles.modalSheet, styles.modalSheet]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.flex}>
              <Text style={styles.modalLabel}>SAVED POSTS</Text>
              <Text style={styles.modalTitle}>
                Choose a document for Ju Intelli
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsPickerOpen(false)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <CloseCircle size={24} color="#8a8a8a" variant="Linear" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={documents}
            keyExtractor={(item) => item.id}
            style={styles.pickerList}
            contentContainerStyle={styles.pickerListContent}
            renderItem={({ item }) => {
              const isSelected = item.post.id === selectedDocument?.post.id;
              const title = item.post.title?.trim() || "Untitled document";
              const author =
                item.post.author?.displayName?.trim() ||
                item.post.author?.username?.trim() ||
                "Unknown author";
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemSelected,
                  ]}
                  onPress={() => handleSelectDocument(item.post.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.pickerItemIcon}>
                    <DocumentText1 size={18} color="#111111" variant="Linear" />
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <View style={styles.pickerItemRow}>
                      <Text style={styles.pickerItemTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>Selected</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pickerItemSub} numberOfLines={1}>
                      {author}
                      {item.folder?.name ? ` • ${item.folder.name}` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>
                  {
                    "No saved files yet. You can open any file in Ju Intelli directly from the rest of the app."
                  }
                </Text>
              </View>
            }
          />
        </View>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal
        visible={isHistoryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsHistoryOpen(false)}
      >
        <View style={styles.modalWrapper}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setIsHistoryOpen(false)}
          />
          <View style={[styles.modalSheet, styles.modalSheet]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.flex}>
              <Text style={styles.modalLabel}>HISTORY</Text>
              <Text style={styles.modalTitle}>Recent Ju Intelli chats</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsHistoryOpen(false)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <CloseCircle size={24} color="#8a8a8a" variant="Linear" />
            </TouchableOpacity>
          </View>
          {isLoadingHistory ? (
            <View style={styles.pickerEmpty}>
              <ActivityIndicator size="small" color="#E1761F" />
            </View>
          ) : historyLoadError ? (
            <View style={styles.pickerEmpty}>
              <Text style={styles.pickerEmptyText}>{historyLoadError}</Text>
            </View>
          ) : historyEntries.length > 0 ? (
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              showsVerticalScrollIndicator={false}
            >
              {historyEntries.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.historyItem}
                  onPress={() => void handleUseHistoryEntry(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.historyDocTitle} numberOfLines={1}>
                    {item.documentTitle}
                  </Text>
                  <Text style={styles.historyPreview} numberOfLines={2}>
                    {item.previewText}
                  </Text>
                  <Text style={styles.historyTime}>
                    {formatHistoryTime(item.updatedAt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.pickerEmpty}>
              <Text style={styles.pickerEmptyText}>
                {
                  "No chat history yet. Your prompts will appear here once you start a conversation."
                }
              </Text>
            </View>
          )}
        </View>
        </View>
      </Modal>

      {/* Usage Limit Modal */}
      <Modal
        visible={isLimitModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsLimitModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsLimitModalOpen(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={[styles.modalHeader, { marginBottom: 16 }]}>
            <Text style={styles.modalTitle}>Usage Limit Reached</Text>
            <TouchableOpacity
              onPress={() => setIsLimitModalOpen(false)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <CloseCircle size={24} color="#959595" variant="Linear" />
            </TouchableOpacity>
          </View>

          {aiUsage ? (
            <ScrollView
              contentContainerStyle={styles.limitContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.limitWarningBox}>
                <InfoCircle size={18} color="#A95A13" variant="Bold" />
                <View style={styles.limitWarningTexts}>
                  <Text style={styles.limitWarningTitle}>
                    {aiUsage.dailyTokensUsed >= aiUsage.dailyTokenLimit
                      ? "Daily limit reached"
                      : "Monthly limit reached"}
                  </Text>
                  <Text style={styles.limitWarningBody}>
                    {aiUsage.dailyTokensUsed >= aiUsage.dailyTokenLimit
                      ? `You've used all ${formatTokenCount(aiUsage.dailyTokenLimit)} daily tokens. Your limit resets ${formatResetTime(aiUsage.dailyResetsAt)}.`
                      : `You've used all ${formatTokenCount(aiUsage.monthlyTokenLimit)} monthly tokens. Your limit resets ${formatResetTime(aiUsage.monthlyResetsAt)}.`}
                  </Text>
                </View>
              </View>

              <Text style={styles.limitSectionLabel}>YOUR USAGE</Text>
              <View style={styles.limitGrid}>
                {[
                  {
                    label: "Today",
                    used: aiUsage.dailyTokensUsed,
                    limit: aiUsage.dailyTokenLimit,
                    resetsAt: aiUsage.dailyResetsAt,
                  },
                  {
                    label: "This month",
                    used: aiUsage.monthlyTokensUsed,
                    limit: aiUsage.monthlyTokenLimit,
                    resetsAt: aiUsage.monthlyResetsAt,
                  },
                ].map((item) => (
                  <View key={item.label} style={styles.limitCard}>
                    <Text style={styles.limitCardLabel}>{item.label}</Text>
                    <Text style={styles.limitCardValue}>
                      {formatTokenCount(item.used)}{" "}
                      <Text style={styles.limitCardMax}>
                        / {formatTokenCount(item.limit)}
                      </Text>
                    </Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, (item.used / item.limit) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.limitResetText}>
                      Resets {formatResetTime(item.resetsAt)}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.limitSectionLabel}>TOKEN LIMITS BY PLAN</Text>
              <View style={styles.plansCard}>
                {[
                  {
                    plan: "Free",
                    daily: "1k",
                    monthly: "10k",
                    active: aiUsage.plan === "free",
                  },
                  {
                    plan: "Pro",
                    daily: "25k",
                    monthly: "500k",
                    active: aiUsage.plan === "pro",
                  },
                  {
                    plan: "Premium",
                    daily: "75k",
                    monthly: "2M",
                    active: aiUsage.plan === "premium",
                  },
                ].map((tier) => (
                  <View
                    key={tier.plan}
                    style={[
                      styles.planRow,
                      tier.active && styles.planRowActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.planName,
                        tier.active && styles.planNameActive,
                      ]}
                    >
                      {tier.plan}
                      {tier.active ? " (current)" : ""}
                    </Text>
                    <Text
                      style={[
                        styles.planLimits,
                        tier.active && styles.planNameActive,
                      ]}
                    >
                      {tier.daily}/day · {tier.monthly}/mo
                    </Text>
                  </View>
                ))}
              </View>

              {(aiUsage.plan === "free" || aiUsage.plan === "pro") && (
                <View style={styles.upgradeNote}>
                  <Text style={styles.upgradeNoteText}>
                    To upgrade your plan, visit materialcrate.com/plans
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#FAFAF8" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FAFAF8",
  },
  backBtn: { padding: 4 },
  headerTitleBlock: {},
  headerLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#9CA3AF",
  },
  headerTitle: { fontSize: 18, fontWeight: "500", color: "#111111" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Error
  errorBar: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: { fontSize: 13, color: "#DC2626" },

  // Chat container
  chatContainer: {
    flex: 1,
    margin: 12,
    marginBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  // Missing doc banner
  missingDocBanner: {
    backgroundColor: "#FFF8EF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0D4AE",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  missingDocText: { fontSize: 13, color: "#7C5A2A" },

  // Doc bar
  docBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  docBarLeft: { flex: 1, minWidth: 0 },
  docBarLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  docTitle: { fontSize: 14, fontWeight: "500", color: "#111111" },
  docTitleMuted: { fontSize: 14, fontWeight: "500", color: "#9CA3AF" },
  docSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  clearChatBtn: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearChatText: { fontSize: 12, fontWeight: "500", color: "#111111" },

  // Messages
  messages: { flex: 1 },
  messagesContent: { padding: 12, gap: 12, flexGrow: 1 },
  messageRow: { flexDirection: "row" },
  messageRowUser: { justifyContent: "flex-end" },
  messageRowAssistant: { justifyContent: "flex-start" },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bubbleUser: { backgroundColor: "#202020" },
  bubbleAssistant: { backgroundColor: "#F3F4F6" },
  messageTime: { fontSize: 11, marginTop: 6 },
  timeUser: { color: "rgba(255,255,255,0.6)" },
  timeAssistant: { color: "#9CA3AF" },
  thinkingText: { fontSize: 14, color: "#6B7280" },

  // Empty states
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    minHeight: 300,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111111",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 300,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    justifyContent: "center",
  },
  suggestionBtn: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  suggestionText: { fontSize: 12, color: "#111111" },
  pickDocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#202020",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  pickDocText: { fontSize: 14, fontWeight: "500", color: "#FFFFFF" },

  // Input row
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAF8",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: "#111111",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#202020",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#C9C9C9" },

  // Modals
  modalWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  modalSheetFlex: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  modalSheet: {
    backgroundColor: "#FAFAF8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: "#111111" },
  pickerList: { maxHeight: LIST_MAX_HEIGHT },
  pickerListContent: { gap: 8, paddingBottom: 8 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerItemSelected: {
    borderColor: "#202020",
    backgroundColor: "#FAFAF8",
  },
  pickerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerItemInfo: { flex: 1, minWidth: 0 },
  pickerItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  selectedBadge: {
    backgroundColor: "#202020",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectedBadgeText: { fontSize: 10, fontWeight: "500", color: "#FFFFFF" },
  pickerItemSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  pickerEmpty: {
    borderRadius: 16,
    backgroundColor: "#FAFAF8",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  pickerEmptyText: { fontSize: 14, color: "#6B7280", lineHeight: 22 },

  // History items
  historyItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  historyDocTitle: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  historyPreview: {
    fontSize: 14,
    color: "#111111",
    marginTop: 4,
    lineHeight: 20,
  },
  historyTime: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },

  // Limit modal
  limitContent: { gap: 16, paddingBottom: 16 },
  limitWarningBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFF8F2",
    borderWidth: 1,
    borderColor: "#F5DFC8",
    borderRadius: 16,
    padding: 16,
  },
  limitWarningTexts: { flex: 1, gap: 6 },
  limitWarningTitle: { fontSize: 14, fontWeight: "500", color: "#A95A13" },
  limitWarningBody: { fontSize: 12, color: "#7A5A3A", lineHeight: 18 },
  limitSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#9CA3AF",
  },
  limitGrid: { flexDirection: "row", gap: 12 },
  limitCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    padding: 12,
    gap: 6,
  },
  limitCardLabel: { fontSize: 12, color: "#9CA3AF" },
  limitCardValue: { fontSize: 16, fontWeight: "600", color: "#111111" },
  limitCardMax: { fontSize: 12, fontWeight: "400", color: "#9CA3AF" },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E8E8E8",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#E1761F" },
  limitResetText: { fontSize: 11, color: "#9CA3AF" },
  plansCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    padding: 12,
    gap: 6,
  },
  planRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 10,
  },
  planRowActive: { backgroundColor: "#FFF1DE" },
  planName: { fontSize: 12, color: "#6B7280" },
  planNameActive: { color: "#A95A13", fontWeight: "500" },
  planLimits: { fontSize: 12, color: "#6B7280" },
  upgradeNote: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
  },
  upgradeNoteText: { fontSize: 13, color: "#6B7280", textAlign: "center" },
});
