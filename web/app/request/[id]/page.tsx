"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  User,
  Verify,
  DocumentText1,
  Messages2,
  Coin1,
  MessageQuestion,
  DocumentUpload,
  TickCircle,
  Send2,
  Heart,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import Header from "@/app/components/Header";
import type { DocumentRequest } from "@/app/components/request/RequestCard";

type Fulfillment = {
  id: string;
  postId: string;
  postTitle: string;
  isAccepted: boolean;
  likeCount: number;
  createdAt: string;
  author: {
    displayName: string;
    username: string;
    profilePicture?: string | null;
  };
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    displayName: string;
    username: string;
    profilePicture?: string | null;
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

const ALL_MOCK_REQUESTS: Record<string, DocumentRequest & { fulfillments: Fulfillment[]; comments: Comment[] }> = {
  req_1: {
    id: "req_1",
    title: "Grade 12 Physics Notes – ZSCE",
    description:
      "Looking for comprehensive physics notes covering electricity, magnetism, and wave optics for the Grade 12 ZSCE exams. Preferably handwritten or well-organized typed notes. Notes from 2022 or 2023 would be ideal.",
    categories: ["Physics", "Grade 12"],
    bounty: 500,
    solved: false,
    responseCount: 3,
    commentCount: 7,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u1",
      displayName: "Mwamba Chilufya",
      username: "mwamba_c",
      profilePicture: null,
      subscriptionPlan: null,
    },
    fulfillments: [
      {
        id: "ful_1",
        postId: "post_abc",
        postTitle: "Grade 12 Physics Notes ZSCE 2023 – Electricity & Magnetism",
        isAccepted: false,
        likeCount: 14,
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        author: {
          displayName: "Bwalya Mwansa",
          username: "bwalya_m",
          profilePicture: null,
        },
      },
      {
        id: "ful_2",
        postId: "post_def",
        postTitle: "Physics Grade 12 Full Notes – Zambia Curriculum",
        isAccepted: false,
        likeCount: 8,
        createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        author: {
          displayName: "Natasha Phiri",
          username: "natasha.p",
          profilePicture: null,
        },
      },
    ],
    comments: [
      {
        id: "c1",
        body: "I might have these somewhere. Let me check my files and upload soon.",
        createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        author: { displayName: "Bwalya Mwansa", username: "bwalya_m", profilePicture: null },
      },
      {
        id: "c2",
        body: "Check the search – someone posted physics notes last week. Let me find the link.",
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        author: { displayName: "Natasha Phiri", username: "natasha.p", profilePicture: null },
      },
      {
        id: "c3",
        body: "Are you specifically looking for the 2022 or 2023 papers?",
        createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        author: { displayName: "Joseph Banda", username: "jo_banda", profilePicture: null },
      },
    ],
  },
  req_2: {
    id: "req_2",
    title: "Introduction to Algorithms – CLRS 4th Edition PDF",
    description:
      "Need the 4th edition of CLRS (Cormen, Leiserson, Rivest, Stein). Looking specifically for chapters on dynamic programming and graph algorithms. This is the 2022 edition published by MIT Press.",
    categories: ["Computer Science", "Algorithms"],
    bounty: null,
    solved: true,
    responseCount: 12,
    commentCount: 15,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u2",
      displayName: "Thandiwe Daka",
      username: "thandiwe.d",
      profilePicture: null,
      subscriptionPlan: "pro",
    },
    fulfillments: [
      {
        id: "ful_a",
        postId: "post_xyz",
        postTitle: "CLRS 4th Edition – Introduction to Algorithms (2022)",
        isAccepted: true,
        likeCount: 47,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        author: {
          displayName: "Chanda Mutale",
          username: "c.mutale",
          profilePicture: null,
        },
      },
    ],
    comments: [
      {
        id: "c4",
        body: "Found it! Uploading the full PDF now. It includes all chapters.",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        author: { displayName: "Chanda Mutale", username: "c.mutale", profilePicture: null },
      },
      {
        id: "c5",
        body: "Thank you so much! This is exactly what I needed.",
        createdAt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
        author: { displayName: "Thandiwe Daka", username: "thandiwe.d", profilePicture: null },
      },
    ],
  },
};

const FALLBACK_REQUEST: DocumentRequest & { fulfillments: Fulfillment[]; comments: Comment[] } = {
  id: "req_unknown",
  title: "Document Request",
  description: "This request could not be found.",
  categories: [],
  bounty: null,
  solved: false,
  responseCount: 0,
  commentCount: 0,
  createdAt: new Date().toISOString(),
  author: {
    id: "unknown",
    displayName: "Unknown",
    username: "unknown",
    profilePicture: null,
    subscriptionPlan: null,
  },
  fulfillments: [],
  comments: [],
};

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const request = ALL_MOCK_REQUESTS[id] ?? FALLBACK_REQUEST;
  const hasPaidPlan =
    request.author.subscriptionPlan === "pro" ||
    request.author.subscriptionPlan === "premium";

  const [commentText, setCommentText] = useState("");

  const handleFulfill = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push(`/create?requestId=${request.id}`);
  };

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Document Request"
        rightSlot={
          <button
            type="button"
            aria-label="Share"
            className="cursor-pointer rounded-full p-1 transition-opacity hover:opacity-60"
            onClick={() => {
              if (navigator.share) {
                void navigator.share({
                  title: request.title,
                  url: window.location.href,
                });
              }
            }}
          >
            <Send2 size={20} color="var(--ink-2)" />
          </button>
        }
      />

      <div className="mx-auto max-w-150 pt-22 pb-28">
        <div className="bg-surface lg:rounded-xl lg:border lg:border-edge lg:shadow-sm">
          <div className="flex items-start justify-between px-4 pt-4">
            <button
              type="button"
              className="cursor-pointer flex min-w-0 items-center gap-3 rounded-xl py-1 text-left transition-colors hover:bg-surface-high active:bg-edge"
              onClick={() =>
                router.push(
                  `/user/${encodeURIComponent(request.author.username)}`,
                )
              }
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
                {request.author.profilePicture ? (
                  <Image
                    src={request.author.profilePicture}
                    alt=""
                    width={44}
                    height={44}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <User size={18} color="var(--ink-3)" variant="Bold" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {request.author.displayName}
                  </p>
                  {hasPaidPlan && (
                    <Verify size={15} color="#E1761F" variant="Bold" />
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                  <span>@{request.author.username}</span>
                  <span>&bull;</span>
                  <span>{formatTimeAgo(request.createdAt)}</span>
                </div>
              </div>
            </button>

            {request.solved ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#E8F5E9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#2E7D32]">
                <TickCircle size={11} color="#2E7D32" variant="Bold" />
                Fulfilled
              </span>
            ) : (
              <span className="mt-1 inline-flex items-center rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#1D4ED8]">
                Open
              </span>
            )}
          </div>

          <div className="px-4 pt-4">
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#1D4ED8]">
                <MessageQuestion size={11} color="#1D4ED8" variant="Bold" />
                Request
              </span>
              {request.bounty ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E7] px-2.5 py-1 text-[10px] font-semibold text-[#E1761F]">
                  <Coin1 size={11} color="#E1761F" variant="Bold" />
                  {request.bounty.toLocaleString()} token reward
                </span>
              ) : null}
            </div>

            <h1 className="text-lg font-bold text-ink leading-snug">
              {request.title}
            </h1>
            <p className="mt-2.5 text-sm leading-6 text-ink-2">
              {request.description}
            </p>
          </div>

          {request.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
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

          <div className="flex items-center gap-4 border-t border-edge px-4 py-3 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <DocumentText1 size={15} color="var(--ink-3)" />
              {request.responseCount}{" "}
              {request.responseCount === 1 ? "response" : "responses"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Messages2 size={15} color="var(--ink-3)" />
              {request.commentCount} comments
            </span>
          </div>
        </div>

        {!request.solved && (
          <div className="mx-4 mt-4 lg:mx-0">
            <button
              type="button"
              onClick={handleFulfill}
              className="cursor-pointer w-full flex items-center justify-center gap-2.5 rounded-2xl bg-[#1D4ED8] px-5 py-4 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(29,78,216,0.25)] transition-all duration-200 hover:bg-[#1A44C2] active:scale-[0.98]"
            >
              <DocumentUpload size={20} color="white" />
              Post This Document
            </button>
            <p className="mt-2 text-center text-xs text-ink-3">
              Upload the document to fulfill this request
              {request.bounty
                ? ` and earn ${request.bounty.toLocaleString()} tokens`
                : ""}
              .
            </p>
          </div>
        )}

        {request.fulfillments.length > 0 && (
          <div className="mt-6 mx-4 lg:mx-0">
            <h2 className="mb-3 text-sm font-bold text-ink">
              {request.fulfillments.length}{" "}
              {request.fulfillments.length === 1 ? "Response" : "Responses"}
            </h2>
            <div className="space-y-3">
              {request.fulfillments.map((ful) => (
                <div
                  key={ful.id}
                  className={`rounded-2xl border p-4 bg-surface transition-all duration-200 ${
                    ful.isAccepted
                      ? "border-[#4ADE80] ring-1 ring-[#4ADE80]/30"
                      : "border-edge"
                  }`}
                >
                  {ful.isAccepted && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <TickCircle size={16} color="#16A34A" variant="Bold" />
                      <span className="text-xs font-semibold text-[#16A34A]">
                        Accepted answer
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
                      {ful.author.profilePicture ? (
                        <Image
                          src={ful.author.profilePicture}
                          alt=""
                          width={36}
                          height={36}
                          className="rounded-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <User size={14} color="var(--ink-3)" variant="Bold" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {ful.author.displayName}
                          </p>
                          <p className="text-xs text-ink-3">
                            @{ful.author.username} &bull;{" "}
                            {formatTimeAgo(ful.createdAt)}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 shrink-0">
                          <Heart size={14} color="var(--ink-3)" />
                          {ful.likeCount}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/post/${ful.postId}`)}
                        className="cursor-pointer mt-3 flex w-full items-center gap-3 rounded-xl bg-doc-card p-3 text-left transition-all duration-200 hover:bg-doc-card-hover active:scale-[0.99]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface">
                          <DocumentText1
                            size={22}
                            color="var(--ink-2)"
                            variant="Bold"
                          />
                        </div>
                        <p className="line-clamp-2 flex-1 text-xs font-semibold text-ink">
                          {ful.postTitle}
                        </p>
                      </button>

                      {!request.solved &&
                        user?.id === request.author.id && (
                          <button
                            type="button"
                            className="cursor-pointer mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#16A34A] px-3 py-1.5 text-xs font-semibold text-[#16A34A] transition-all duration-200 hover:bg-[#F0FDF4] active:scale-95"
                          >
                            <TickCircle
                              size={13}
                              color="#16A34A"
                              variant="Bold"
                            />
                            Mark as accepted
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 mx-4 lg:mx-0">
          <h2 className="mb-3 text-sm font-bold text-ink">
            Discussion
            {request.comments.length > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-3">
                {request.comments.length} comments
              </span>
            )}
          </h2>

          {request.comments.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-edge py-8 text-center">
              <div className="flex justify-center mb-2">
                <Messages2 size={24} color="var(--ink-3)" />
              </div>
              <p className="text-sm text-ink-3">
                No comments yet. Start the discussion!
              </p>
            </div>
          ) : (
            <div className="space-y-0 rounded-2xl bg-surface border border-edge overflow-hidden">
              {request.comments.map((comment, idx) => (
                <div
                  key={comment.id}
                  className={`flex items-start gap-3 px-4 py-3.5 ${
                    idx < request.comments.length - 1
                      ? "border-b border-edge"
                      : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
                    {comment.author.profilePicture ? (
                      <Image
                        src={comment.author.profilePicture}
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <User size={13} color="var(--ink-3)" variant="Bold" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {comment.author.displayName}
                      </span>
                      <span className="text-[10px] text-ink-3">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-2 leading-5">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
              <User size={13} color="var(--ink-3)" variant="Bold" />
            </div>
            <div className="relative flex-1">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment…"
                className="w-full rounded-full border border-edge-mid bg-input px-4 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15 transition-all duration-200"
              />
              {commentText.length > 0 && (
                <button
                  type="button"
                  aria-label="Send comment"
                  className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-[#1D4ED8] transition-all duration-200 hover:bg-[#1A44C2] active:scale-90"
                >
                  <Send2 size={15} color="white" variant="Bold" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!request.solved && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface border-t border-edge px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={handleFulfill}
            className="cursor-pointer w-full flex items-center justify-center gap-2 rounded-2xl bg-[#1D4ED8] py-4 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#1A44C2] active:scale-[0.98]"
          >
            <DocumentUpload size={18} color="white" />
            Post This Document
          </button>
        </div>
      )}
    </div>
  );
}
