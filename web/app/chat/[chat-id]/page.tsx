"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send2,
  DocumentText,
  TickCircle,
  Link21,
  More,
  Copy,
  Trash,
  ProfileDelete,
} from "iconsax-reactjs";
import { useAuth } from "../../lib/auth-client";
import {
  subscribeToChatMessages,
  subscribeToChatTyping,
  emitTyping,
  type ChatMessageEvent,
  type ChatTypingEvent,
} from "../../lib/post-activity-realtime";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#FFE6CF] text-[#B76217]",
  "bg-[#E8EBFF] text-[#4150D8]",
  "bg-[#DBF5EC] text-[#197356]",
  "bg-[#FFE0E8] text-[#B33F61]",
  "bg-[#EEE8FF] text-[#684AD9]",
  "bg-amber-100 text-amber-700",
];

function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
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
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfItemDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfItemDay.getTime()) /
      (1000 * 60 * 60 * 24),
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusTick({ status }: { status?: MessageStatus }) {
  if (!status || status === "sending") return null;
  return (
    <TickCircle
      size={12}
      color={status === "read" ? "#E1761F" : "var(--ink-3)"}
      variant={status === "read" ? "Bold" : "Linear"}
    />
  );
}

function AttachmentBubble({
  attachment,
  sentByMe,
}: {
  attachment: MessageAttachment;
  sentByMe: boolean;
}) {
  const name = attachment.fileName ?? attachment.type;
  const size = attachment.fileSize ?? null;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ${
        sentByMe ? "bg-white/20" : "border border-edge bg-surface"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          sentByMe ? "bg-white/20" : "bg-[#FFE6CF]"
        }`}
      >
        <DocumentText
          size={18}
          color={sentByMe ? "#fff" : "#B76217"}
          variant="Bulk"
        />
      </div>
      <div className="min-w-0">
        <p
          className={`truncate text-xs font-semibold ${
            sentByMe ? "text-white" : "text-ink"
          }`}
        >
          {name}
        </p>
        {size && (
          <p
            className={`text-[10px] ${sentByMe ? "text-white/60" : "text-ink-3"}`}
          >
            {size}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Post link helpers ────────────────────────────────────────────────────────

const POST_URL_RE = /(?:https?:\/\/[^\s]*)?\/post\/([a-zA-Z0-9_-]+)/;

function extractPostId(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(POST_URL_RE);
  return match?.[1] ?? null;
}

function stripPostUrl(text: string): string {
  return text.replace(/(?:https?:\/\/[^\s]*)?\/post\/[a-zA-Z0-9_-]+/g, "").trim();
}

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
    fetch(`/api/posts/${encodeURIComponent(postId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const post = body?.post ?? null;
        const result: PostPreviewData | null = post
          ? { id: post.id, title: post.title, thumbnailUrl: post.thumbnailUrl ?? null }
          : null;
        postPreviewCache.set(postId, result);
        setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, data]);

  if (data === "loading") {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-[18px] rounded-br-md p-2.5 ${
          sentByMe ? "bg-[#E1761F]" : "border border-edge bg-surface-high"
        }`}
      >
        <div className={`h-20 w-14 shrink-0 animate-pulse rounded-xl ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
        <div className="flex-1 space-y-1.5 pt-1">
          <div className={`h-3 w-3/4 animate-pulse rounded-full ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
          <div className={`h-3 w-1/2 animate-pulse rounded-full ${sentByMe ? "bg-white/20" : "bg-surface"}`} />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(`/post/${encodeURIComponent(data.id)}`)}
      className={`flex w-full items-center gap-2.5 rounded-[18px] rounded-br-md p-2.5 text-left transition-opacity active:opacity-70 ${
        sentByMe ? "bg-[#E1761F]" : "border border-edge bg-surface-high"
      }`}
    >
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-black/10">
        {data.thumbnailUrl ? (
          <Image
            src={`/api/posts/thumbnail?postId=${encodeURIComponent(data.id)}`}
            alt={data.title}
            fill
            sizes="56px"
            unoptimized
            className="object-cover object-top"
            onError={() => {}}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <DocumentText size={20} color={sentByMe ? "#fff" : "#B76217"} variant="Bulk" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-sm font-semibold ${
            sentByMe ? "text-white" : "text-ink"
          }`}
        >
          {data.title}
        </p>
        <p
          className={`mt-1 text-xs ${
            sentByMe ? "text-white/70" : "text-ink-3"
          }`}
        >
          View document
        </p>
      </div>
    </button>
  );
}

function extractGifUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https:\/\/media\d*\.giphy\.com\/\S+/);
  return m ? m[0] : null;
}

function isGifMp4(url: string): boolean {
  return url.endsWith(".mp4");
}

type MsgOptionsAnchor = { top: number; left: number; right: number; bottom: number };

function MessageOptionsMenu({
  isOpen,
  onClose,
  anchor,
  message,
  onCopy,
  onUnsend,
}: {
  isOpen: boolean;
  onClose: () => void;
  anchor: MsgOptionsAnchor | null;
  message: Message | null;
  onCopy: () => void;
  onUnsend: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<React.CSSProperties | undefined>();

  useEffect(() => {
    if (!anchor || !isOpen || typeof window === "undefined") {
      setPosition(undefined);
      return;
    }
    const gap = 6;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuH = menuRef.current?.offsetHeight ?? 100;
    const menuW = menuRef.current?.offsetWidth ?? 160;

    // Vertical: prefer below, fall back to above
    const fitsBelow = anchor.bottom + gap + menuH <= vh - pad;
    const top = fitsBelow
      ? Math.round(anchor.bottom + gap)
      : Math.max(pad, Math.round(anchor.top - menuH - gap));

    // Horizontal: right-align to the button first; if that pushes the left
    // edge off screen, left-align to the button's left edge instead.
    const rightFromEdge = Math.max(pad, Math.round(vw - anchor.right));
    const leftEdgeIfRightAligned = vw - rightFromEdge - menuW;

    let pos: React.CSSProperties;
    if (leftEdgeIfRightAligned >= pad) {
      pos = { top: `${top}px`, right: `${rightFromEdge}px` };
    } else {
      // Anchor to the left side of the button instead
      const leftFromEdge = Math.max(pad, Math.round(anchor.left));
      // But make sure the right edge doesn't overflow
      const clampedLeft = Math.min(leftFromEdge, vw - menuW - pad);
      pos = { top: `${top}px`, left: `${Math.max(pad, clampedLeft)}px` };
    }
    setPosition(pos);
  }, [anchor, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const down = (e: MouseEvent | TouchEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!menuRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
    };
  }, [isOpen, onClose]);

  const hasCopy = message && !message.isUnsent && message.text;
  const hasUnsend = message && message.sentByMe && !message.isUnsent;
  if (!hasCopy && !hasUnsend) return null;

  return (
    <div
      ref={menuRef}
      style={position}
      className={`fixed z-[200] rounded-2xl border border-edge bg-surface p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] transition-all duration-200 ease-out min-w-[160px] ${
        !position ? "right-4 bottom-4" : ""
      } ${isOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}
    >
      <div className="overflow-hidden rounded-xl bg-page">
        {hasCopy && (
          <button
            type="button"
            onClick={() => { onCopy(); onClose(); }}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-black/5 active:opacity-60 transition-colors ${hasUnsend ? "border-b border-edge" : ""}`}
          >
            <Copy size={16} color="var(--ink)" />
            <span>Copy text</span>
          </button>
        )}
        {hasUnsend && (
          <button
            type="button"
            onClick={() => { onUnsend(); onClose(); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#D12F2F] hover:bg-black/5 active:opacity-60 transition-colors"
          >
            <Trash size={16} color="#D12F2F" />
            <span>Unsend</span>
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onOptions,
}: {
  message: Message;
  onOptions: (msg: Message, anchor: MsgOptionsAnchor) => void;
}) {
  const { sentByMe, text, timestamp, status, isUnsent, attachments } = message;
  const hasAttachments = attachments && attachments.length > 0;
  const gifUrl = !isUnsent ? extractGifUrl(text) : null;
  const textWithoutGif = gifUrl && text ? text.replace(gifUrl, "").trim() : null;
  const postId = !isUnsent && !gifUrl ? extractPostId(text) : null;
  const textWithoutLink = postId && text ? stripPostUrl(text) : null;
  const displayText = textWithoutGif || (!gifUrl ? (textWithoutLink ?? text) : null);
  const showText = !isUnsent && !!displayText;

  const hasActions =
    (!isUnsent && !!text) || (sentByMe && !isUnsent);

  const handleOptionsClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onOptions(message, { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom });
  };

  const optionsButton = hasActions ? (
    <button
      type="button"
      aria-label="Message options"
      onClick={handleOptionsClick}
      className="mb-5 shrink-0 flex h-7 w-7 items-center justify-center rounded-full opacity-40 hover:opacity-100 hover:bg-black/5 active:opacity-60 transition-opacity duration-150"
    >
      <span className="rotate-90 block"><More size={15} color="var(--ink-3)" /></span>
    </button>
  ) : null;

  return (
    <div className={`flex items-end gap-1 ${sentByMe ? "justify-end" : "justify-start"}`}>
      {/* Button to the LEFT of my messages */}
      {sentByMe && optionsButton}

      <div
        className={`flex max-w-[78%] flex-col gap-1 ${
          sentByMe ? "items-end" : "items-start"
        }`}
      >
        {hasAttachments &&
          attachments.map((att) => (
            <AttachmentBubble
              key={att.id}
              attachment={att}
              sentByMe={sentByMe}
            />
          ))}

        {postId && <PostLinkPreview postId={postId} sentByMe={sentByMe} />}

        {gifUrl && (
          <div className="overflow-hidden rounded-2xl">
            {isGifMp4(gifUrl) ? (
              <video
                src={gifUrl}
                autoPlay
                loop
                muted
                playsInline
                className="max-w-55 rounded-2xl"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gifUrl} alt="GIF" className="max-w-55 rounded-2xl" loading="lazy" />
            )}
          </div>
        )}

        {showText && (
          <div
            className={`rounded-[18px] px-3.5 py-2.5 ${
              sentByMe
                ? "rounded-br-md bg-[#E1761F] text-white"
                : "rounded-bl-md bg-surface-high text-ink"
            }`}
          >
            <p className="break-all text-sm leading-relaxed">{displayText}</p>
          </div>
        )}

        {isUnsent && (
          <div className="rounded-[18px] rounded-bl-md border border-edge px-3.5 py-2.5">
            <p className="text-sm italic text-ink-3">Message unsent</p>
          </div>
        )}

        <div
          className={`flex items-center gap-1 px-1 ${
            sentByMe ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <span className="text-[10px] text-ink-3">{formatTime(timestamp)}</span>
          {sentByMe && <StatusTick status={status} />}
        </div>
      </div>

      {/* Button to the RIGHT of received messages */}
      {!sentByMe && optionsButton}
    </div>
  );
}

// ─── Header options sheet ─────────────────────────────────────────────────────

function HeaderOptionsSheet({
  participantUsername,
  onClose,
  onDeleteConversation,
}: {
  participantUsername: string;
  onClose: () => void;
  onDeleteConversation: () => void;
}) {
  const router = useRouter();

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-surface pb-safe shadow-2xl lg:left-1/2 lg:right-auto lg:w-full lg:max-w-2xl lg:-translate-x-1/2">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-edge" />
        </div>

        <div className="px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/user/${encodeURIComponent(participantUsername)}`);
            }}
            className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-high active:opacity-70"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-surface-high">
              <ProfileDelete size={18} color="var(--ink)" />
            </div>
            <span className="text-sm font-medium text-ink">View profile</span>
          </button>

          <button
            type="button"
            onClick={onDeleteConversation}
            className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-red-50 active:opacity-70"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-red-50">
              <Trash size={18} color="#e53e3e" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-600">
                Delete conversation
              </p>
              <p className="text-xs text-red-400">
                Removes all messages for everyone
              </p>
            </div>
          </button>
        </div>

        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-surface-high py-3.5 text-sm font-semibold text-ink transition-opacity active:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="fixed inset-x-4 bottom-0 z-60 mb-8 flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-2xl lg:left-1/2 lg:right-auto lg:inset-x-auto lg:w-full lg:max-w-lg lg:-translate-x-1/2">
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="text-sm text-ink-2">{body}</p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-surface-high py-3 text-sm font-semibold text-ink transition-opacity active:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white transition-opacity active:opacity-70"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Post link picker ─────────────────────────────────────────────────────────

type PostPickerItem = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string;
};

function PostLinkPickerSheet({
  currentUsername,
  onClose,
  onSelect,
}: {
  currentUsername: string;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const [myPosts, setMyPosts] = useState<PostPickerItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostPickerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchBoth = async () => {
      try {
        const [postsRes, archiveRes] = await Promise.all([
          fetch(
            `/api/posts?author=${encodeURIComponent(currentUsername)}&limit=30`,
          ),
          fetch("/api/archive"),
        ]);

        if (cancelled) return;

        if (postsRes.ok) {
          const data = (await postsRes.json()) as {
            posts?: Array<{
              id: string;
              title: string;
              thumbnailUrl?: string | null;
              author?: { displayName?: string | null } | null;
            }>;
          };
          setMyPosts(
            (data.posts ?? []).map((p) => ({
              id: p.id,
              title: p.title,
              thumbnailUrl: p.thumbnailUrl ?? null,
              authorName: p.author?.displayName ?? "",
            })),
          );
        }

        if (archiveRes.ok) {
          const data = (await archiveRes.json()) as {
            archive?: {
              savedPosts?: Array<{
                post: {
                  id: string;
                  title: string;
                  thumbnailUrl?: string | null;
                  author?: { displayName?: string | null } | null;
                };
              }>;
            } | null;
          };
          setSavedPosts(
            (data.archive?.savedPosts ?? []).map((sp) => ({
              id: sp.post.id,
              title: sp.post.title,
              thumbnailUrl: sp.post.thumbnailUrl ?? null,
              authorName: sp.post.author?.displayName ?? "",
            })),
          );
        }
      } catch {
        // silently fail — list stays empty
      }
      if (!cancelled) setLoading(false);
    };

    void fetchBoth();
    return () => {
      cancelled = true;
    };
  }, [currentUsername]);

  const items = tab === "mine" ? myPosts : savedPosts;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-surface pb-safe shadow-2xl lg:left-1/2 lg:right-auto lg:w-full lg:max-w-2xl lg:-translate-x-1/2"
        style={{ maxHeight: "70dvh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-edge" />
        </div>

        <p className="px-5 pb-3 text-sm font-semibold text-ink">Share a post</p>

        {/* Tabs */}
        <div className="flex gap-1.5 px-4 pb-3">
          {(["mine", "saved"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                tab === t
                  ? "bg-[#E1761F] text-white"
                  : "bg-surface-high text-ink-2"
              }`}
            >
              {t === "mine" ? "My Posts" : "Saved"}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-4">
          {loading ? (
            <div className="space-y-3 pt-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <div className="h-14 w-10 shrink-0 animate-pulse rounded-lg bg-surface-high" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface-high" />
                    <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-high" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="pt-8 text-center text-sm text-ink-3">
              {tab === "mine" ? "No posts yet" : "No saved posts"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(
                      `${window.location.origin}/post/${encodeURIComponent(item.id)}`,
                    );
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-surface-high active:opacity-70"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-[#E8E8E8]">
                    {item.thumbnailUrl ? (
                      <Image
                        src={`/api/posts/thumbnail?postId=${encodeURIComponent(item.id)}`}
                        alt={item.title}
                        fill
                        sizes="40px"
                        unoptimized
                        className="object-cover object-top"
                        onError={() => {}}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <DocumentText size={16} color="#B76217" variant="Bulk" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-semibold text-ink">
                      {item.title}
                    </p>
                    {item.authorName && (
                      <p className="mt-0.5 text-[10px] text-ink-3">
                        {item.authorName}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── GIF picker ───────────────────────────────────────────────────────────────

type GifItem = { id: string; stillUrl: string; mp4Url: string; width: number; height: number };

function GifTile({ gif, onSelect, onClose }: { gif: GifItem; onSelect: (url: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);

  const playVideo = () => videoRef.current?.play();
  const stopVideo = () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  };

  const onTouchStart = () => {
    isHoldingRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      playVideo();
    }, 150);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (isHoldingRef.current) {
      // was a hold — stop video, don't select
      stopVideo();
      isHoldingRef.current = false;
      e.preventDefault();
    }
    // short tap falls through to onClick
  };

  return (
    <button
      type="button"
      onClick={() => { onSelect(gif.mp4Url); onClose(); }}
      onMouseEnter={playVideo}
      onMouseLeave={stopVideo}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); stopVideo(); }}
      className="relative block w-full overflow-hidden rounded-xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gif.stillUrl} alt="" loading="lazy" className="w-full object-cover" />
      <video
        ref={videoRef}
        src={gif.mp4Url}
        loop
        muted
        playsInline
        preload="none"
        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-150 [&[data-playing]]:opacity-100"
        onPlay={(e) => e.currentTarget.setAttribute("data-playing", "")}
        onPause={(e) => e.currentTarget.removeAttribute("data-playing")}
      />
    </button>
  );
}

function GifPickerSheet({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gif${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const body = (await res.json()) as { gifs?: GifItem[] };
      setGifs(body.gifs ?? []);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(value.trim()), 400);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-surface pb-safe shadow-2xl lg:left-1/2 lg:right-auto lg:w-full lg:max-w-2xl lg:-translate-x-1/2"
        style={{ height: "70dvh" }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-edge" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3">
          <p className="text-sm font-semibold text-ink">GIFs</p>
          <Image src="/PoweredBy_200px-Black_HorizText.png" alt="Powered by GIPHY" width={200} height={17} className="h-4 w-auto dark:hidden" />
          <Image src="/PoweredBy_200px-White_HorizText.png" alt="Powered by GIPHY" width={200} height={17} className="h-4 w-auto hidden dark:block" />
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl bg-surface-high px-4 py-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="8" stroke="var(--ink-3)" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search GIFs…"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-none px-3 pb-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-surface-high" />
              ))}
            </div>
          ) : gifs.length === 0 ? (
            <p className="pt-10 text-center text-sm text-ink-3">
              {query ? "No GIFs found" : "GIFs unavailable"}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {gifs.map((gif) => (
                <GifTile key={gif.id} gif={gif} onSelect={onSelect} onClose={onClose} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Header skeleton ──────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-edge bg-surface px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <ArrowLeft size={22} color="var(--ink)" />
      </div>
      <div className="flex flex-1 items-center gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[14px] bg-surface-high" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 animate-pulse rounded-full bg-surface-high" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-surface-high" />
        </div>
      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatRoomPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const conversationId = Array.isArray(params["chat-id"])
    ? params["chat-id"][0]
    : params["chat-id"];

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isTypingRemote, setIsTypingRemote] = useState(false);

  // Overlay states
  const [optionsMsg, setOptionsMsg] = useState<Message | null>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<MsgOptionsAnchor | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    "conversation" | "message" | null
  >(null);
  const pendingDeleteRef = useRef<string | null>(null); // message id

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchConversation = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Failed to load conversation");
        return;
      }
      setParticipant(body.participant ?? null);
      setMessages(
        (body.messages ?? []).map(
          (m: {
            id: string;
            text: string | null;
            sentByMe: boolean;
            timestamp: string;
            status: string | null;
            isUnsent: boolean;
            attachments?: MessageAttachment[];
          }) => ({
            id: m.id,
            text: m.text,
            sentByMe: m.sentByMe,
            timestamp: new Date(m.timestamp),
            status: normaliseStatus(m.status),
            isUnsent: m.isUnsent,
            attachments: m.attachments ?? [],
          }),
        ),
      );
    } catch {
      setError("Failed to load conversation");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  // Mark messages as read once loaded
  useEffect(() => {
    if (!conversationId || isLoading) return;
    void fetch(`/api/chat/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
    });
  }, [conversationId, isLoading]);

  // ── Realtime subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId || !user) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const onMessage = (event: ChatMessageEvent) => {
      if (event.senderId === user.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === event.message.id)) return prev;
        return [
          ...prev,
          {
            id: event.message.id,
            text: event.message.text,
            sentByMe: false,
            timestamp: new Date(event.message.timestamp),
            status: normaliseStatus(event.message.status),
            isUnsent: event.message.isUnsent,
            attachments: event.message.attachments ?? [],
          },
        ];
      });
      void fetch(`/api/chat/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
      });
    };

    const onTyping = (event: ChatTypingEvent) => {
      if (event.senderId === user.id) return;
      setIsTypingRemote(event.isTyping);
      if (remoteTypingTimeoutRef.current)
        clearTimeout(remoteTypingTimeoutRef.current);
      if (event.isTyping) {
        remoteTypingTimeoutRef.current = setTimeout(
          () => setIsTypingRemote(false),
          4000,
        );
      }
    };

    void subscribeToChatMessages(conversationId, onMessage).then((unsub) => {
      if (cancelled) unsub();
      else cleanups.push(unsub);
    });
    void subscribeToChatTyping(conversationId, onTyping).then((unsub) => {
      if (cancelled) unsub();
      else cleanups.push(unsub);
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      if (remoteTypingTimeoutRef.current)
        clearTimeout(remoteTypingTimeoutRef.current);
    };
  }, [conversationId, user]);

  // Scroll to bottom on new messages / typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTypingRemote]);

  // ── Send ───────────────────────────────────────────────────────────────────

  const stopTypingSignal = useCallback(() => {
    if (!conversationId || !user) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    void emitTyping(conversationId, user.id, false);
  }, [conversationId, user]);

  const sendMessage = async () => {
    const text = draftRef.current.trim();
    if (!text || !conversationId) return;

    stopTypingSignal();

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
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const body = await res.json().catch(() => ({}));
      const msg = body?.message;

      if (res.ok && msg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  id: msg.id,
                  text: msg.text,
                  sentByMe: true,
                  timestamp: new Date(msg.timestamp),
                  status: normaliseStatus(msg.status),
                  isUnsent: msg.isUnsent,
                  attachments: msg.attachments ?? [],
                }
              : m,
          ),
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && navigator.maxTouchPoints === 0) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard not available (e.g. non-https) — silently fail
    }
    setOptionsMsg(null);
    setOptionsAnchor(null);
  }, []);

  const handleUnsendConfirm = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      setConfirmDelete(null);
      setOptionsMsg(null);
      setOptionsAnchor(null);

      // Optimistic mark as unsent
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isUnsent: true, text: null } : m)),
      );

      try {
        await fetch(
          `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
          { method: "DELETE" },
        );
      } catch {
        // Revert on failure by refetching
        void fetchConversation();
      }
    },
    [conversationId, fetchConversation],
  );

  const handleDeleteConversationConfirm = useCallback(async () => {
    if (!conversationId) return;
    setConfirmDelete(null);
    setHeaderMenuOpen(false);

    try {
      await fetch(`/api/chat/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
      });
      router.replace("/chat");
    } catch {
      // stay on page if it fails
    }
  }, [conversationId, router]);

  const groups = groupMessagesByDay(messages);

  return (
    <div className="flex h-dvh overflow-hidden bg-page lg:items-center lg:justify-center lg:p-6">
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface lg:h-full lg:max-w-2xl lg:rounded-2xl lg:border lg:border-edge lg:shadow-sm">
      {/* ── Header ── */}
      {isLoading || !participant ? (
        <HeaderSkeleton />
      ) : (
        <header className="flex shrink-0 items-center gap-2 border-b border-edge bg-surface px-4 py-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-high active:opacity-60"
          >
            <ArrowLeft size={22} color="var(--ink)" />
          </button>

          <button
            type="button"
            onClick={() =>
              router.push(`/user/${encodeURIComponent(participant.username)}`)
            }
            className="flex flex-1 items-center gap-3 rounded-xl py-1 text-left transition-opacity active:opacity-60"
          >
            <div className="relative shrink-0">
              <div
                className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[14px] text-xs font-semibold ${avatarColor(participant.id)}`}
              >
                {participant.avatar ? (
                  <Image
                    src={participant.avatar}
                    alt={participant.name}
                    fill
                    sizes="40px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  getInitials(participant.name)
                )}
              </div>
              {participant.isOnline && (
                <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-[#1F9D75]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {participant.name}
              </p>
              <p className="text-[11px] text-ink-3">
                {participant.isOnline
                  ? "Active now"
                  : `@${participant.username}`}
              </p>
            </div>
          </button>

          {/* More options */}
          <button
            type="button"
            aria-label="Conversation options"
            onClick={() => setHeaderMenuOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-high active:opacity-60"
          >
            <More size={20} color="var(--ink)" />
          </button>
        </header>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto overscroll-none px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-5">
          {error ? (
            <div className="flex flex-col items-center justify-center pt-20 text-center">
              <p className="text-sm font-semibold text-ink">
                Something went wrong
              </p>
              <p className="mt-1 text-sm text-ink-2">{error}</p>
              <button
                type="button"
                onClick={() => void fetchConversation()}
                className="mt-4 rounded-full bg-[#E1761F] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80 active:scale-95"
              >
                Retry
              </button>
            </div>
          ) : isLoading ? (
            <div className="space-y-4 pt-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`flex ${i % 3 === 2 ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`h-9 animate-pulse rounded-[18px] bg-surface-high ${
                      i % 3 === 2 ? "w-48" : "w-64"
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-edge" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-3">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-edge" />
                </div>
                <div className="space-y-1.5">
                  {group.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onOptions={(m, anchor) => {
                        setOptionsMsg(m);
                        setOptionsAnchor(anchor);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isTypingRemote && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-[18px] rounded-bl-md bg-surface-high px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t border-edge bg-surface px-4 pb-4 pt-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2.5">
          <div className="flex flex-1 items-end gap-2 rounded-2xl bg-surface-high px-4 py-2.5">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Message…"
              value={draft}
              onChange={(e) => {
                draftRef.current = e.target.value;
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

                if (conversationId && user) {
                  if (typingTimeoutRef.current)
                    clearTimeout(typingTimeoutRef.current);
                  void emitTyping(conversationId, user.id, true);
                  typingTimeoutRef.current = setTimeout(
                    () => void emitTyping(conversationId, user.id, false),
                    2000,
                  );
                }
              }}
              onBlur={() => stopTypingSignal()}
              onKeyDown={handleKeyDown}
              className="max-h-30 flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none"
            />
            <button
              type="button"
              aria-label="Send a GIF"
              onClick={() => setGifPickerOpen(true)}
              className="mb-0.5 shrink-0 transition-opacity hover:opacity-60 active:scale-95 active:opacity-40"
            >
              <span className="text-[11px] font-bold leading-none tracking-wide text-ink-3">GIF</span>
            </button>
            <button
              type="button"
              aria-label="Share a post"
              onClick={() => setLinkPickerOpen(true)}
              className="mb-0.5 shrink-0 transition-opacity hover:opacity-60 active:scale-95 active:opacity-40"
            >
              <Link21 size={18} color="var(--ink-3)" />
            </button>
          </div>

          <button
            type="button"
            aria-label="Send message"
            onClick={() => void sendMessage()}
            disabled={!draft.trim()}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E1761F] transition-all active:scale-95 disabled:opacity-35"
          >
            <Send2 size={18} color="#fff" variant="Bold" />
          </button>
        </div>
      </div>

      {/* ── Message options popover ── */}
      <MessageOptionsMenu
        isOpen={Boolean(optionsMsg)}
        onClose={() => { setOptionsMsg(null); setOptionsAnchor(null); }}
        anchor={optionsAnchor}
        message={optionsMsg}
        onCopy={() => void handleCopy(optionsMsg?.text ?? "")}
        onUnsend={() => {
          pendingDeleteRef.current = optionsMsg?.id ?? null;
          setOptionsMsg(null);
          setOptionsAnchor(null);
          setConfirmDelete("message");
        }}
      />

      {/* ── GIF picker ── */}
      {gifPickerOpen && (
        <GifPickerSheet
          onClose={() => setGifPickerOpen(false)}
          onSelect={(url) => {
            draftRef.current = url;
            setDraft(url);
          }}
        />
      )}

      {/* ── Post link picker ── */}
      {linkPickerOpen && user?.username && (
        <PostLinkPickerSheet
          currentUsername={user.username}
          onClose={() => setLinkPickerOpen(false)}
          onSelect={(url) => {
            draftRef.current = url;
            setDraft(url);
            if (inputRef.current) {
              inputRef.current.style.height = "auto";
              inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
              inputRef.current.focus();
            }
          }}
        />
      )}

      {/* ── Header options sheet ── */}
      {headerMenuOpen && participant && (
        <HeaderOptionsSheet
          participantUsername={participant.username}
          onClose={() => setHeaderMenuOpen(false)}
          onDeleteConversation={() => {
            setHeaderMenuOpen(false);
            setConfirmDelete("conversation");
          }}
        />
      )}

      {/* ── Confirm dialogs ── */}
      {confirmDelete === "message" && (
        <ConfirmSheet
          title="Unsend message?"
          body="This removes the message for everyone in the conversation."
          confirmLabel="Unsend"
          onConfirm={() =>
            void handleUnsendConfirm(pendingDeleteRef.current ?? "")
          }
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmDelete === "conversation" && (
        <ConfirmSheet
          title="Delete conversation?"
          body="All messages will be permanently removed for everyone. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => void handleDeleteConversationConfirm()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
    </div>
  );
}
