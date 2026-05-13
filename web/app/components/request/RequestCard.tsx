"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Verify,
  DocumentText1,
  Messages2,
  Coin1,
  MessageQuestion,
} from "iconsax-reactjs";
import Image from "next/image";

export type DocumentRequest = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  bounty?: number | null;
  solved: boolean;
  responseCount: number;
  commentCount: number;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    subscriptionPlan?: string | null;
  };
};

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

export default function RequestCard({ request }: { request: DocumentRequest }) {
  const router = useRouter();
  const hasPaidPlan =
    request.author.subscriptionPlan === "pro" ||
    request.author.subscriptionPlan === "premium";

  return (
    <div className="w-full px-3">
      <article
        role="button"
        tabIndex={0}
        className="cursor-pointer border-b border-edge lg:rounded-xl lg:border lg:border-edge lg:mb-4 lg:bg-surface lg:shadow-sm transition-all duration-200"
        onClick={() => router.push(`/request/${request.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/request/${request.id}`)}
      >
        <div className="flex items-start justify-between px-2 pt-3">
          <button
            type="button"
            className="cursor-pointer flex min-w-0 items-center gap-3 text-left rounded-xl py-1 -ml-1 pl-1 transition-colors duration-200 hover:bg-surface-high active:bg-edge"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/user/${encodeURIComponent(request.author.username)}`);
            }}
          >
            <div className="flex h-10 w-10 shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
              {request.author.profilePicture ? (
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
                  {request.author.displayName || "Unknown"}
                </p>
                {hasPaidPlan && (
                  <Verify size={15} color="#E1761F" variant="Bold" />
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-3">
                <span>@{request.author.username}</span>
                <span>&bull;</span>
                <span>{formatTimeAgo(request.createdAt)}</span>
              </div>
            </div>
          </button>

          <div className="pt-1 shrink-0">
            {request.solved ? (
              <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E7D32]">
                Fulfilled
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1D4ED8]">
                Open
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-2 pt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1D4ED8]">
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
                className="rounded-full bg-surface-high px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3"
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
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Messages2 size={15} color="var(--ink-3)" />
              <span>{request.commentCount}</span>
            </span>
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
  );
}
