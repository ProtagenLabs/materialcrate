"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Send2, CloseCircle, Messages2, DocumentText,
  Edit2, TickCircle, SearchNormal1, Link21, Trash,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import {
  subscribeToChatMessages,
  subscribeToChatTyping,
  emitTyping,
  type ChatMessageEvent,
  type ChatTypingEvent,
} from "@/app/lib/post-activity-realtime";

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

type ChatConversation = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  isOnline: boolean;
  isSentByMe: boolean;
  isRead: boolean;
};

type Participant = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
};

type ChatUserSuggestion = {
  id: string;
  displayName: string;
  username: string;
  profilePicture: string | null;
  hasExistingConversation: boolean;
  isFollowing: boolean;
};

type PostPickerItem = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string;
};

type GifItem = { id: string; stillUrl: string; mp4Url: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#FFE6CF] text-[#B76217]",
  "bg-[#E8EBFF] text-[#4150D8]",
  "bg-[#DBF5EC] text-[#197356]",
  "bg-[#FFE0E8] text-[#B33F61]",
  "bg-[#EEE8FF] text-[#684AD9]",
  "bg-amber-100 text-amber-700",
];
function avatarColor(id: string) { return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length]; }
function getInitials(name: string) {
  return (name ?? "").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
function formatRelTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "now";
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatTime(d: Date) { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
function formatDaySep(d: Date) {
  const now = new Date();
  const diff = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function groupByDay(msgs: Message[]) {
  const map = new Map<string, Message[]>();
  for (const m of msgs) {
    const k = formatDaySep(m.timestamp);
    (map.get(k) ?? (map.set(k, []), map.get(k)!)).push(m);
  }
  return Array.from(map.entries()).map(([label, messages]) => ({ label, messages }));
}
function normaliseStatus(raw: string | null | undefined): MessageStatus | undefined {
  if (!raw) return undefined;
  const l = raw.toLowerCase();
  if (l === "sent") return "sent";
  if (l === "delivered") return "delivered";
  if (l === "read") return "read";
}
const POST_URL_RE = /(?:https?:\/\/[^\s]*)?\/post\/([a-zA-Z0-9_-]+)/;
function extractPostId(text: string | null) { return text?.match(POST_URL_RE)?.[1] ?? null; }
function stripPostUrl(text: string) { return text.replace(/(?:https?:\/\/[^\s]*)?\/post\/[a-zA-Z0-9_-]+/g, "").trim(); }
function extractGifUrl(text: string | null) { return text?.match(/https:\/\/media\d*\.giphy\.com\/\S+/)?.[0] ?? null; }
function isGifMp4(url: string) { return url.endsWith(".mp4"); }

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ id, name, avatar, size = 10 }: { id: string; name: string; avatar: string | null; size?: number }) {
  const cls = `h-${size} w-${size} shrink-0 rounded-full overflow-hidden`;
  if (avatar) return <Image src={avatar} alt={name ?? ""} width={size * 4} height={size * 4} className={`${cls} object-cover`} unoptimized />;
  return <div className={`${cls} flex items-center justify-center text-xs font-semibold ${avatarColor(id)}`}>{getInitials(name)}</div>;
}

// ─── Post link preview ────────────────────────────────────────────────────────

const postCache = new Map<string, { id: string; title: string; thumbnailUrl: string | null } | null>();

function PostLinkPreview({ postId, sentByMe }: { postId: string; sentByMe: boolean }) {
  const router = useRouter();
  const cached = postCache.get(postId);
  const [data, setData] = useState<typeof cached | "loading">(cached !== undefined ? cached : "loading");

  useEffect(() => {
    if (data !== "loading") return;
    let cancelled = false;
    fetch(`/api/posts/${encodeURIComponent(postId)}`).then(r => r.json()).then(body => {
      if (cancelled) return;
      const p = body?.post ?? null;
      const result = p ? { id: p.id, title: p.title, thumbnailUrl: p.thumbnailUrl ?? null } : null;
      postCache.set(postId, result);
      setData(result);
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [postId, data]);

  if (data === "loading") return (
    <div className={`flex items-center gap-2.5 rounded-2xl p-2.5 ${sentByMe ? "bg-[#E1761F]" : "border border-edge bg-surface-high"}`}>
      <div className={`h-14 w-10 shrink-0 animate-pulse rounded-xl ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
      <div className="flex-1 space-y-1.5">
        <div className={`h-2.5 w-3/4 animate-pulse rounded-full ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
        <div className={`h-2.5 w-1/2 animate-pulse rounded-full ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
      </div>
    </div>
  );
  if (!data) return null;
  return (
    <button type="button" onClick={() => router.push(`/post/${encodeURIComponent(data.id)}`)}
      className={`flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition-opacity active:opacity-70 ${sentByMe ? "bg-[#E1761F]" : "border border-edge bg-surface-high"}`}>
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-xl bg-black/10">
        {data.thumbnailUrl
          ? <Image src={`/api/posts/thumbnail?postId=${encodeURIComponent(data.id)}`} alt={data.title} fill sizes="40px" unoptimized className="object-cover object-top" />
          : <div className="flex h-full w-full items-center justify-center"><DocumentText size={16} color={sentByMe ? "#fff" : "#B76217"} variant="Bulk" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`line-clamp-2 text-xs font-semibold ${sentByMe ? "text-white" : "text-ink"}`}>{data.title}</p>
        <p className={`mt-1 text-[10px] ${sentByMe ? "text-white/70" : "text-ink-3"}`}>View document</p>
      </div>
    </button>
  );
}

// ─── Attachment bubble ────────────────────────────────────────────────────────

function AttachmentBubble({ att, sentByMe }: { att: MessageAttachment; sentByMe: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ${sentByMe ? "bg-white/20" : "border border-edge bg-surface"}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${sentByMe ? "bg-white/20" : "bg-[#FFE6CF]"}`}>
        <DocumentText size={16} color={sentByMe ? "#fff" : "#B76217"} variant="Bulk" />
      </div>
      <div className="min-w-0">
        <p className={`truncate text-xs font-semibold ${sentByMe ? "text-white" : "text-ink"}`}>{att.fileName ?? att.type}</p>
        {att.fileSize && <p className={`text-[10px] ${sentByMe ? "text-white/60" : "text-ink-3"}`}>{att.fileSize}</p>}
      </div>
    </div>
  );
}

// ─── GIF picker (inline) ──────────────────────────────────────────────────────

function GifPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gif${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const body = await res.json() as { gifs?: GifItem[] };
      setGifs(body.gifs ?? []);
    } catch { setGifs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(""); }, [load]);

  const handleSearch = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(v.trim()), 400);
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5 shrink-0">
        <button type="button" aria-label="Back" onClick={onClose} className="rounded-full p-1 hover:bg-black/5"><ArrowLeft size={18} color="var(--ink)" /></button>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface-high px-3 py-1.5">
          <SearchNormal1 size={14} color="var(--ink-3)" />
          <input autoFocus type="search" placeholder="Search GIFs…" value={query}
            onChange={e => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none" />
        </div>
        <div className="flex items-center gap-1">
          <Image src="/PoweredBy_200px-Black_HorizText.png" alt="GIPHY" width={80} height={7} className="h-3 w-auto dark:hidden" />
          <Image src="/PoweredBy_200px-White_HorizText.png" alt="GIPHY" width={80} height={7} className="h-3 w-auto hidden dark:block" />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {loading ? (
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-video animate-pulse rounded-xl bg-surface-high" />)}
          </div>
        ) : gifs.length === 0 ? (
          <p className="pt-8 text-center text-xs text-ink-3">{query ? "No GIFs found" : "GIFs unavailable"}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {gifs.map(gif => (
              <button key={gif.id} type="button" onClick={() => { onSelect(gif.mp4Url); onClose(); }}
                className="relative block w-full overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.stillUrl} alt="" loading="lazy" className="w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post link picker (inline) ────────────────────────────────────────────────

function PostPicker({ username, onSelect, onClose }: { username: string; onSelect: (url: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const [myPosts, setMyPosts] = useState<PostPickerItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostPickerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/posts?author=${encodeURIComponent(username)}&limit=30`).then(r => r.json()),
      fetch("/api/archive").then(r => r.json()),
    ]).then(([postsData, archiveData]) => {
      if (cancelled) return;
      setMyPosts((postsData.posts ?? []).map((p: { id: string; title: string; thumbnailUrl?: string | null; author?: { displayName?: string | null } | null }) => ({
        id: p.id, title: p.title, thumbnailUrl: p.thumbnailUrl ?? null, authorName: p.author?.displayName ?? "",
      })));
      setSavedPosts((archiveData.archive?.savedPosts ?? []).map((sp: { post: { id: string; title: string; thumbnailUrl?: string | null; author?: { displayName?: string | null } | null } }) => ({
        id: sp.post.id, title: sp.post.title, thumbnailUrl: sp.post.thumbnailUrl ?? null, authorName: sp.post.author?.displayName ?? "",
      })));
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  const items = tab === "mine" ? myPosts : savedPosts;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5 shrink-0">
        <button type="button" aria-label="Back" onClick={onClose} className="rounded-full p-1 hover:bg-black/5"><ArrowLeft size={18} color="var(--ink)" /></button>
        <p className="text-sm font-semibold text-ink">Share a post</p>
      </div>
      <div className="flex gap-1.5 px-3 py-2 shrink-0">
        {(["mine", "saved"] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${tab === t ? "bg-[#E1761F] text-white" : "bg-surface-high text-ink-2"}`}>
            {t === "mine" ? "My Posts" : "Saved"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-2">
                <div className="h-12 w-9 shrink-0 animate-pulse rounded-lg bg-surface-high" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-surface-high" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-surface-high" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="pt-6 text-center text-xs text-ink-3">{tab === "mine" ? "No posts yet" : "No saved posts"}</p>
        ) : items.map(item => (
          <button key={item.id} type="button"
            onClick={() => { onSelect(`${window.location.origin}/post/${encodeURIComponent(item.id)}`); onClose(); }}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-high active:opacity-70">
            <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-high">
              {item.thumbnailUrl
                ? <Image src={`/api/posts/thumbnail?postId=${encodeURIComponent(item.id)}`} alt={item.title} fill sizes="36px" unoptimized className="object-cover object-top" />
                : <div className="flex h-full w-full items-center justify-center"><DocumentText size={14} color="#B76217" variant="Bulk" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-semibold text-ink">{item.title}</p>
              {item.authorName && <p className="mt-0.5 text-[10px] text-ink-3">{item.authorName}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message context menu ─────────────────────────────────────────────────────

function MessageMenu({ msg, onClose, onCopy, onUnsend }: {
  msg: Message; onClose: () => void; onCopy: () => void; onUnsend: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className={`absolute z-30 bottom-full mb-1 flex flex-col rounded-2xl bg-surface border border-edge shadow-lg overflow-hidden min-w-36 ${msg.sentByMe ? "right-0" : "left-0"}`}>
        {msg.text && (
          <button type="button" onClick={onCopy}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-ink hover:bg-surface-high transition-colors text-left">
            Copy
          </button>
        )}
        {msg.sentByMe && (
          <button type="button" onClick={onUnsend}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
            <Trash size={14} color="#ef4444" />
            Unsend
          </button>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = "convos" | "compose" | "messages";

export default function DesktopChatPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();

  // ── Navigation state ────────────────────────────────────────────────────────
  const [view, setView] = useState<View>("convos");

  // ── Conversations list ──────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoadingConvos, setIsLoadingConvos] = useState(false);
  const [search, setSearch] = useState("");

  // ── Compose ─────────────────────────────────────────────────────────────────
  const [composeSearch, setComposeSearch] = useState("");
  const [suggestions, setSuggestions] = useState<ChatUserSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [startingConvoId, setStartingConvoId] = useState<string | null>(null);

  // ── Messages view ───────────────────────────────────────────────────────────
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTypingRemote, setIsTypingRemote] = useState(false);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [pendingUnsendId, setPendingUnsendId] = useState<string | null>(null);

  const draftRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Fetch conversations ─────────────────────────────────────────────────────
  const fetchConversations = useCallback(() => {
    if (!user?.id) return;
    setIsLoadingConvos(true);
    fetch("/api/chat", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.conversations)) {
          setConversations(data.conversations.map((conv: {
            id: string;
            participant: { id: string; name: string; username: string; avatar: string | null; isOnline: boolean };
            lastMessage: string | null;
            lastMessageTime: string | null;
            lastMessageSentByMe: boolean;
            lastMessageIsRead: boolean;
            unreadCount: number;
          }) => ({
            id: conv.id,
            name: conv.participant?.name ?? "",
            username: conv.participant?.username ?? "",
            avatar: conv.participant?.avatar ?? null,
            isOnline: conv.participant?.isOnline ?? false,
            lastMessage: conv.lastMessage ?? null,
            lastMessageTime: conv.lastMessageTime ?? null,
            unreadCount: conv.unreadCount ?? 0,
            isSentByMe: conv.lastMessageSentByMe ?? false,
            isRead: conv.lastMessageIsRead ?? false,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingConvos(false));
  }, [user?.id]);

  useEffect(() => { if (isOpen) fetchConversations(); }, [isOpen, fetchConversations]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => fetchConversations();
    window.addEventListener("mc:chat:new-message", handler);
    return () => window.removeEventListener("mc:chat:new-message", handler);
  }, [isOpen, fetchConversations]);

  useEffect(() => {
    if (view !== "compose") return;
    setIsLoadingSuggestions(true);
    const q = composeSearch.trim();
    const url = `/api/chat/users${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    fetch(url, { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data?.users)) setSuggestions(data.users); })
      .catch(() => {})
      .finally(() => setIsLoadingSuggestions(false));
  }, [view, composeSearch]);

  const openConversation = useCallback((convId: string) => {
    setActiveConvId(convId);
    setParticipant(null);
    setMessages([]);
    setDraft("");
    draftRef.current = "";
    setView("messages");
  }, []);

  const startConversation = useCallback(async (userId: string) => {
    setStartingConvoId(userId);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data?.conversation?.id) openConversation(data.conversation.id);
    } catch {} finally { setStartingConvoId(null); }
  }, [openConversation]);

  useEffect(() => {
    if (!activeConvId) return;
    setIsLoadingMessages(true);
    fetch(`/api/chat/${activeConvId}`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        setParticipant(data.participant ?? null);
        setMessages((data.messages ?? []).map((m: {
          id: string; text: string | null; sentByMe: boolean; timestamp: string;
          status: string | null; isUnsent: boolean; attachments?: MessageAttachment[];
        }) => ({ ...m, timestamp: new Date(m.timestamp), status: normaliseStatus(m.status), attachments: m.attachments ?? [] })));
        void fetch(`/api/chat/${activeConvId}`, { method: "PATCH" });
      })
      .catch(() => {})
      .finally(() => setIsLoadingMessages(false));
  }, [activeConvId]);

  useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages.length, scrollToBottom]);
  useEffect(() => { scrollToBottom(); }, [isTypingRemote, scrollToBottom]);

  useEffect(() => {
    if (!activeConvId || !user) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void subscribeToChatMessages(activeConvId, (event: ChatMessageEvent) => {
      if (event.senderId === user.id) return;
      setMessages(prev => {
        if (prev.some(m => m.id === event.message.id)) return prev;
        return [...prev, {
          id: event.message.id, text: event.message.text, sentByMe: false,
          timestamp: new Date(event.message.timestamp),
          status: normaliseStatus(event.message.status),
          isUnsent: event.message.isUnsent, attachments: event.message.attachments ?? [],
        }];
      });
      void fetch(`/api/chat/${activeConvId}`, { method: "PATCH" });
    }).then(unsub => { if (cancelled) unsub(); else cleanups.push(unsub); });

    void subscribeToChatTyping(activeConvId, (event: ChatTypingEvent) => {
      if (event.senderId === user.id) return;
      setIsTypingRemote(event.isTyping);
      if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
      if (event.isTyping) remoteTypingTimeoutRef.current = setTimeout(() => setIsTypingRemote(false), 4000);
    }).then(unsub => { if (cancelled) unsub(); else cleanups.push(unsub); });

    return () => { cancelled = true; cleanups.forEach(fn => fn()); };
  }, [activeConvId, user]);
  const stopTyping = useCallback(() => {
    if (!activeConvId || !user) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    void emitTyping(activeConvId, user.id, false);
  }, [activeConvId, user]);

  const sendMessage = useCallback(async () => {
    const text = draftRef.current.trim();
    if (!text || !activeConvId || isSending) return;
    stopTyping();
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Message = { id: tempId, text, sentByMe: true, timestamp: new Date(), status: "sending", attachments: [] };
    setMessages(prev => [...prev, optimistic]);
    draftRef.current = "";
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsSending(true);
    try {
      const res = await fetch(`/api/chat/${activeConvId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      const msg = body?.message;
      if (res.ok && msg) {
        setMessages(prev => prev.map(m => m.id === tempId ? {
          id: msg.id, text: msg.text, sentByMe: true, timestamp: new Date(msg.timestamp),
          status: normaliseStatus(msg.status), isUnsent: msg.isUnsent, attachments: msg.attachments ?? [],
        } : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        draftRef.current = text; setDraft(text);
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      draftRef.current = text; setDraft(text);
    } finally { setIsSending(false); inputRef.current?.focus(); }
  }, [activeConvId, isSending, stopTyping]);

  const unsend = useCallback(async (msgId: string) => {
    if (!activeConvId) return;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isUnsent: true, text: null } : m));
    try { await fetch(`/api/chat/${activeConvId}/messages/${encodeURIComponent(msgId)}`, { method: "DELETE" }); } catch {}
    setPendingUnsendId(null);
    setMenuMsg(null);
  }, [activeConvId]);

  const deleteConversation = useCallback(async () => {
    if (!activeConvId) return;
    try { await fetch(`/api/chat/${activeConvId}`, { method: "DELETE" }); } catch {}
    setActiveConvId(null); setView("convos"); fetchConversations();
  }, [activeConvId, fetchConversations]);

  const goBack = () => {
    if (view === "messages") { setActiveConvId(null); setParticipant(null); setMessages([]); setView("convos"); }
    else if (view === "compose") { setView("convos"); setComposeSearch(""); }
  };

  const filteredConvos = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.username.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupByDay(messages);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-4 z-50 hidden lg:flex flex-col w-80 h-130 rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden">

      {view === "convos" && (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-edge shrink-0">
            <Messages2 size={18} color="var(--ink)" />
            <span className="flex-1 text-sm font-semibold text-ink">Messages</span>
            <button type="button" onClick={() => setView("compose")} title="New message"
              className="rounded-full p-1.5 hover:bg-black/5 transition-colors">
              <Edit2 size={16} color="var(--ink-2)" />
            </button>
            <button type="button" onClick={onClose} title="Close"
              className="rounded-full p-1.5 hover:bg-black/5 transition-colors">
              <CloseCircle size={18} color="var(--ink-3)" />
            </button>
          </div>
          <div className="px-3 py-2 shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-surface-high px-3 py-1.5">
              <SearchNormal1 size={14} color="var(--ink-3)" />
              <input type="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none" />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoadingConvos && !conversations.length && (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-high" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded-full bg-surface-high" />
                      <div className="h-2.5 w-40 animate-pulse rounded-full bg-surface-high" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isLoadingConvos && filteredConvos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                <Messages2 size={28} color="var(--ink-3)" />
                <p className="text-sm text-ink-3">{search ? "No results" : "No conversations yet"}</p>
              </div>
            )}
            {filteredConvos.map(conv => (
              <button key={conv.id} type="button" onClick={() => openConversation(conv.id)}
                className="flex w-full items-center gap-3 px-3 py-3 hover:bg-surface-high transition-colors text-left">
                <div className="relative shrink-0">
                  <Avatar id={conv.id} name={conv.name} avatar={conv.avatar} size={10} />
                  {conv.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#1F9D75] border-2 border-surface" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`truncate text-sm ${conv.unreadCount > 0 ? "font-semibold text-ink" : "font-medium text-ink"}`}>{conv.name}</p>
                    <span className={`shrink-0 text-[10px] ${conv.unreadCount > 0 ? "font-semibold text-[#E1761F]" : "text-ink-3"}`}>{formatRelTime(conv.lastMessageTime)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      {conv.isSentByMe && <TickCircle size={12} color={conv.isRead ? "#E1761F" : "#959595"} variant={conv.isRead ? "Bold" : "Linear"} className="shrink-0" />}
                      <p className={`truncate text-xs ${conv.unreadCount > 0 ? "font-medium text-ink" : "text-ink-3"}`}>{conv.lastMessage ?? ""}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 flex min-w-4 h-4 items-center justify-center rounded-full bg-[#E1761F] px-1 text-[9px] font-bold text-white">{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {view === "compose" && (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-edge shrink-0">
            <button type="button" aria-label="Back" onClick={goBack} className="rounded-full p-1 hover:bg-black/5"><ArrowLeft size={18} color="var(--ink)" /></button>
            <span className="flex-1 text-sm font-semibold text-ink">New message</span>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5"><CloseCircle size={18} color="var(--ink-3)" /></button>
          </div>
          <div className="px-3 py-2 shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-surface-high px-3 py-1.5">
              <SearchNormal1 size={14} color="var(--ink-3)" />
              <input autoFocus type="search" placeholder="Search people…" value={composeSearch}
                onChange={e => setComposeSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none" />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoadingSuggestions && !suggestions.length && (
              <div className="space-y-0">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-high" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-surface-high" />
                      <div className="h-2.5 w-16 animate-pulse rounded-full bg-surface-high" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {suggestions.map(u => (
              <button key={u.id} type="button" disabled={startingConvoId === u.id}
                onClick={() => void startConversation(u.id)}
                className="flex w-full items-center gap-3 px-3 py-3 hover:bg-surface-high transition-colors text-left disabled:opacity-60">
                <Avatar id={u.id} name={u.displayName} avatar={u.profilePicture} size={10} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{u.displayName}</p>
                  <p className="truncate text-xs text-ink-3">@{u.username}</p>
                </div>
                {u.hasExistingConversation && <span className="shrink-0 rounded-full bg-surface-high px-2 py-0.5 text-[9px] font-semibold text-ink-2">Recent</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {view === "messages" && (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-edge shrink-0">
            <button type="button" aria-label="Back" onClick={goBack} className="rounded-full p-1 hover:bg-black/5"><ArrowLeft size={18} color="var(--ink)" /></button>
            {participant ? (
              <button type="button" onClick={() => router.push(`/user/${encodeURIComponent(participant.username)}`)}
                className="flex flex-1 items-center gap-2.5 min-w-0 rounded-xl py-0.5 transition-opacity active:opacity-60">
                <div className="relative shrink-0">
                  <Avatar id={participant.id} name={participant.name} avatar={participant.avatar} size={8} />
                  {participant.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#1F9D75] border-2 border-surface" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{participant.name}</p>
                  <p className="text-[10px] text-ink-3">{participant.isOnline ? "Active now" : `@${participant.username}`}</p>
                </div>
              </button>
            ) : <div className="flex-1" />}
            <button type="button" onClick={() => { if (confirm("Delete conversation?")) void deleteConversation(); }}
              title="Delete conversation" className="rounded-full p-1.5 hover:bg-red-50 transition-colors">
              <Trash size={15} color="#ef4444" />
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5"><CloseCircle size={18} color="var(--ink-3)" /></button>
          </div>

          <div className="relative flex-1 min-h-0">
            <div className="h-full overflow-y-auto px-3 py-3 flex flex-col gap-3">
              {isLoadingMessages && (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`flex ${i % 3 === 2 ? "justify-end" : "justify-start"}`}>
                      <div className={`h-8 animate-pulse rounded-2xl bg-surface-high ${i % 3 === 2 ? "w-36" : "w-48"}`} />
                    </div>
                  ))}
                </div>
              )}
              {groups.map(group => (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 py-1">
                    <div className="h-px flex-1 bg-edge" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-ink-3">{group.label}</span>
                    <div className="h-px flex-1 bg-edge" />
                  </div>
                  {group.messages.map(msg => {
                    const gifUrl = !msg.isUnsent ? extractGifUrl(msg.text) : null;
                    const postId = !msg.isUnsent && !gifUrl ? extractPostId(msg.text) : null;
                    const displayText = gifUrl ? (msg.text?.replace(gifUrl, "").trim() || null)
                      : postId ? (msg.text ? stripPostUrl(msg.text) : null) : msg.text;
                    const hasAtts = msg.attachments && msg.attachments.length > 0;

                    return (
                      <div key={msg.id} className={`flex ${msg.sentByMe ? "justify-end" : "justify-start"}`}>
                        {msg.isUnsent ? (
                          <div className="rounded-2xl border border-edge px-3 py-2">
                            <p className="text-xs italic text-ink-3">Message unsent</p>
                          </div>
                        ) : (
                          <div className={`relative flex flex-col gap-1 max-w-[78%] min-w-0 ${msg.sentByMe ? "items-end" : "items-start"}`}>
                            {hasAtts && msg.attachments!.map(att => <AttachmentBubble key={att.id} att={att} sentByMe={msg.sentByMe} />)}
                            {postId && <PostLinkPreview postId={postId} sentByMe={msg.sentByMe} />}
                            {gifUrl && (
                              <div className="overflow-hidden rounded-2xl">
                                {isGifMp4(gifUrl)
                                  ? <video src={gifUrl} autoPlay loop muted playsInline className="max-w-full rounded-2xl" />
                                  // eslint-disable-next-line @next/next/no-img-element
                                  : <img src={gifUrl} alt="GIF" className="max-w-full rounded-2xl" loading="lazy" />}
                              </div>
                            )}
                            {displayText && (
                              <button type="button"
                                onContextMenu={e => { e.preventDefault(); setMenuMsg(msg); }}
                                className={`rounded-[14px] px-3 py-2 text-sm leading-relaxed break-all text-left ${msg.sentByMe ? "bg-[#E1761F] text-white rounded-br-sm" : "bg-surface-high text-ink rounded-bl-sm"}`}>
                                {displayText}
                              </button>
                            )}
                            <div className={`flex items-center gap-1 px-1 ${msg.sentByMe ? "flex-row-reverse" : "flex-row"}`}>
                              <span className="text-[9px] text-ink-3">{formatTime(msg.timestamp)}</span>
                              {msg.sentByMe && msg.status && msg.status !== "sending" && (
                                <TickCircle size={11} color={msg.status === "read" ? "#E1761F" : "var(--ink-3)"} variant={msg.status === "read" ? "Bold" : "Linear"} />
                              )}
                            </div>
                            {menuMsg?.id === msg.id && (
                              <MessageMenu msg={msg} onClose={() => setMenuMsg(null)}
                                onCopy={() => { void navigator.clipboard.writeText(msg.text ?? ""); setMenuMsg(null); }}
                                onUnsend={() => { setPendingUnsendId(msg.id); setMenuMsg(null); }} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {isTypingRemote && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-high px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showGifPicker && (
              <GifPicker
                onSelect={url => { draftRef.current = url; setDraft(url); }}
                onClose={() => setShowGifPicker(false)}
              />
            )}
            {showPostPicker && user?.username && (
              <PostPicker
                username={user.username}
                onSelect={url => { draftRef.current = url; setDraft(url); if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 96)}px`; inputRef.current.focus(); } }}
                onClose={() => setShowPostPicker(false)}
              />
            )}
          </div>

          {pendingUnsendId && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 rounded-2xl">
              <div className="mx-4 rounded-2xl bg-surface p-4 shadow-xl">
                <p className="text-sm font-semibold text-ink">Unsend message?</p>
                <p className="mt-1 text-xs text-ink-3">This removes it for everyone.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setPendingUnsendId(null)}
                    className="flex-1 rounded-xl bg-surface-high py-2 text-xs font-semibold text-ink transition-opacity active:opacity-60">Cancel</button>
                  <button type="button" onClick={() => void unsend(pendingUnsendId)}
                    className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-semibold text-white transition-opacity active:opacity-70">Unsend</button>
                </div>
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-edge px-3 pb-3 pt-2">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 items-end gap-1.5 rounded-2xl bg-surface-high px-3 py-2">
                <textarea ref={inputRef} rows={1} placeholder="Message…" value={draft}
                  onChange={e => {
                    draftRef.current = e.target.value; setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
                    if (activeConvId && user) {
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      void emitTyping(activeConvId, user.id, true);
                      typingTimeoutRef.current = setTimeout(() => void emitTyping(activeConvId!, user.id, false), 2000);
                    }
                  }}
                  onBlur={stopTyping}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && navigator.maxTouchPoints === 0) { e.preventDefault(); void sendMessage(); } }}
                  className="max-h-24 flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none" />
                <button type="button" onClick={() => { setShowPostPicker(false); setShowGifPicker(v => !v); }}
                  className="mb-0.5 shrink-0 text-[10px] font-bold text-ink-3 transition-opacity hover:opacity-60">GIF</button>
                <button type="button" aria-label="Share post" onClick={() => { setShowGifPicker(false); setShowPostPicker(v => !v); }}
                  className="mb-0.5 shrink-0 transition-opacity hover:opacity-60">
                  <Link21 size={16} color="var(--ink-3)" />
                </button>
              </div>
              <button type="button" aria-label="Send message" onClick={() => void sendMessage()} disabled={!draft.trim() || isSending}
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[#E1761F] transition-all active:scale-95 disabled:opacity-35">
                <Send2 size={16} color="white" variant="Bold" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
