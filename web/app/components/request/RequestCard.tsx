"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Verify,
  DocumentText1,
  Messages2,
  Coin1,
  MessageQuestion,
  More,
  Edit2,
  Trash,
} from "iconsax-reactjs";
import Image from "next/image";
import { useAuth } from "@/app/lib/auth-client";

export type DocumentRequest = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  bounty?: number | null;
  solved: boolean;
  responseCount: number;
  commentCount?: number;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    subscriptionPlan?: string | null;
  };
};

type OptionsAnchor = { top: number; left: number; right: number; bottom: number };

function formatTimeAgo(timestamp: string): string {
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return "Just now";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RequestOptionsMenu({
  isOpen,
  onClose,
  anchor,
  onEdit,
  onDelete,
  isDeleting,
}: {
  isOpen: boolean;
  onClose: () => void;
  anchor: OptionsAnchor | null;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const position = useMemo<React.CSSProperties | undefined>(() => {
    if (!anchor || !isOpen || typeof window === "undefined") return undefined;
    const gap = 6;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuH = 108; // 2 items × ~54px
    const menuW = 160;

    const fitsBelow = anchor.bottom + gap + menuH <= vh - pad;
    const top = fitsBelow
      ? Math.round(anchor.bottom + gap)
      : Math.max(pad, Math.round(anchor.top - menuH - gap));

    const rightFromEdge = Math.max(pad, Math.round(vw - anchor.right));
    const leftEdgeIfRight = vw - rightFromEdge - menuW;

    return leftEdgeIfRight >= pad
      ? { top: `${top}px`, right: `${rightFromEdge}px` }
      : { top: `${top}px`, left: `${Math.max(pad, Math.min(Math.round(anchor.left), vw - menuW - pad))}px` };
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

  return (
    <div
      ref={menuRef}
      style={position}
      className={`fixed z-200 rounded-2xl border border-edge bg-surface p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] transition-all duration-200 ease-out min-w-40 ${
        !position ? "right-4 top-4" : ""
      } ${isOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}
    >
      <div className="overflow-hidden rounded-xl bg-page">
        <button
          type="button"
          onClick={() => { onEdit(); onClose(); }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-black/5 active:opacity-60 transition-colors border-b border-edge"
        >
          <Edit2 size={16} color="#111111" variant="Bold" />
          <span>Edit request</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#D12F2F] hover:bg-black/5 active:opacity-60 transition-colors disabled:opacity-40"
        >
          <Trash size={16} color="#D12F2F" variant="Bold" />
          <span>{isDeleting ? "Deleting…" : "Delete request"}</span>
        </button>
      </div>
    </div>
  );
}

export default function RequestCard({
  request,
  onDeleted,
}: {
  request: DocumentRequest;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();

  const hasPaidPlan =
    request.author?.subscriptionPlan === "pro" ||
    request.author?.subscriptionPlan === "premium";

  const isAuthor =
    Boolean(user?.username) &&
    Boolean(request.author?.username) &&
    user!.username.trim().toLowerCase() ===
      request.author.username.trim().toLowerCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<OptionsAnchor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleMoreClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom });
    setMenuOpen((v) => !v);
  };

  const handleEdit = () => {
    router.push(`/request/edit/${request.id}`);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this request? It will be kept for 30 days and can be restored.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/requests/${request.id}`, { method: "DELETE" });
      if (res.ok) {
        setMenuOpen(false);
        onDeleted?.(request.id);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <RequestOptionsMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchor={anchor}
        onEdit={handleEdit}
        onDelete={() => void handleDelete()}
        isDeleting={isDeleting}
      />

      <div className="w-full px-3">
        <article
          className="cursor-pointer border-b border-edge lg:rounded-xl lg:border lg:border-edge lg:mb-4 lg:bg-surface lg:shadow-sm transition-all duration-200"
          onClick={() => router.push(`/request/${request.id}`)}
        >
          <div className="flex items-start justify-between px-2 pt-3">
            <button
              type="button"
              className="cursor-pointer flex min-w-0 items-center gap-3 text-left rounded-xl py-1 -ml-1 pl-1 transition-colors duration-200 hover:bg-surface-high active:bg-edge"
              onClick={(e) => {
                e.stopPropagation();
                router.push(
                  `/user/${encodeURIComponent(request.author.username)}`,
                );
              }}
            >
              <div className="flex h-10 w-10 shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
                {request.author?.profilePicture ? (
                  <Image
                    src={request.author.profilePicture}
                    alt=""
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <User size={16} color="var(--ink-3)" variant="Bold" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {request.author?.displayName || "Unknown"}
                  </p>
                  {hasPaidPlan && (
                    <Verify size={15} color="#E1761F" variant="Bold" />
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-3">
                  <span>@{request.author?.username}</span>
                  <span>&bull;</span>
                  <span>{formatTimeAgo(request.createdAt)}</span>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-1.5 pt-1 shrink-0">
              {request.solved ? (
                <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#2E7D32]">
                  Fulfilled
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Open
                </span>
              )}
              {isAuthor && !request.solved && (
                <button
                  type="button"
                  aria-label="More options"
                  onClick={handleMoreClick}
                  className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5 active:opacity-60 transition-colors"
                >
                  <More size={16} color="var(--ink-3)" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#1D4ED8]">
              <MessageQuestion size={10} color="#1D4ED8" variant="Bold" />
              Request
            </span>
            {request.bounty ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E7] px-2 py-0.5 text-[10px] font-semibold text-[#E1761F]">
                <Coin1 size={10} color="#E1761F" variant="Bold" />
                {request.bounty.toLocaleString()} tokens
              </span>
            ) : null}
          </div>

          <div className="px-2 pt-2.5">
            <h3 className="line-clamp-2 text-sm font-semibold text-ink leading-snug">
              {request.title}
            </h3>
            {request.description && (
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-ink-2">
                {request.description}
              </p>
            )}
          </div>

          {request.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-3">
              {request.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-surface-high px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink-3"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-edge px-2 py-3">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
                <DocumentText1 size={15} color="var(--ink-3)" />
                <span>
                  {request.responseCount}{" "}
                  {request.responseCount === 1 ? "response" : "responses"}
                </span>
              </span>
              {(request.commentCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
                  <Messages2 size={15} color="var(--ink-3)" />
                  <span>{request.commentCount}</span>
                </span>
              )}
            </div>
            {!request.solved && (
              <button
                type="button"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] transition-all duration-200 hover:bg-[#DBEAFE] active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/request/${request.id}`);
                }}
              >
                Fulfill
              </button>
            )}
          </div>
        </article>
      </div>
    </>
  );
}
