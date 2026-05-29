"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminSidebar from "../components/AdminSidebar";
import {
  HiDocumentText,
  HiTrash,
  HiMagnifyingGlass,
  HiFunnel,
  HiEllipsisVertical,
  HiEye,
  HiArrowDownTray,
  HiHeart,
  HiSquares2X2,
  HiDocumentDuplicate,
  HiArrowPath,
  HiXMark,
  HiTag,
} from "react-icons/hi2";

// ── Types ──────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  title: string;
  authorId: string | null;
  authorUsername: string | null;
  categories: string[];
  fileType: string;
  viewCount: number;
  likeCount: number;
  downloadCount: number;
  revenue: number;
  createdAt: string;
  deleted: boolean;
  thumbnailUrl: string | null;
};

type Stats = {
  totalActive: number;
  totalRemoved: number;
  categories: { name: string; count: number }[];
  fileTypes: { type: string; count: number; percent: number }[];
};

type Tab = "all" | "removed" | "categories" | "filetypes" | "duplicates";

// ── Types ──────────────────────────────────────────────────────────────────

type PlagiarismCase = {
  id: string;
  originalPostId: string;
  originalTitle: string;
  originalAuthor: string | null;
  suspectedPostId: string;
  suspectedTitle: string;
  suspectedAuthor: string | null;
  similarityScore: number;
  verdict: string;
  status: string;
  createdAt: string;
};

// ── Tabs config ─────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All Uploads", icon: HiDocumentText },
  { id: "removed", label: "Removed", icon: HiTrash },
  { id: "categories", label: "Categories", icon: HiTag },
  { id: "filetypes", label: "File Types", icon: HiSquares2X2 },
  { id: "duplicates", label: "Duplicates", icon: HiDocumentDuplicate },
];

const TABLE_TABS: Tab[] = ["all", "removed"];
const PAGE_SIZE = 20;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Row skeleton ────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <tr className="border-b border-black/5">
      {[48, 120, 72, 48, 40, 64, 24].map((w, i) => (
        <td key={i} className="px-3 py-4 first:pl-6 last:pr-6">
          <div
            className="h-3.5 animate-pulse rounded-full bg-black/6"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── DocRow ─────────────────────────────────────────────────────────────────

function DocRow({
  post,
  onDelete,
  onRestore,
  onView,
}: {
  post: Post;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onView: (post: Post) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [armDelete, setArmDelete] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setArmDelete(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  };

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        closeMenu();
    }
    if (menuOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const initials = post.authorUsername
    ? post.authorUsername.slice(0, 2).toUpperCase()
    : "?";

  return (
    <tr
      className="group cursor-pointer border-b border-black/5 last:border-0 hover:bg-[#fafafa]"
      onClick={() => onView(post)}
    >
      {/* File */}
      <td className="py-3 pl-6 pr-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[10px] font-bold text-[#64748b]">
            {post.fileType.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="max-w-50 truncate text-sm font-medium text-[#111] group-hover:text-[#E1761F]">
              {post.title}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {post.authorUsername ? (
                <>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E1761F]/10 text-[9px] font-bold text-[#E1761F]">
                    {initials}
                  </div>
                  <span className="text-xs text-[#888]">
                    {post.authorUsername}
                  </span>
                </>
              ) : (
                <span className="text-xs text-[#bbb]">deleted user</span>
              )}
            </div>
          </div>
        </div>
      </td>
      {/* Categories */}
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {post.categories.slice(0, 2).map((c) => (
            <span
              key={c}
              className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium capitalize text-[#555]"
            >
              {c}
            </span>
          ))}
        </div>
      </td>
      {/* Views / Downloads */}
      <td className="px-3 py-3 text-xs text-[#555]">
        <div className="flex items-center gap-1">
          <HiEye className="h-3.5 w-3.5 text-[#bbb]" />
          {post.viewCount.toLocaleString()}
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <HiHeart className="h-3.5 w-3.5 text-[#bbb]" />
          {post.likeCount.toLocaleString()}
        </div>
      </td>
      {/* Revenue */}
      <td className="px-3 py-3 text-sm font-medium text-[#111]">
        {post.revenue > 0 ? (
          `$${post.revenue.toFixed(2)}`
        ) : (
          <span className="text-[#ddd]">—</span>
        )}
      </td>
      {/* Date */}
      <td className="px-3 py-3 text-xs text-[#888]">
        {fmtDate(post.createdAt)}
      </td>
      {/* Actions */}
      <td className="py-3 pl-3 pr-6" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex justify-end" ref={menuRef}>
          <button
            type="button"
            aria-label="Open actions menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1.5 text-[#bbb] opacity-0 transition-all hover:bg-black/5 hover:text-[#555] group-hover:opacity-100"
          >
            <HiEllipsisVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-black/8 bg-white py-1 shadow-lg">
              {post.deleted ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-green-600 hover:bg-green-50"
                  onClick={() => {
                    onRestore(post.id);
                    closeMenu();
                  }}
                >
                  <HiArrowPath className="h-3.5 w-3.5" /> Restore
                </button>
              ) : armDelete ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  onClick={() => {
                    onDelete(post.id);
                    closeMenu();
                  }}
                >
                  <HiTrash className="h-3.5 w-3.5" /> Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                  onClick={() => {
                    setArmDelete(true);
                    armTimer.current = setTimeout(
                      () => setArmDelete(false),
                      3000,
                    );
                  }}
                >
                  <HiTrash className="h-3.5 w-3.5" /> Delete file
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Panel more menu ────────────────────────────────────────────────────────

function PanelMoreMenu({ post, onClose }: { post: Post; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [armDelete, setArmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setArmDelete(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleDelete() {
    await fetch("/api/admin/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    });
    onClose();
  }

  async function handleRestore() {
    await fetch("/api/admin/uploads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    });
    onClose();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More options"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl p-2 text-[#888] hover:bg-black/5 hover:text-[#333]"
      >
        <HiEllipsisVertical className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-10 w-48 rounded-xl border border-black/8 bg-white py-1 shadow-lg">
          <a
            href={`/api/admin/uploads/file?id=${post.id}`}
            download
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[#333] hover:bg-[#f9f9f9]"
            onClick={() => setOpen(false)}
          >
            <HiArrowDownTray className="h-3.5 w-3.5 text-[#999]" /> Download
          </a>
          <div className="my-1 border-t border-black/5" />
          {post.deleted ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-green-600 hover:bg-green-50"
              onClick={() => { void handleRestore(); setOpen(false); }}
            >
              <HiArrowPath className="h-3.5 w-3.5" /> Restore post
            </button>
          ) : (
            armDelete ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                onClick={() => { void handleDelete(); setOpen(false); }}
              >
                <HiTrash className="h-3.5 w-3.5" /> Confirm delete
              </button>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                onClick={() => setArmDelete(true)}
              >
                <HiTrash className="h-3.5 w-3.5" /> Delete post
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Side-by-side comparison view ───────────────────────────────────────────

function ComparisonView({
  c,
  onClose,
  onDismiss,
}: {
  c: PlagiarismCase;
  onClose: () => void;
  onDismiss: (id: string) => void;
}) {
  const [armRemove, setArmRemove] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const verdictColor =
    c.verdict === "DUPLICATE"  ? "#dc2626" :
    c.verdict === "SUSPICIOUS" ? "#d97706" : "#6b7280";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-black/8 bg-white px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
              style={{ background: verdictColor }}
            >
              {Math.round(c.similarityScore)}% match
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-[#888]">
              Comparing <span className="text-[#111]">{c.originalTitle}</span>
              {" "}&amp;{" "}
              <span className="text-[#111]">{c.suspectedTitle}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {armRemove ? (
              <button
                type="button"
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                onClick={() => { onDismiss(c.id); onClose(); }}
              >
                Confirm remove copy
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                onClick={() => {
                  setArmRemove(true);
                  armTimer.current = setTimeout(() => setArmRemove(false), 3000);
                }}
              >
                Remove copy
              </button>
            )}
            <button
              type="button"
              className="rounded-xl border border-black/8 px-4 py-2 text-sm text-[#555] hover:bg-[#f9f9f9]"
              onClick={() => { onDismiss(c.id); onClose(); }}
            >
              Dismiss
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-xl p-2 text-[#888] hover:bg-black/5 hover:text-[#333]"
            >
              <HiXMark className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Split panes */}
        <div className="flex min-h-0 flex-1 divide-x divide-black/8">
          {/* Original */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-green-50 px-5 py-2.5">
              <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                Original
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-[#111]">{c.originalTitle}</span>
              {c.originalAuthor && (
                <span className="shrink-0 text-xs text-[#888]">by {c.originalAuthor}</span>
              )}
            </div>
            <iframe
              src={`/api/admin/uploads/file?id=${c.originalPostId}`}
              className="h-full w-full border-0"
              title={c.originalTitle}
            />
          </div>

          {/* Copy */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-red-50 px-5 py-2.5">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                Copy
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-[#111]">{c.suspectedTitle}</span>
              {c.suspectedAuthor && (
                <span className="shrink-0 text-xs text-[#888]">by {c.suspectedAuthor}</span>
              )}
            </div>
            <iframe
              src={`/api/admin/uploads/file?id=${c.suspectedPostId}`}
              className="h-full w-full border-0"
              title={c.suspectedTitle}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Post viewer panel ──────────────────────────────────────────────────────

function PostPanel({ post, onClose }: { post: Post; onClose: () => void }) {
  const isPdf = post.fileType === "pdf";
  const fileUrl = `/api/admin/uploads/file?id=${post.id}`;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-170 max-w-[95vw] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-black/8 px-6 py-4">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#555]">
                {post.fileType.toUpperCase()}
              </span>
              {post.deleted && (
                <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  Removed
                </span>
              )}
            </div>
            <h2 className="mt-1.5 truncate text-base font-semibold text-[#111]">
              {post.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#888]">
              {post.authorUsername && <span>by {post.authorUsername}</span>}
              {post.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-[#f3f4f6] px-2 py-0.5 capitalize text-[#555]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-1">
            <PanelMoreMenu post={post} onClose={onClose} />
            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="rounded-xl p-2 text-[#888] hover:bg-black/5 hover:text-[#333]"
            >
              <HiXMark className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Document viewer */}
        <div className="relative flex-1 bg-[#f8f8f8]">
          {isPdf ? (
            <iframe
              src={fileUrl}
              className="h-full w-full border-0"
              title={post.title}
            />
          ) : (
            <iframe
              src={fileUrl}
              className="h-full w-full border-0 bg-white"
              title={post.title}
              sandbox="allow-same-origin"
            />
          )}
        </div>

        {/* Footer stats */}
        <div className="flex shrink-0 items-center gap-6 border-t border-black/8 bg-white px-6 py-3">
          <div className="flex items-center gap-1.5 text-xs text-[#888]">
            <HiEye className="h-3.5 w-3.5" />
            {post.viewCount.toLocaleString()} views
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#888]">
            <HiHeart className="h-3.5 w-3.5" />
            {post.likeCount.toLocaleString()} likes
          </div>
          {post.revenue > 0 && (
            <div className="text-xs font-medium text-[#111]">
              ${post.revenue.toFixed(2)} revenue
            </div>
          )}
          <div className="ml-auto text-xs text-[#bbb]">
            {fmtDate(post.createdAt)}
          </div>
          <a
            href={fileUrl}
            download
            className="flex items-center gap-1.5 rounded-lg border border-black/8 px-3 py-1.5 text-xs font-medium text-[#555] hover:bg-[#f9f9f9]"
          >
            <HiArrowDownTray className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UploadsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  const [comparingCase, setComparingCase] = useState<PlagiarismCase | null>(null);
  const [plagiarismCases, setPlagiarismCases] = useState<PlagiarismCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
  }, [search]);

  // Reset page on tab/search change
  useEffect(() => {
    setPage(0);
  }, [tab, debouncedSearch]);

  // Fetch posts when on a table tab
  const fetchPosts = useCallback(async () => {
    if (!TABLE_TABS.includes(tab)) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        deleted: tab === "removed" ? "true" : "false",
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/admin/uploads?${params}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [tab, page, debouncedSearch]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  // Fetch stats once
  useEffect(() => {
    setStatsLoading(true);
    fetch("/api/admin/uploads?type=stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .finally(() => setStatsLoading(false));
  }, []);

  // Fetch plagiarism cases when tab becomes active
  useEffect(() => {
    if (tab !== "duplicates") return;
    setCasesLoading(true);
    fetch("/api/admin/uploads?type=plagiarism")
      .then((r) => r.json())
      .then((d) => setPlagiarismCases(d.cases ?? []))
      .finally(() => setCasesLoading(false));
  }, [tab]);

  function handleDismissCase(id: string) {
    setPlagiarismCases((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleDelete(id: string) {
    await fetch("/api/admin/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void fetchPosts();
    setStats((s) =>
      s
        ? {
            ...s,
            totalActive: s.totalActive - 1,
            totalRemoved: s.totalRemoved + 1,
          }
        : s,
    );
  }

  async function handleRestore(id: string) {
    await fetch("/api/admin/uploads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void fetchPosts();
    setStats((s) =>
      s
        ? {
            ...s,
            totalActive: s.totalActive + 1,
            totalRemoved: s.totalRemoved - 1,
          }
        : s,
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex h-screen bg-[#f3f4f6]">
      <AdminSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/8 bg-white px-8 py-5">
          <div>
            <h1 className="text-lg font-semibold text-[#111]">Uploads</h1>
            <p className="mt-0.5 text-sm text-[#888]">
              Manage documents, categories, and file health
            </p>
          </div>
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1.5 text-xs font-medium text-[#555]">
            {statsLoading
              ? "…"
              : `${(stats?.totalActive ?? 0).toLocaleString()} active files`}
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {/* Stats strip */}
          <div className="grid grid-cols-4 divide-x divide-black/5 border-b border-black/8 bg-white">
            {[
              {
                label: "Total uploads",
                value: statsLoading
                  ? "…"
                  : (stats?.totalActive ?? 0).toLocaleString(),
                color: "#111",
              },
              {
                label: "Removed",
                value: statsLoading
                  ? "…"
                  : (stats?.totalRemoved ?? 0).toLocaleString(),
                color: "#6b7280",
              },
              {
                label: "File types",
                value: statsLoading
                  ? "…"
                  : String(stats?.fileTypes.length ?? 0),
                color: "#111",
              },
              {
                label: "Categories",
                value: statsLoading
                  ? "…"
                  : String(stats?.categories.length ?? 0),
                color: "#111",
              },
            ].map((s) => (
              <div key={s.label} className="px-8 py-4">
                <p className="text-xs text-[#888]">{s.label}</p>
                <p
                  className="mt-0.5 text-2xl font-semibold"
                  style={{ color: s.color }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Tab nav */}
          <div className="flex gap-0 overflow-x-auto border-b border-black/8 bg-white px-6">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              const count =
                id === "all"
                  ? stats?.totalActive
                  : id === "removed"
                    ? stats?.totalRemoved
                    : id === "duplicates"
                      ? (plagiarismCases.length || undefined)
                      : undefined;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-[#E1761F] text-[#E1761F]"
                      : "border-transparent text-[#888] hover:text-[#555]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-[#E1761F]/10 text-[#E1761F]" : "bg-[#f3f4f6] text-[#888]"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Table tabs ── */}
          {TABLE_TABS.includes(tab) && (
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="relative max-w-sm flex-1">
                  <HiMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#bbb]" />
                  <input
                    type="text"
                    placeholder="Search title or author…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-black/8 bg-white py-2.5 pl-9 pr-4 text-sm text-[#111] placeholder:text-[#ccc] focus:border-[#E1761F]/40 focus:outline-none focus:ring-2 focus:ring-[#E1761F]/10"
                  />
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-black/8 bg-white px-4 py-2.5 text-sm text-[#555] hover:bg-[#f9f9f9]"
                >
                  <HiFunnel className="h-3.5 w-3.5" /> Filter
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-black/8 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-black/5">
                      {[
                        "File",
                        "Categories",
                        "Views / Downloads",
                        "Revenue",
                        "Uploaded",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className={`py-3 text-left text-xs font-medium text-[#888] ${h === "File" ? "pl-6 pr-3" : h === "" ? "pl-3 pr-6" : "px-3"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <RowSkeleton key={i} />
                      ))
                    ) : posts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-16 text-center text-sm text-[#bbb]"
                        >
                          No files found
                        </td>
                      </tr>
                    ) : (
                      posts.map((p) => (
                        <DocRow
                          key={p.id}
                          post={p}
                          onDelete={handleDelete}
                          onRestore={handleRestore}
                          onView={setViewingPost}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-xs text-[#888]">
                  <span>
                    Showing {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
                    {total.toLocaleString()} files
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg px-2.5 py-1.5 font-medium text-[#555] hover:bg-black/5 disabled:opacity-30"
                    >
                      ←
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPage(i)}
                        className={`rounded-lg px-2.5 py-1.5 font-medium transition-colors ${page === i ? "bg-[#E1761F] text-white" : "text-[#555] hover:bg-black/5"}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg px-2.5 py-1.5 font-medium text-[#555] hover:bg-black/5 disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Categories ── */}
          {tab === "categories" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-[#888]">
                  {statsLoading ? "…" : (stats?.categories.length ?? 0)}{" "}
                  categories
                </p>
                <button
                  type="button"
                  className="rounded-xl bg-[#E1761F] px-4 py-2 text-sm font-medium text-white hover:bg-[#c96a1a]"
                >
                  + New category
                </button>
              </div>
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 animate-pulse rounded-2xl bg-white border border-black/8"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {(stats?.categories ?? []).map((cat, i) => {
                    const colors = [
                      "#6366f1",
                      "#0ea5e9",
                      "#f59e0b",
                      "#10b981",
                      "#8b5cf6",
                      "#ef4444",
                      "#f97316",
                      "#ec4899",
                      "#14b8a6",
                      "#84cc16",
                    ];
                    const color = colors[i % colors.length];
                    return (
                      <div
                        key={cat.name}
                        className="group rounded-2xl border border-black/8 bg-white p-5 transition-shadow hover:shadow-sm"
                      >
                        <div
                          className="mb-3 h-1.5 w-8 rounded-full"
                          style={{ background: color }}
                        />
                        <p className="font-medium capitalize text-[#111]">
                          {cat.name}
                        </p>
                        <p className="mt-1 text-sm text-[#888]">
                          {cat.count.toLocaleString()} files
                        </p>
                        <div className="mt-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded-lg px-2.5 py-1 text-xs text-[#555] hover:bg-[#f3f4f6]"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="rounded-lg px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── File Types ── */}
          {tab === "filetypes" && (
            <div className="p-6">
              <div className="max-w-lg space-y-3">
                {statsLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-24 animate-pulse rounded-2xl border border-black/8 bg-white"
                      />
                    ))
                  : (stats?.fileTypes ?? []).map((ft) => (
                      <div
                        key={ft.type}
                        className="rounded-2xl border border-black/8 bg-white p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-xs font-bold text-[#555]">
                              {ft.type}
                            </div>
                            <div>
                              <p className="font-medium text-[#111]">
                                {ft.count.toLocaleString()} files
                              </p>
                              <p className="text-sm text-[#888]">
                                {ft.percent}% of all uploads
                              </p>
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-[#111]">
                            {ft.percent}%
                          </span>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
                          <div
                            className="h-full rounded-full bg-[#E1761F]"
                            style={{ width: `${ft.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          )}

          {/* ── Duplicates ── */}
          {tab === "duplicates" && (
            <div className="p-6">
              <p className="mb-4 text-sm text-[#888]">
                {casesLoading ? "Loading…" : `${plagiarismCases.length} suspected duplicate pairs`}
              </p>

              {casesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-2xl border border-black/8 bg-white" />
                  ))}
                </div>
              ) : plagiarismCases.length === 0 ? (
                <div className="rounded-2xl border border-black/8 bg-white py-16 text-center text-sm text-[#bbb]">
                  No duplicate cases found
                </div>
              ) : (
                <div className="space-y-3">
                  {plagiarismCases.map((c) => {
                    const pct = Math.round(c.similarityScore);
                    const scoreColor = pct >= 90 ? "#dc2626" : pct >= 75 ? "#d97706" : "#6b7280";
                    return (
                      <div
                        key={c.id}
                        className="group cursor-pointer rounded-2xl border border-black/8 bg-white p-5 transition-shadow hover:shadow-sm"
                        onClick={() => setComparingCase(c)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                Original
                              </span>
                              <span className="text-sm font-medium text-[#111] group-hover:text-[#E1761F]">
                                {c.originalTitle}
                              </span>
                              {c.originalAuthor && (
                                <span className="text-xs text-[#888]">by {c.originalAuthor}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                                Copy
                              </span>
                              <span className="text-sm font-medium text-[#111]">
                                {c.suspectedTitle}
                              </span>
                              {c.suspectedAuthor && (
                                <span className="text-xs text-[#888]">by {c.suspectedAuthor}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-2xl font-bold" style={{ color: scoreColor }}>
                              {pct}%
                            </span>
                            <span className="text-xs capitalize text-[#bbb]">{c.verdict.toLowerCase()}</span>
                            <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="rounded-lg px-3 py-1.5 text-xs text-[#555] hover:bg-[#f3f4f6]"
                                onClick={() => handleDismissCase(c.id)}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-[#E1761F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c96a1a]"
                                onClick={() => setComparingCase(c)}
                              >
                                Compare
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: scoreColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {viewingPost && (
        <PostPanel post={viewingPost} onClose={() => setViewingPost(null)} />
      )}

      {comparingCase && (
        <ComparisonView
          c={comparingCase}
          onClose={() => setComparingCase(null)}
          onDismiss={handleDismissCase}
        />
      )}
    </div>
  );
}
