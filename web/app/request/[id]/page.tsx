"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  User,
  Verify,
  DocumentText1,
  Coin1,
  MessageQuestion,
  DocumentUpload,
  TickCircle,
  Send2,
  Heart,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import Header from "@/app/components/Header";

type FulfillmentPost = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  fileType?: string | null;
};

type Fulfillment = {
  id: string;
  requestId: string;
  postId: string;
  authorId: string;
  likeCount: number;
  viewerHasLiked: boolean;
  isAccepted: boolean;
  createdAt: string;
  author: {
    id?: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    subscriptionPlan?: string | null;
  };
  post: FulfillmentPost;
};

type RequestDetail = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  bounty?: number | null;
  solved: boolean;
  closed: boolean;
  responseCount: number;
  viewerHasFulfilled: boolean;
  viewerIsAuthor: boolean;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string | null;
    subscriptionPlan?: string | null;
  };
  fulfillments: Fulfillment[];
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

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/requests/${id}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setRequest(data as RequestDetail);
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleAccept = async (fulfillmentId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setAcceptingId(fulfillmentId);
    try {
      const res = await fetch(`/api/requests/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillmentId }),
      });
      if (!res.ok) return;
      setRequest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          solved: true,
          fulfillments: prev.fulfillments.map((f) => ({
            ...f,
            isAccepted: f.id === fulfillmentId,
          })),
        };
      });
    } finally {
      setAcceptingId(null);
    }
  };

  const handleLike = async (fulfillmentId: string, viewerHasLiked: boolean) => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (likingId) return;
    setLikingId(fulfillmentId);
    // Optimistic update
    setRequest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fulfillments: prev.fulfillments.map((f) =>
          f.id === fulfillmentId
            ? {
                ...f,
                likeCount: viewerHasLiked ? f.likeCount - 1 : f.likeCount + 1,
                viewerHasLiked: !viewerHasLiked,
              }
            : f,
        ),
      };
    });
    try {
      await fetch(`/api/requests/fulfillments/${fulfillmentId}/like`, {
        method: "POST",
      });
    } catch {
      // Revert on failure
      setRequest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fulfillments: prev.fulfillments.map((f) =>
            f.id === fulfillmentId
              ? {
                  ...f,
                  likeCount: viewerHasLiked ? f.likeCount + 1 : f.likeCount - 1,
                  viewerHasLiked,
                }
              : f,
          ),
        };
      });
    } finally {
      setLikingId(null);
    }
  };

  const handleFulfill = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push(`/create?requestId=${id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page">
        <Header title="Document Request" />
        <div className="mx-auto max-w-150 pt-22 pb-28 px-4 space-y-3">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-page">
        <Header title="Document Request" />
        <div className="mx-auto max-w-150 pt-22 pb-28 px-4 text-center">
          <p className="text-sm text-ink-2">Request not found.</p>
        </div>
      </div>
    );
  }

  const hasPaidPlan =
    request.author.subscriptionPlan === "pro" ||
    request.author.subscriptionPlan === "premium";

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

      <div className="mx-auto max-w-150 pt-22 pb-20">
        <div className="lg:bg-surface lg:rounded-xl lg:border lg:border-edge lg:shadow-sm">
          <div className="flex items-start justify-between px-4">
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
          </div>
        </div>

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
                        <button
                          type="button"
                          onClick={() =>
                            void handleLike(ful.id, ful.viewerHasLiked)
                          }
                          disabled={likingId === ful.id}
                          className={`cursor-pointer inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-colors duration-150 ${
                            ful.viewerHasLiked
                              ? "text-red-500"
                              : "text-ink-3 hover:text-red-400"
                          }`}
                        >
                          <Heart
                            size={14}
                            color={
                              ful.viewerHasLiked ? "#ef4444" : "var(--ink-3)"
                            }
                            variant={ful.viewerHasLiked ? "Bold" : "Linear"}
                          />
                          {ful.likeCount}
                        </button>
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
                          {ful.post.title}
                        </p>
                      </button>

                      {!request.solved && request.viewerIsAuthor && (
                        <button
                          type="button"
                          onClick={() => void handleAccept(ful.id)}
                          disabled={acceptingId === ful.id}
                          className="cursor-pointer mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#16A34A] px-3 py-1.5 text-xs font-semibold text-[#16A34A] transition-all duration-200 hover:bg-[#F0FDF4] active:scale-95 disabled:opacity-50"
                        >
                          <TickCircle
                            size={13}
                            color="#16A34A"
                            variant="Bold"
                          />
                          {acceptingId === ful.id
                            ? "Accepting…"
                            : "Mark as accepted"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!request.solved &&
        !request.closed &&
        !request.viewerIsAuthor &&
        !request.viewerHasFulfilled && (
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
