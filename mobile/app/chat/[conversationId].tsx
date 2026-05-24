import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
  Animated,
  useWindowDimensions,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  ArrowLeft2,
  Send2,
  DocumentText,
  TickCircle,
  More,
  Trash,
  Profile,
  SearchNormal1,
} from "iconsax-react-nativejs";
import { gql, WEB_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const GET_CONVERSATION_QUERY = `
  query GetConversation($conversationId: ID!, $limit: Int) {
    conversation(id: $conversationId) {
      id
      participant {
        id
        name
        username
        avatar
        isOnline
      }
    }
    messages(conversationId: $conversationId, limit: $limit) {
      id
      text
      sentByMe
      timestamp
      status
      isUnsent
      attachments {
        id
        type
        url
        fileName
        fileSize
      }
    }
  }
`;

const SEND_MESSAGE_MUTATION = `
  mutation SendMessage($conversationId: ID!, $text: String) {
    sendMessage(conversationId: $conversationId, text: $text) {
      id
      text
      sentByMe
      timestamp
      status
      isUnsent
      attachments {
        id
        type
        url
        fileName
        fileSize
      }
    }
  }
`;

const MARK_READ_MUTATION = `
  mutation MarkMessagesRead($conversationId: ID!) {
    markMessagesRead(conversationId: $conversationId)
  }
`;

const DELETE_CONVERSATION_MUTATION = `
  mutation DeleteConversation($conversationId: ID!) {
    deleteConversation(conversationId: $conversationId)
  }
`;

const UNSEND_MESSAGE_MUTATION = `
  mutation UnsendMessage($messageId: ID!) {
    unsendMessage(messageId: $messageId)
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageStatus = "sending" | "sent" | "delivered" | "read";

type MessageAttachment = {
  id: string;
  type: string;
  url?: string | null;
  fileName?: string | null;
  fileSize?: string | null;
};

type Message = {
  id: string;
  text: string | null;
  sentByMe: boolean;
  timestamp: Date;
  status?: MessageStatus;
  isUnsent?: boolean;
  attachments?: MessageAttachment[];
};

type Participant = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
};

type RawMessage = {
  id: string;
  text: string | null;
  sentByMe: boolean;
  timestamp: string;
  status: string | null;
  isUnsent: boolean;
  attachments?: MessageAttachment[];
};

type GifItem = {
  id: string;
  stillUrl: string;
  mp4Url: string;
  width: number;
  height: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_BG = [
  "#FFE6CF",
  "#E8EBFF",
  "#DBF5EC",
  "#FFE0E8",
  "#EEE8FF",
  "#FEF3C7",
];
const AVATAR_FG = [
  "#B76217",
  "#4150D8",
  "#197356",
  "#B33F61",
  "#684AD9",
  "#92400E",
];

function avatarColors(id: string) {
  const i = (id.charCodeAt(0) ?? 0) % AVATAR_BG.length;
  return { bg: AVATAR_BG[i], fg: AVATAR_FG[i] };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86400000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupMessagesByDay(
  messages: Message[],
): { label: string; messages: Message[] }[] {
  const map = new Map<string, Message[]>();
  for (const msg of messages) {
    const key = formatDateSeparator(msg.timestamp);
    const group = map.get(key) ?? [];
    group.push(msg);
    map.set(key, group);
  }
  return Array.from(map.entries()).map(([label, msgs]) => ({
    label,
    messages: msgs,
  }));
}

function normaliseStatus(
  raw: string | null | undefined,
): MessageStatus | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "sent") return "sent";
  if (lower === "delivered") return "delivered";
  if (lower === "read") return "read";
  return undefined;
}

const POST_URL_RE = /(?:https?:\/\/[^\s]*)?\/post\/([a-zA-Z0-9_-]+)/;

function extractPostId(text: string | null): string | null {
  if (!text) return null;
  return text.match(POST_URL_RE)?.[1] ?? null;
}

function stripPostUrl(text: string): string {
  return text
    .replace(/(?:https?:\/\/[^\s]*)?\/post\/[a-zA-Z0-9_-]+/g, "")
    .trim();
}

function extractGifUrl(text: string | null): string | null {
  if (!text) return null;
  return text.match(/https:\/\/media\d*\.giphy\.com\/\S+/)?.[0] ?? null;
}

function parseRawMessage(m: RawMessage): Message {
  return {
    id: m.id,
    text: m.text,
    sentByMe: m.sentByMe,
    timestamp: new Date(m.timestamp),
    status: normaliseStatus(m.status),
    isUnsent: m.isUnsent,
    attachments: m.attachments ?? [],
  };
}

// ─── PostLinkPreview ──────────────────────────────────────────────────────────

type PostPreviewData = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
};

const postPreviewCache = new Map<string, PostPreviewData | null>();

function PostLinkPreview({
  postId,
  sentByMe,
}: {
  postId: string;
  sentByMe: boolean;
}) {
  const router = useRouter();
  const cached = postPreviewCache.get(postId);
  const [data, setData] = useState<PostPreviewData | null | "loading">(
    cached !== undefined ? cached : "loading",
  );

  useEffect(() => {
    if (data !== "loading") return;
    let cancelled = false;
    fetch(`${WEB_URL}/api/posts/${encodeURIComponent(postId)}`)
      .then((r) => r.json())
      .then(
        (body: {
          post?: {
            id: string;
            title: string;
            thumbnailUrl?: string | null;
          } | null;
        }) => {
          if (cancelled) return;
          const post = body?.post ?? null;
          const result: PostPreviewData | null = post
            ? {
                id: post.id,
                title: post.title,
                thumbnailUrl: post.thumbnailUrl ?? null,
              }
            : null;
          postPreviewCache.set(postId, result);
          setData(result);
        },
      )
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, data]);

  if (data === "loading") {
    return (
      <View
        style={[
          styles.postPreview,
          sentByMe ? styles.postPreviewSent : styles.postPreviewReceived,
        ]}
      >
        <View style={[styles.postThumb, styles.skeleton]} />
        <View style={{ flex: 1 }}>
          <View style={[styles.skeletonLine, { width: "75%", height: 12 }]} />
          <View
            style={[
              styles.skeletonLine,
              { width: "50%", height: 12, marginTop: 6 },
            ]}
          />
        </View>
      </View>
    );
  }

  if (!data) return null;

  return (
    <TouchableOpacity
      style={[
        styles.postPreview,
        sentByMe ? styles.postPreviewSent : styles.postPreviewReceived,
      ]}
      onPress={() =>
        router.push(`/post/${encodeURIComponent(data.id)}` as never)
      }
      activeOpacity={0.8}
    >
      <View style={styles.postThumb}>
        {data.thumbnailUrl ? (
          <Image
            source={{ uri: data.thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.postThumbPlaceholder}>
            <DocumentText
              size={16}
              color={sentByMe ? "#fff" : "#B76217"}
              variant="Bulk"
            />
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            styles.postTitle,
            { color: sentByMe ? "#FFFFFF" : "#111111" },
          ]}
          numberOfLines={2}
        >
          {data.title}
        </Text>
        <Text
          style={[
            styles.postSubtitle,
            { color: sentByMe ? "rgba(255,255,255,0.7)" : "#9CA3AF" },
          ]}
        >
          View document
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onLongPress,
}: {
  message: Message;
  onLongPress: (msg: Message) => void;
}) {
  const { sentByMe, text, timestamp, status, isUnsent, attachments } = message;
  const hasAttachments = (attachments?.length ?? 0) > 0;
  const gifUrl = !isUnsent ? extractGifUrl(text) : null;
  const postId = !isUnsent && !gifUrl ? extractPostId(text) : null;
  const displayText = isUnsent
    ? null
    : gifUrl
      ? text?.replace(gifUrl, "").trim() || null
      : postId
        ? stripPostUrl(text ?? "") || null
        : text;

  const canInteract = !isUnsent && (!!text || sentByMe);

  return (
    <View
      style={[
        styles.msgRow,
        sentByMe ? styles.msgRowSent : styles.msgRowReceived,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.msgBubbleWrap,
          { maxWidth: "78%" },
          sentByMe ? { alignItems: "flex-end" } : { alignItems: "flex-start" },
        ]}
        onLongPress={canInteract ? () => onLongPress(message) : undefined}
        delayLongPress={300}
        activeOpacity={0.85}
      >
        {hasAttachments &&
          attachments!.map((att) => (
            <View
              key={att.id}
              style={[
                styles.attachBubble,
                sentByMe
                  ? styles.attachBubbleSent
                  : styles.attachBubbleReceived,
              ]}
            >
              <View
                style={[
                  styles.attachIcon,
                  sentByMe ? styles.attachIconSent : styles.attachIconReceived,
                ]}
              >
                <DocumentText
                  size={16}
                  color={sentByMe ? "#fff" : "#B76217"}
                  variant="Bulk"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[
                    styles.attachName,
                    { color: sentByMe ? "#FFFFFF" : "#111111" },
                  ]}
                  numberOfLines={1}
                >
                  {att.fileName ?? att.type}
                </Text>
                {att.fileSize && (
                  <Text
                    style={[
                      styles.attachSize,
                      { color: sentByMe ? "rgba(255,255,255,0.6)" : "#9CA3AF" },
                    ]}
                  >
                    {att.fileSize}
                  </Text>
                )}
              </View>
            </View>
          ))}

        {postId && <PostLinkPreview postId={postId} sentByMe={sentByMe} />}

        {gifUrl && (
          <View style={styles.gifWrap}>
            <Image
              source={{ uri: gifUrl.replace(/\.mp4$/, ".gif") }}
              style={styles.gifImage}
              resizeMode="contain"
            />
            <View style={styles.gifBadge}>
              <Text style={styles.gifBadgeText}>GIF</Text>
            </View>
          </View>
        )}

        {displayText && (
          <View
            style={[
              styles.textBubble,
              sentByMe ? styles.textBubbleSent : styles.textBubbleReceived,
            ]}
          >
            <Text
              style={[
                styles.msgText,
                sentByMe ? styles.msgTextSent : styles.msgTextReceived,
              ]}
            >
              {displayText}
            </Text>
          </View>
        )}

        {isUnsent && (
          <View style={styles.unsentBubble}>
            <Text style={styles.unsentText}>Message unsent</Text>
          </View>
        )}

        <View
          style={[
            styles.msgMeta,
            sentByMe
              ? { flexDirection: "row-reverse" }
              : { flexDirection: "row" },
          ]}
        >
          <Text style={styles.msgTime}>{formatTime(timestamp)}</Text>
          {sentByMe && status && status !== "sending" && (
            <TickCircle
              size={11}
              color={status === "read" ? "#E1761F" : "#9CA3AF"}
              variant={status === "read" ? "Bold" : "Linear"}
            />
          )}
          {sentByMe && status === "sending" && (
            <ActivityIndicator size={11} color="#9CA3AF" />
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -5,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ]),
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── GifPickerSheet ───────────────────────────────────────────────────────────

function GifPickerSheet({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const colorScheme = useColorScheme();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGifs = useCallback((q: string) => {
    setLoading(true);
    const url = q
      ? `${WEB_URL}/api/gif?q=${encodeURIComponent(q)}`
      : `${WEB_URL}/api/gif`;
    fetch(url)
      .then((r) => r.json())
      .then((body: { gifs?: GifItem[] }) => setGifs(body.gifs ?? []))
      .catch(() => setGifs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadGifs("");
  }, [loadGifs]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadGifs(value.trim()), 400);
  };

  const { width: screenWidth } = useWindowDimensions();
  const numColumns = 3;
  const colWidth = Math.floor((screenWidth - 16 * 2 - 6 * (numColumns - 1)) / numColumns);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { height: "70%" }]}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Header */}
        <View style={styles.gifHeader}>
          <Text style={styles.gifTitle}>GIFs</Text>
          <Image
            source={
              colorScheme === "dark"
                ? require("../../assets/images/PoweredBy_200px-White_HorizText.png")
                : require("../../assets/images/PoweredBy_200px-Black_HorizText.png")
            }
            style={styles.giphyLogo}
            resizeMode="contain"
          />
        </View>

        {/* Search */}
        <View style={styles.gifSearchRow}>
          <View style={styles.gifSearchBar}>
            <SearchNormal1 size={15} color="#959595" variant="Linear" />
            <TextInput
              style={styles.gifInput}
              placeholder="Search GIFs…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>
        </View>

        {/* Grid */}
        {loading ? (
          <FlatList
            data={Array.from({ length: 12 }, (_, i) => i)}
            numColumns={numColumns}
            keyExtractor={(i) => String(i)}
            contentContainerStyle={styles.gifGrid}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={() => (
              <View
                style={[
                  styles.gifThumb,
                  styles.skeleton,
                  { width: colWidth, height: colWidth },
                ]}
              />
            )}
          />
        ) : gifs.length === 0 ? (
          <View style={styles.gifEmpty}>
            <Text style={styles.gifEmptyText}>
              {query ? "No GIFs found" : "GIFs unavailable"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            numColumns={numColumns}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.gifGrid}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.gifThumb, { width: colWidth }]}
                onPress={() => {
                  onSelect(item.mp4Url);
                  onClose();
                }}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: item.stillUrl }}
                  style={{ width: colWidth, height: colWidth }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── HeaderOptionsSheet ───────────────────────────────────────────────────────

function HeaderOptionsSheet({
  participant,
  onClose,
  onDeleteConversation,
}: {
  participant: Participant;
  onClose: () => void;
  onDeleteConversation: () => void;
}) {
  const router = useRouter();
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />

        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              onClose();
              router.push(
                `/user/${encodeURIComponent(participant.username)}` as never,
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.sheetActionIcon}>
              <Profile size={18} color="#111111" variant="Linear" />
            </View>
            <Text style={styles.sheetActionText}>View profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={onDeleteConversation}
            activeOpacity={0.7}
          >
            <View
              style={[styles.sheetActionIcon, { backgroundColor: "#FEF2F2" }]}
            >
              <Trash size={18} color="#DC2626" variant="Linear" />
            </View>
            <View>
              <Text style={[styles.sheetActionText, { color: "#DC2626" }]}>
                Delete conversation
              </Text>
              <Text style={styles.sheetActionSub}>
                Removes all messages for everyone
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.sheetCancel}>
          <TouchableOpacity
            style={styles.sheetCancelBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── ChatRoomScreen ───────────────────────────────────────────────────────────

export default function ChatRoomScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { token } = getAuth();

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  const draftRef = useRef("");
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchedRef = useRef(0);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchConversation = useCallback(
    async (silent = false) => {
      if (!conversationId) return;
      if (!silent) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const data = await gql<{
          conversation: { id: string; participant: Participant } | null;
          messages: RawMessage[];
        }>(
          GET_CONVERSATION_QUERY,
          { conversationId, limit: 60 },
          token ?? undefined,
        );
        if (!data.conversation) {
          if (!silent) setError("Conversation not found.");
          return;
        }
        setParticipant(data.conversation.participant);
        const parsed = (data.messages ?? []).map(parseRawMessage);
        setMessages(parsed);
        lastFetchedRef.current = Date.now();
      } catch (e) {
        if (!silent) setError("Failed to load conversation.");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [conversationId, token],
  );

  // ── Mark read ──────────────────────────────────────────────────────────────

  const markRead = useCallback(() => {
    if (!conversationId || !token) return;
    void gql(MARK_READ_MUTATION, { conversationId }, token);
  }, [conversationId, token]);

  // ── Polling for new messages ───────────────────────────────────────────────

  const pollMessages = useCallback(async () => {
    if (!conversationId || !token) return;
    try {
      const data = await gql<{
        conversation: { id: string; participant: Participant } | null;
        messages: RawMessage[];
      }>(GET_CONVERSATION_QUERY, { conversationId, limit: 60 }, token);
      if (!data.conversation) return;
      const parsed = (data.messages ?? []).map(parseRawMessage);
      setMessages((prev) => {
        // Only update if there are genuinely new messages
        const prevIds = new Set(prev.map((m) => m.id));
        const hasNew = parsed.some(
          (m) => !m.id.startsWith("temp-") && !prevIds.has(m.id),
        );
        if (
          !hasNew &&
          parsed.length === prev.filter((m) => !m.id.startsWith("temp-")).length
        ) {
          return prev;
        }
        // Merge: keep optimistic temp messages, replace real ones
        const realById = new Map(parsed.map((m) => [m.id, m]));
        const temps = prev.filter((m) => m.id.startsWith("temp-"));
        return [...parsed, ...temps];
      });
    } catch {
      // silently ignore poll errors
    }
  }, [conversationId, token]);

  useFocusEffect(
    useCallback(() => {
      void fetchConversation().then(() => markRead());
      pollRef.current = setInterval(() => void pollMessages(), 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [fetchConversation, markRead, pollMessages]),
  );

  // Scroll to end when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Send ───────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = draftRef.current.trim();
    if (!text || !conversationId || !token) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      text,
      sentByMe: true,
      timestamp: new Date(),
      status: "sending",
      attachments: [],
    };

    setMessages((prev) => [...prev, optimistic]);
    draftRef.current = "";
    setDraft("");

    try {
      const data = await gql<{ sendMessage: RawMessage }>(
        SEND_MESSAGE_MUTATION,
        { conversationId, text },
        token,
      );
      const msg = data.sendMessage;
      if (msg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? parseRawMessage(msg) : m)),
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  }, [conversationId, token]);

  // ── Message long-press actions ─────────────────────────────────────────────

  const handleLongPress = useCallback(
    (msg: Message) => {
      const hasCopy = !msg.isUnsent && !!msg.text;
      const hasUnsend = msg.sentByMe && !msg.isUnsent;

      const options: string[] = [];
      if (hasCopy) options.push("Copy Text");
      if (hasUnsend) options.push("Unsend");
      options.push("Cancel");

      Alert.alert(
        "Message",
        undefined,
        options.map((opt) => ({
          text: opt,
          style:
            opt === "Unsend"
              ? "destructive"
              : opt === "Cancel"
                ? "cancel"
                : "default",
          onPress: () => {
            if (opt === "Copy Text") {
              Clipboard.setString(msg.text ?? "");
            } else if (opt === "Unsend") {
              Alert.alert(
                "Unsend message?",
                "This removes the message for everyone in the conversation.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Unsend",
                    style: "destructive",
                    onPress: () => void handleUnsend(msg.id),
                  },
                ],
              );
            }
          },
        })),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleUnsend = async (messageId: string) => {
    if (!token) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isUnsent: true, text: null } : m,
      ),
    );
    try {
      await gql(UNSEND_MESSAGE_MUTATION, { messageId }, token);
    } catch {
      void fetchConversation(true);
    }
  };

  const handleDeleteConversation = () => {
    Alert.alert(
      "Delete conversation?",
      "All messages will be permanently removed for everyone. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setHeaderMenuOpen(false);
            if (!token) return;
            try {
              await gql(
                DELETE_CONVERSATION_MUTATION,
                { conversationId },
                token,
              );
              router.replace("/(tabs)/chat" as never);
            } catch {
              Alert.alert("Error", "Failed to delete conversation.");
            }
          },
        },
      ],
    );
  };

  // ── Grouped messages ───────────────────────────────────────────────────────

  const groups = useMemo(() => groupMessagesByDay(messages), [messages]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      {isLoading || !participant ? (
        <View style={styles.headerSkeleton}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
          <View style={styles.headerSkeletonAvatar} />
          <View>
            <View style={[styles.skeletonLine, { width: 120, height: 13 }]} />
            <View
              style={[
                styles.skeletonLine,
                { width: 80, height: 11, marginTop: 5 },
              ]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <ArrowLeft2 size={22} color="#111111" variant="Linear" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerParticipant}
            onPress={() =>
              router.push(
                `/user/${encodeURIComponent(participant.username)}` as never,
              )
            }
            activeOpacity={0.7}
          >
            {(() => {
              const { bg, fg } = avatarColors(participant.id);
              return (
                <View style={styles.headerAvatarWrap}>
                  <View style={[styles.headerAvatar, { backgroundColor: bg }]}>
                    {participant.avatar ? (
                      <Image
                        source={{ uri: participant.avatar }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={[styles.avatarText, { color: fg }]}>
                        {getInitials(participant.name)}
                      </Text>
                    )}
                  </View>
                  {participant.isOnline && <View style={styles.onlineDot} />}
                </View>
              );
            })()}
            <View>
              <Text style={styles.headerName} numberOfLines={1}>
                {participant.name}
              </Text>
              <Text style={styles.headerSub}>
                {participant.isOnline
                  ? "Active now"
                  : `@${participant.username}`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setHeaderMenuOpen(true)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <More size={20} color="#111111" variant="Linear" />
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {error ? (
          <View style={styles.errorCenter}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void fetchConversation()}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : isLoading ? (
          <View style={styles.msgList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.msgRow,
                  i % 3 === 2 ? styles.msgRowSent : styles.msgRowReceived,
                ]}
              >
                <View
                  style={[
                    styles.skeleton,
                    {
                      height: 36,
                      width: i % 3 === 2 ? 160 : 220,
                      borderRadius: 14,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={groups}
            keyExtractor={(g) => g.label}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
            renderItem={({ item: group }) => (
              <View style={styles.dayGroup}>
                {/* Date separator */}
                <View style={styles.dateSep}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateLabel}>{group.label}</Text>
                  <View style={styles.dateLine} />
                </View>
                {/* Messages */}
                <View style={styles.dayMessages}>
                  {group.messages.map((msg: Message) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onLongPress={handleLongPress}
                    />
                  ))}
                </View>
              </View>
            )}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Message…"
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={(t) => {
                draftRef.current = t;
                setDraft(t);
              }}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              onPress={() => setGifPickerOpen(true)}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <Text style={styles.gifBtn}>GIF</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
            onPress={() => void sendMessage()}
            disabled={!draft.trim()}
            activeOpacity={0.8}
          >
            <Send2 size={18} color="#FFFFFF" variant="Bold" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* GIF picker */}
      {gifPickerOpen && (
        <GifPickerSheet
          onClose={() => setGifPickerOpen(false)}
          onSelect={(url) => {
            draftRef.current = url;
            setDraft(url);
          }}
        />
      )}

      {/* Header options sheet */}
      {headerMenuOpen && participant && (
        <HeaderOptionsSheet
          participant={participant}
          onClose={() => setHeaderMenuOpen(false)}
          onDeleteConversation={handleDeleteConversation}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  headerParticipant: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatarWrap: { position: "relative" },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headerName: { fontSize: 14, fontWeight: "600", color: "#111111" },
  headerSub: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },

  headerSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerSkeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#E5E7EB",
  },

  avatarText: { fontSize: 13, fontWeight: "600" },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#1F9D75",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  skeleton: { backgroundColor: "#E5E7EB" },
  skeletonLine: { borderRadius: 6, backgroundColor: "#E5E7EB" },

  msgList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },

  dayGroup: { marginBottom: 16 },
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  dayMessages: { gap: 6 },

  msgRow: { flexDirection: "row" },
  msgRowSent: { justifyContent: "flex-end" },
  msgRowReceived: { justifyContent: "flex-start" },
  msgBubbleWrap: { gap: 3 },

  textBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  textBubbleSent: { backgroundColor: "#E1761F", borderBottomRightRadius: 5 },
  textBubbleReceived: { backgroundColor: "#F3F4F6", borderBottomLeftRadius: 5 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextSent: { color: "#FFFFFF" },
  msgTextReceived: { color: "#111111" },

  unsentBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  unsentText: { fontSize: 13, fontStyle: "italic", color: "#9CA3AF" },

  msgMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  msgTime: { fontSize: 10, color: "#9CA3AF" },

  attachBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachBubbleSent: { backgroundColor: "rgba(255,255,255,0.2)" },
  attachBubbleReceived: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  attachIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  attachIconSent: { backgroundColor: "rgba(255,255,255,0.2)" },
  attachIconReceived: { backgroundColor: "#FFE6CF" },
  attachName: { fontSize: 12, fontWeight: "600" },
  attachSize: { fontSize: 10, marginTop: 2 },

  postPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    padding: 10,
    width: 220,
  },
  postPreviewSent: { backgroundColor: "#E1761F" },
  postPreviewReceived: {
    backgroundColor: "#F3F4F6",
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 5,
  },
  postThumb: {
    width: 52,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#D1D5DB",
    overflow: "hidden",
    flexShrink: 0,
  },
  postThumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  postTitle: { fontSize: 12, fontWeight: "600", lineHeight: 17 },
  postSubtitle: { fontSize: 11, marginTop: 4 },

  gifWrap: { position: "relative" },
  gifImage: {
    width: 180,
    height: 140,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  gifBadge: {
    position: "absolute",
    bottom: 6,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  gifBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  typingRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 6,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#9CA3AF",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 4 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#111111",
    maxHeight: 100,
    paddingTop: 0,
    paddingBottom: 0,
  },
  gifBtn: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.5,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E1761F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnDisabled: { opacity: 0.35 },

  // Sheets
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 10,
    marginBottom: 8,
  },

  sheetActions: { paddingHorizontal: 12, paddingTop: 4 },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  sheetActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActionText: { fontSize: 14, fontWeight: "500", color: "#111111" },
  sheetActionSub: { fontSize: 12, color: "#DC2626", marginTop: 2 },
  sheetCancel: { paddingHorizontal: 12, paddingTop: 8 },
  sheetCancelBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  sheetCancelText: { fontSize: 14, fontWeight: "600", color: "#111111" },

  // GIF picker
  gifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  gifTitle: { fontSize: 14, fontWeight: "600", color: "#111111" },
  giphyLogo: { height: 16, width: 120 },
  gifSearchRow: { paddingHorizontal: 16, paddingBottom: 10 },
  gifSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  gifInput: { flex: 1, fontSize: 14, color: "#111111" },
  gifGrid: { paddingHorizontal: 16, gap: 6 },
  gifThumb: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  gifEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  gifEmptyText: { fontSize: 14, color: "#9CA3AF" },

  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#E1761F",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
});
