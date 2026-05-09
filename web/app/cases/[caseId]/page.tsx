"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  CloseCircle,
  DocumentText1,
  InfoCircle,
  MessageText1,
  ShieldTick,
  Shield,
  TickCircle,
  Timer,
  Warning2,
} from "iconsax-reactjs";
import { useAuth } from "../../lib/auth-client";
import Alert from "../../components/Alert";

// ─── Types ────────────────────────────────────────────────────────────────────

type CasePost = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  authorId?: string | null;
  authorUsername?: string | null;
  viewCount: number;
  isFree: boolean;
  price: number;
  createdAt: string;
};

type CaseRevenueRedirect = {
  active: boolean;
  redirectPercentage: number;
  beneficiaryUserId: string;
};

type CaseEvent = {
  id: string;
  caseId: string;
  type: string;
  description: string;
  actorId?: string | null;
  metadata?: string | null;
  createdAt: string;
};

type CaseAppeal = {
  id: string;
  caseId: string;
  userId: string;
  reason: string;
  status: string;
  response?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlagiarismCaseData = {
  id: string;
  originalPost: CasePost;
  suspectedPost: CasePost;
  similarityScore: number;
  verdict: string;
  status: string;
  matchedChunkCount: number;
  totalChunkCount: number;
  revenueRedirectEnabled: boolean;
  matchSummaryJson: string;
  moderatorNote?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  viewerRole: string;
  revenueRedirect?: CaseRevenueRedirect | null;
  events: CaseEvent[];
  appeals: CaseAppeal[];
};

type ChunkInfo = {
  index: number;
  text: string;
  chunkType: string;
  wordCount: number;
  isMatched: boolean;
  matchedIndex?: number | null;
  similarity?: number | null;
  matchType?: string | null;
};

type ComparisonData = {
  originalChunks: ChunkInfo[];
  suspectedChunks: ChunkInfo[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  DUPLICATE: {
    label: "Duplicate",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
    Icon: CloseCircle,
  },
  SUSPICIOUS: {
    label: "Suspicious",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    Icon: Warning2,
  },
  POSSIBLE: {
    label: "Possible",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    Icon: InfoCircle,
  },
  CLEAN: {
    label: "Clean",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/30",
    Icon: TickCircle,
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: {
    label: "Pending Review",
    color: "text-amber-600 dark:text-amber-400",
  },
  REVIEWING: {
    label: "Under Review",
    color: "text-blue-600 dark:text-blue-400",
  },
  RESOLVED: { label: "Resolved", color: "text-green-600 dark:text-green-400" },
  DISMISSED: { label: "Dismissed", color: "text-ink-3" },
};

const EVENT_ICON: Record<string, React.ElementType> = {
  CASE_CREATED: Shield,
  REVENUE_REDIRECTED: Timer,
  NOTIFICATIONS_SENT: MessageText1,
  APPEAL_SUBMITTED: DocumentText1,
  APPEAL_REVIEWED: TickCircle,
  MODERATION_ACTION: ShieldTick,
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatPercent = (n: number) => `${(n * 100).toFixed(0)}%`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.POSSIBLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}
    >
      <cfg.Icon size={13} variant="Bold" />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "text-ink-3" };
  return (
    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
  );
}

function PostCard({
  post,
  label,
  accent,
}: {
  post: CasePost;
  label: string;
  accent: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-edge bg-surface p-4">
      <p
        className={`text-[10px] font-semibold uppercase tracking-widest ${accent}`}
      >
        {label}
      </p>
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-high">
          {post.thumbnailUrl ? (
            <Image
              src={post.thumbnailUrl}
              alt={post.title}
              fill
              sizes="44px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <DocumentText1 size={20} className="text-ink-3" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {post.title}
          </p>
          {post.authorUsername && (
            <p className="text-xs text-ink-3">@{post.authorUsername}</p>
          )}
          <p className="mt-1 text-xs text-ink-3">
            {post.viewCount.toLocaleString()} views ·{" "}
            {formatDate(post.createdAt)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push(`/post/${post.id}`)}
        className="mt-1 w-full rounded-xl border border-edge py-2 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-high active:opacity-60"
      >
        View post
      </button>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * score;
  const color =
    score >= 0.5 ? "#C0392B" : score >= 0.25 ? "#E67E22" : "#F1C40F";
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" className="shrink-0">
      <circle
        cx={44}
        cy={44}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={8}
        className="text-surface-high"
      />
      <circle
        cx={44}
        cy={44}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
      />
      <text
        x={44}
        y={44}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-ink"
        style={{ fontSize: 16, fontWeight: 700 }}
      >
        {pct}%
      </text>
    </svg>
  );
}

function ChunkBlock({
  chunk,
  isHighlighted,
  onClick,
  chunkRef,
}: {
  chunk: ChunkInfo;
  isHighlighted: boolean;
  onClick?: () => void;
  chunkRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={chunkRef}
      onClick={onClick}
      className={`rounded-xl border p-3 text-xs leading-relaxed transition-colors ${
        chunk.isMatched
          ? isHighlighted
            ? "cursor-pointer border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
            : "cursor-pointer border-red-200 bg-red-50/60 text-ink hover:border-red-400 dark:border-red-800 dark:bg-red-900/20"
          : "border-edge bg-surface text-ink-2"
      }`}
    >
      {chunk.isMatched && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              chunk.matchType === "exact"
                ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200"
                : "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200"
            }`}
          >
            {chunk.matchType === "exact" ? "Exact" : "Fuzzy"}
          </span>
          <span className="text-[10px] font-semibold text-ink-3">
            {chunk.similarity != null
              ? `${(chunk.similarity * 100).toFixed(0)}% match`
              : ""}
          </span>
        </div>
      )}
      <p className="whitespace-pre-wrap break-words font-mono">{chunk.text}</p>
    </div>
  );
}

function ComparisonPanel({ comparison }: { comparison: ComparisonData }) {
  const [activeOrigIdx, setActiveOrigIdx] = useState<number | null>(null);
  const [activeSuspIdx, setActiveSuspIdx] = useState<number | null>(null);

  const origRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const suspRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleOrigClick = (chunk: ChunkInfo) => {
    if (!chunk.isMatched) return;
    setActiveOrigIdx(chunk.index);
    setActiveSuspIdx(chunk.matchedIndex ?? null);
    if (chunk.matchedIndex != null) {
      suspRefs.current
        .get(chunk.matchedIndex)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSuspClick = (chunk: ChunkInfo) => {
    if (!chunk.isMatched) return;
    setActiveSuspIdx(chunk.index);
    setActiveOrigIdx(chunk.matchedIndex ?? null);
    if (chunk.matchedIndex != null) {
      origRefs.current
        .get(chunk.matchedIndex)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const matchedCount = comparison.suspectedChunks.filter(
    (c) => c.isMatched,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-3">
        {matchedCount} of {comparison.suspectedChunks.length} sections matched.
        Click a highlighted section to jump to its match.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Original post column */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 dark:text-green-400">
            Original
          </p>
          <div className="flex flex-col gap-2">
            {comparison.originalChunks.map((chunk) => (
              <ChunkBlock
                key={chunk.index}
                chunk={chunk}
                isHighlighted={activeOrigIdx === chunk.index}
                onClick={() => handleOrigClick(chunk)}
                chunkRef={(el) => {
                  if (el) origRefs.current.set(chunk.index, el);
                  else origRefs.current.delete(chunk.index);
                }}
              />
            ))}
          </div>
        </div>

        {/* Suspected copy column */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
            Suspected Copy
          </p>
          <div className="flex flex-col gap-2">
            {comparison.suspectedChunks.map((chunk) => (
              <ChunkBlock
                key={chunk.index}
                chunk={chunk}
                isHighlighted={activeSuspIdx === chunk.index}
                onClick={() => handleSuspClick(chunk)}
                chunkRef={(el) => {
                  if (el) suspRefs.current.set(chunk.index, el);
                  else suspRefs.current.delete(chunk.index);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Timeline({ events }: { events: CaseEvent[] }) {
  return (
    <div className="flex flex-col gap-0">
      {events.map((event, i) => {
        const Icon = EVENT_ICON[event.type] ?? InfoCircle;
        const isLast = i === events.length - 1;
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-high border border-edge">
                <Icon size={14} className="text-ink-2" variant="Bulk" />
              </div>
              {!isLast && <div className="mt-1 h-full w-px bg-edge" />}
            </div>
            <div className={`min-w-0 flex-1 pb-5 ${isLast ? "" : ""}`}>
              <p className="text-sm font-medium text-ink">
                {event.description}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {formatDate(event.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppealItem({ appeal }: { appeal: CaseAppeal }) {
  const statusColor =
    appeal.status === "APPROVED"
      ? "text-green-600"
      : appeal.status === "REJECTED"
        ? "text-red-600"
        : "text-amber-600";
  return (
    <div className="rounded-[18px] border border-edge bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Appeal</p>
        <span className={`text-xs font-medium ${statusColor}`}>
          {appeal.status}
        </span>
      </div>
      <p className="text-sm text-ink-2">{appeal.reason}</p>
      {appeal.response && (
        <div className="mt-3 rounded-xl bg-surface-high p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Moderator Response
          </p>
          <p className="text-sm text-ink">{appeal.response}</p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-3">
        {formatDate(appeal.createdAt)}
      </p>
    </div>
  );
}

function ModeratorPanel({
  caseId,
  onAction,
}: {
  caseId: string;
  onAction: () => void;
}) {
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = [
    {
      value: "CONFIRM",
      label: "Confirm Plagiarism",
      desc: "Mark case as resolved — plagiarism confirmed.",
    },
    {
      value: "DISMISS",
      label: "Dismiss Case",
      desc: "No plagiarism found. Stop revenue redirect.",
    },
    {
      value: "RESTORE_REVENUE",
      label: "Restore Revenue Redirect",
      desc: "Re-enable revenue redirection to original author.",
    },
    {
      value: "STOP_REVENUE",
      label: "Stop Revenue Redirect",
      desc: "Allow revenue to flow back to the uploader.",
    },
  ];

  const handleSubmit = async () => {
    if (!action) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/plagiarism/cases/${caseId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Action failed");
        return;
      }
      setAction("");
      setNote("");
      onAction();
    } catch {
      setError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-[22px] border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-800 dark:bg-amber-900/10">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
        Moderator Controls
      </p>
      {error && <Alert message={error} type="error" />}
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <label
            key={a.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${action === a.value ? "border-amber-400 bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30" : "border-edge bg-surface hover:bg-surface-high"}`}
          >
            <input
              type="radio"
              name="moderateAction"
              value={a.value}
              checked={action === a.value}
              onChange={() => setAction(a.value)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <p className="text-sm font-semibold text-ink">{a.label}</p>
              <p className="text-xs text-ink-3">{a.desc}</p>
            </div>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Moderator note (optional)"
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        type="button"
        disabled={!action || isSubmitting}
        onClick={() => void handleSubmit()}
        className="mt-3 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40 active:opacity-80"
      >
        {isSubmitting ? "Submitting…" : "Apply Action"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const caseId = params?.caseId as string;
  const { user, isLoading: isLoadingAuth } = useAuth();

  const [caseData, setCaseData] = useState<PlagiarismCaseData | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appealReason, setAppealReason] = useState("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSuccess, setAppealSuccess] = useState(false);

  useEffect(() => {
    if (!isLoadingAuth && !user) router.replace("/login");
  }, [isLoadingAuth, router, user]);

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/plagiarism/cases/${caseId}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Failed to load case");
        return;
      }
      setCaseData(body?.case ?? null);
    } catch {
      setError("Failed to load case");
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void fetchCase();
  }, [fetchCase]);

  const loadComparison = async () => {
    if (comparison) {
      setShowComparison(true);
      return;
    }
    setIsLoadingComparison(true);
    try {
      const res = await fetch(`/api/plagiarism/cases/${caseId}/comparison`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Failed to load comparison");
        return;
      }
      setComparison(body?.comparison ?? null);
      setShowComparison(true);
    } catch {
      setError("Failed to load comparison");
    } finally {
      setIsLoadingComparison(false);
    }
  };

  const submitAppeal = async () => {
    const reason = appealReason.trim();
    if (reason.length < 20) {
      setAppealError("Please provide at least 20 characters.");
      return;
    }
    setIsSubmittingAppeal(true);
    setAppealError(null);
    try {
      const res = await fetch(`/api/plagiarism/cases/${caseId}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAppealError(body?.error ?? "Failed to submit appeal");
        return;
      }
      setAppealSuccess(true);
      setAppealReason("");
      void fetchCase();
    } catch {
      setAppealError("Network error");
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  if (isLoading || isLoadingAuth) {
    return (
      <div className="min-h-dvh bg-page">
        <div className="flex h-14 items-center gap-3 border-b border-edge bg-surface px-4">
          <button type="button" onClick={() => router.back()} className="p-1">
            <ArrowLeft size={20} className="text-ink" />
          </button>
          <p className="font-semibold text-ink">Case Details</p>
        </div>
        <div className="flex items-center justify-center pt-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-ink-2" />
        </div>
      </div>
    );
  }

  if (error && !caseData) {
    return (
      <div className="min-h-dvh bg-page">
        <div className="flex h-14 items-center gap-3 border-b border-edge bg-surface px-4">
          <button type="button" onClick={() => router.back()} className="p-1">
            <ArrowLeft size={20} className="text-ink" />
          </button>
          <p className="font-semibold text-ink">Case Details</p>
        </div>
        <div className="mx-auto max-w-xl px-4 pt-10">
          <Alert message={error} type="error" />
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const c = caseData;
  const summary = (() => {
    try {
      return JSON.parse(c.matchSummaryJson);
    } catch {
      return {};
    }
  })();
  const isOriginalAuthor = c.viewerRole === "ORIGINAL_AUTHOR";
  const isSuspectedCopier = c.viewerRole === "SUSPECTED_COPIER";
  const isModerator = c.viewerRole === "MODERATOR";
  const isParty = isOriginalAuthor || isSuspectedCopier;

  const hasPendingAppeal = c.appeals.some(
    (a) => a.userId === user?.id && a.status === "PENDING",
  );
  const canAppeal =
    isParty &&
    c.status !== "RESOLVED" &&
    c.status !== "DISMISSED" &&
    !hasPendingAppeal;

  return (
    <div className="min-h-dvh bg-page">
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-edge bg-surface/90 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-high active:opacity-60"
        >
          <ArrowLeft size={20} className="text-ink" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="truncate font-semibold text-ink">Content Review</p>
          <span className="hidden shrink-0 font-mono text-xs text-ink-3 sm:block">
            #{c.id.slice(0, 8)}
          </span>
        </div>
        <VerdictBadge verdict={c.verdict} />
      </div>

      {error && (
        <div className="px-4 pt-4">
          <Alert message={error} type="error" />
        </div>
      )}

      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-28 pt-6">
        {/* Role banner */}
        {isOriginalAuthor && (
          <div className="flex items-start gap-3 rounded-[18px] border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/15">
            <ShieldTick
              size={18}
              className="mt-0.5 shrink-0 text-green-600 dark:text-green-400"
              variant="Bulk"
            />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                You are the original author
              </p>
              <p className="text-xs text-green-700 dark:text-green-400">
                {c.revenueRedirectEnabled
                  ? "Revenue from the suspected copy is being automatically redirected to you."
                  : "Monitor this case for moderation updates."}
              </p>
            </div>
          </div>
        )}
        {isSuspectedCopier && (
          <div className="flex items-start gap-3 rounded-[18px] border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
            <Warning2
              size={18}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
              variant="Bulk"
            />
            <div>
              <p className="text-sm font-semibold text-black dark:text-white">
                Your upload is under review
              </p>
              <p className="text-xs text-black dark:text-white">
                Your document was flagged for similarity with an existing
                document. You may appeal below if you believe this is incorrect.
              </p>
            </div>
          </div>
        )}

        {/* Score + status hero */}
        <section className="rounded-[22px] border border-edge bg-surface p-5 shadow-[0_10px_30px_rgba(17,17,17,0.04)]">
          <div className="flex items-center gap-5">
            <ScoreRing score={c.similarityScore} />
            <div className="flex-1">
              <p className="text-2xl font-bold text-ink">
                {formatPercent(c.similarityScore)} Similar
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} />
                <span className="text-ink-3">·</span>
                <span className="text-xs text-ink-3">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-3">
                <span>
                  <strong className="text-ink">{c.matchedChunkCount}</strong> /{" "}
                  {c.totalChunkCount} sections matched
                </span>
                {summary?.matches?.[0]?.confidence != null && (
                  <span>
                    Confidence:{" "}
                    <strong className="text-ink">
                      {formatPercent(summary.matches[0].confidence)}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>
          {c.revenueRedirect?.active && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 dark:bg-green-900/20">
              <TickCircle
                size={14}
                className="text-green-600 dark:text-green-400"
                variant="Bold"
              />
              <p className="text-xs font-medium text-green-700 dark:text-green-400">
                Revenue is being redirected to the original author (
                {c.revenueRedirect.redirectPercentage}%)
              </p>
            </div>
          )}
          {c.moderatorNote && (
            <div className="mt-3 rounded-xl border border-edge bg-surface-high px-3 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                Moderator Note
              </p>
              <p className="text-sm text-ink">{c.moderatorNote}</p>
            </div>
          )}
        </section>

        {/* Post comparison cards */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Documents
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PostCard
              post={c.originalPost}
              label="Original"
              accent="text-green-600 dark:text-green-400"
            />
            <PostCard
              post={c.suspectedPost}
              label="Suspected Copy"
              accent="text-red-600 dark:text-red-400"
            />
          </div>
        </section>

        {/* Side-by-side chunk comparison */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
              Section Comparison
            </h2>
            {!showComparison && (
              <button
                type="button"
                onClick={() => void loadComparison()}
                disabled={isLoadingComparison}
                className="rounded-full border border-edge px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-high disabled:opacity-50 active:opacity-60"
              >
                {isLoadingComparison ? "Loading…" : "Load comparison"}
              </button>
            )}
            {showComparison && (
              <button
                type="button"
                onClick={() => setShowComparison(false)}
                className="rounded-full border border-edge px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-high active:opacity-60"
              >
                Collapse
              </button>
            )}
          </div>
          {showComparison && comparison ? (
            <ComparisonPanel comparison={comparison} />
          ) : !showComparison ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-edge bg-surface py-10 text-center">
              <DocumentText1 size={32} className="mb-2 text-ink-3" />
              <p className="text-sm text-ink-3">
                Load the comparison to see highlighted matching sections.
              </p>
            </div>
          ) : null}
        </section>

        {/* Timeline */}
        {c.events.length > 0 && (
          <section>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
              Case Timeline
            </h2>
            <div className="rounded-[22px] border border-edge bg-surface p-5 shadow-[0_10px_30px_rgba(17,17,17,0.04)]">
              <Timeline events={c.events} />
            </div>
          </section>
        )}

        {/* Appeals */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Appeals
          </h2>
          {c.appeals.length > 0 && (
            <div className="mb-4 flex flex-col gap-3">
              {c.appeals.map((a) => (
                <AppealItem key={a.id} appeal={a} />
              ))}
            </div>
          )}

          {canAppeal && !appealSuccess && (
            <div className="rounded-[22px] border border-edge bg-surface p-5">
              <p className="mb-1 text-sm font-semibold text-ink">
                Submit an appeal
              </p>
              <p className="mb-4 text-xs text-ink-3">
                {isOriginalAuthor
                  ? "Believe this was incorrectly handled? Provide evidence or context below."
                  : "Think this was flagged in error? Explain the context or original source of your work."}
              </p>
              {appealError && <Alert message={appealError} type="error" />}
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain your situation in detail (minimum 20 characters)…"
                rows={4}
                className="w-full resize-none rounded-xl border border-edge bg-surface-high px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-[#E1761F]"
              />
              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`text-xs ${appealReason.trim().length >= 20 ? "text-ink-3" : "text-red-500"}`}
                >
                  {appealReason.trim().length} / 20 min
                </span>
                <button
                  type="button"
                  disabled={
                    appealReason.trim().length < 20 || isSubmittingAppeal
                  }
                  onClick={() => void submitAppeal()}
                  className="rounded-xl bg-[#131212] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a2a] disabled:opacity-40 active:opacity-70"
                >
                  {isSubmittingAppeal ? "Submitting…" : "Submit Appeal"}
                </button>
              </div>
            </div>
          )}

          {appealSuccess && (
            <div className="flex items-center gap-2 rounded-[18px] border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/15">
              <TickCircle size={16} className="text-green-600" variant="Bold" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Appeal submitted. Our team will review it shortly.
              </p>
            </div>
          )}

          {c.appeals.length === 0 && !canAppeal && (
            <p className="text-sm text-ink-3">
              No appeals have been submitted for this case.
            </p>
          )}
        </section>

        {/* Moderator panel */}
        {isModerator && (
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
              Moderation
            </h2>
            <ModeratorPanel caseId={c.id} onAction={() => void fetchCase()} />
          </section>
        )}
      </main>
    </div>
  );
}
