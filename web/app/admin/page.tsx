"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HiUsers,
  HiArrowUpTray,
  HiClipboardDocumentList,
  HiBanknotes,
  HiCurrencyDollar,
  HiCircleStack,
  HiArrowTrendingUp,
  HiArrowTrendingDown,
  HiArrowRight,
  HiFire,
} from "react-icons/hi2";
import AdminSidebar from "./components/AdminSidebar";

// ─── Types ─────────────────────────────────────────────────────────────────

type ActivityItem = {
  type: string;
  user: string;
  action: string;
  target: string;
  time: string;
};

type ReportItem = {
  id: string;
  category: string;
  title: string;
  resolved: boolean;
  createdAt: string;
  username: string;
};

type TrendingDoc = {
  id: string;
  rank: number;
  title: string;
  category: string;
  viewCount: number;
};

type AdminStats = {
  totalUsers: number;
  newUsersToday: number;
  uploadsToday: number;
  pendingReviews: number;
  pendingPayouts: number;
  revenueThisMonth: number;
  storageBytes?: number;
  uploadBars: number[];
  revenueChart: number[];
  recentActivity: ActivityItem[];
  latestReports: ReportItem[];
  trendingDocs: TrendingDoc[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(username: string): string {
  const upper = username.match(/[A-Z]/g) ?? [];
  if (upper.length >= 2) return upper.slice(0, 2).join("");
  return username.slice(0, 1).toUpperCase();
}

function fmtRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

function buildRevenuePath(data: number[]): { line: string; area: string } {
  if (!data.length) return { line: "", area: "" };
  const W = 560;
  const H = 80;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * W,
    y: H - (v / max) * (H - 6) - 3,
  }));
  const line = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cpX = ((prev.x + pt.x) / 2).toFixed(1);
    return `${acc} C${cpX},${prev.y.toFixed(1)} ${cpX},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }, "");
  return { line, area: `${line} L${W},${H} L0,${H} Z` };
}

const ACTIVITY_COLORS: Record<string, string> = {
  upload: "#E1761F",
  signup: "#3B82F6",
  report: "#EF4444",
  payout: "#F59E0B",
};

const REVENUE_MONTHS = [
  "Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May",
];
const UPLOAD_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[#f0f0f0] ${className ?? ""}`}
    />
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const body = await res.json();
      if (!res.ok || !body.stats) {
        setError(body.error || "Failed to load stats");
        return;
      }
      setStats(body.stats);
    } catch {
      setError("Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Derived values
  const uploadBars = stats?.uploadBars ?? Array(7).fill(0);
  const maxBar = Math.max(...uploadBars, 1);
  const revenueChart = stats?.revenueChart ?? Array(12).fill(0);
  const { line: revLine, area: revArea } = buildRevenuePath(revenueChart);

  const STAT_CARDS = [
    {
      label: "Total Users",
      value: stats ? stats.totalUsers.toLocaleString() : null,
      sub: stats ? `+${stats.newUsersToday} today` : null,
      change: stats ? `+${stats.newUsersToday} today` : "—",
      up: true,
      icon: HiUsers,
      color: "#3B82F6",
      iconBg: "#EFF6FF",
      sparkline: "M0,44 C15,40 30,36 50,30 C70,24 85,18 100,12 C110,8 116,5 120,2",
    },
    {
      label: "Uploads Today",
      value: stats ? String(stats.uploadsToday) : null,
      sub: null,
      change: "today",
      up: true,
      icon: HiArrowUpTray,
      color: "#E1761F",
      iconBg: "#FFF7ED",
      sparkline: "M0,42 C15,38 30,32 50,25 C70,18 85,10 100,6 C110,3 116,1 120,0",
    },
    {
      label: "Pending Reviews",
      value: stats ? String(stats.pendingReviews) : null,
      sub: null,
      change: "unresolved",
      up: (stats?.pendingReviews ?? 0) === 0,
      icon: HiClipboardDocumentList,
      color: "#F59E0B",
      iconBg: "#FFFBEB",
      sparkline: "M0,20 C15,22 30,18 50,26 C70,32 85,28 100,34 C110,38 116,40 120,42",
    },
    {
      label: "Pending Payouts",
      value: stats ? String(stats.pendingPayouts) : null,
      sub: null,
      change: "needs action",
      up: (stats?.pendingPayouts ?? 0) === 0,
      icon: HiBanknotes,
      color: "#EC4899",
      iconBg: "#FDF2F8",
      sparkline: "M0,18 C15,22 30,20 50,28 C70,34 85,30 100,36 C110,40 116,42 120,44",
    },
    {
      label: "Revenue",
      value: stats ? fmtRevenue(stats.revenueThisMonth) : null,
      sub: null,
      change: "this month",
      up: true,
      icon: HiCurrencyDollar,
      color: "#8B5CF6",
      iconBg: "#F5F3FF",
      sparkline: "M0,46 C15,42 30,38 50,30 C70,22 85,14 100,8 C110,4 116,2 120,0",
    },
    {
      label: "Storage Used",
      value: stats ? (stats.storageBytes != null ? `${(stats.storageBytes / 1e9).toFixed(1)} GB` : "—") : null,
      sub: null,
      change: "updated daily",
      up: false,
      icon: HiCircleStack,
      color: "#64748B",
      iconBg: "#F1F5F9",
      storageBytes: stats?.storageBytes ?? null,
    },
  ];

  return (
    <div className="flex h-screen bg-[#f3f4f6]">
      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-black/[0.07] bg-white px-8 py-4">
          <div>
            <h1 className="text-lg font-bold text-[#111]">Dashboard</h1>
            <p className="text-xs text-[#888]">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-black/8 bg-white px-3 py-2 text-xs font-medium text-[#555] transition-colors hover:bg-[#f9fafb] active:scale-95 active:bg-[#f3f4f6] disabled:opacity-40"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/payouts")}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-95 active:bg-amber-700"
            >
              Payout Requests
              {stats && stats.pendingPayouts > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-amber-600">
                  {stats.pendingPayouts}
                </span>
              )}
              <HiArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {/* ── Stat cards ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {STAT_CARDS.map((stat) => {
              const Icon = stat.icon;
              const isStorage = "storageBytes" in stat;
              return (
                <div
                  key={stat.label}
                  className="group flex cursor-default flex-col rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                      style={{ backgroundColor: stat.iconBg }}
                    >
                      <Icon className="h-5 w-5" style={{ color: stat.color }} />
                    </div>
                    <div
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        isStorage
                          ? "bg-slate-100 text-slate-600"
                          : stat.up
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-500"
                      }`}
                    >
                      {!isStorage &&
                        (stat.up ? (
                          <HiArrowTrendingUp className="h-3 w-3" />
                        ) : (
                          <HiArrowTrendingDown className="h-3 w-3" />
                        ))}
                      {stat.change}
                    </div>
                  </div>

                  {loading && !stat.value ? (
                    <Skeleton className="mb-1 h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-[#111]">{stat.value}</p>
                  )}
                  <p className="mt-0.5 text-xs text-[#888]">{stat.label}</p>

                  <div className="mt-4">
                    {isStorage ? (
                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full w-full rounded-full bg-slate-200" />
                        </div>
                        <p className="text-[10px] text-[#aaa]">updated daily via AWS</p>
                      </div>
                    ) : (
                      <svg viewBox="0 0 120 48" className="h-8 w-full" preserveAspectRatio="none">
                        <path
                          d={stat.sparkline}
                          fill="none"
                          stroke={stat.color}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          opacity="0.45"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Charts ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Revenue trend */}
            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#111]">Revenue Trend</h3>
                  <p className="text-xs text-[#888]">Last 12 months</p>
                </div>
                {loading ? (
                  <Skeleton className="h-5 w-20" />
                ) : (
                  <span className="text-sm font-bold text-[#8B5CF6]">
                    {fmtRevenue(stats?.revenueThisMonth ?? 0)} MTD
                  </span>
                )}
              </div>
              <svg viewBox="0 0 560 80" className="w-full" style={{ height: 112 }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {revArea && <path d={revArea} fill="url(#revGrad)" />}
                {revLine && (
                  <path d={revLine} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
                )}
                {!revLine && (
                  <path
                    d="M0,78 L560,78"
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.3"
                  />
                )}
              </svg>
              <div className="mt-2 flex justify-between">
                {REVENUE_MONTHS.map((m) => (
                  <span key={m} className="text-[9px] text-[#bbb]">{m}</span>
                ))}
              </div>
            </div>

            {/* Upload activity */}
            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#111]">Upload Activity</h3>
                  <p className="text-xs text-[#888]">This week</p>
                </div>
                {loading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <span className="text-sm font-bold text-[#E1761F]">
                    {stats?.uploadsToday ?? 0} today
                  </span>
                )}
              </div>
              <div className="flex h-28 items-end gap-2">
                {uploadBars.map((count, i) => {
                  const pct = Math.round((count / maxBar) * 100);
                  const isToday = i === uploadBars.length - 1;
                  return (
                    <div key={i} className="group/bar flex flex-1 flex-col items-center gap-1.5">
                      <div
                        title={`${count} uploads`}
                        className="relative w-full cursor-default rounded-t-md transition-all group-hover/bar:opacity-80"
                        style={{
                          height: `${Math.max(pct, 2)}%`,
                          backgroundColor: isToday ? "#E1761F" : "#E1761F30",
                        }}
                      />
                      <span className={`text-[9px] ${isToday ? "font-semibold text-[#E1761F]" : "text-[#bbb]"}`}>
                        {UPLOAD_DAYS[i]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Trending Today ───────────────────────────────────────── */}
          <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <HiFire className="h-4 w-4 text-[#E1761F]" />
              <h3 className="text-sm font-semibold text-[#111]">Trending Today</h3>
              <span className="text-xs text-[#aaa]">— top documents by views</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {loading
                ? Array(3).fill(null).map((_, i) => (
                    <div key={i} className="rounded-xl border border-black/5 p-3.5 space-y-2">
                      <Skeleton className="h-4 w-6" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))
                : (stats?.trendingDocs ?? []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/5 p-3.5 transition-all hover:border-black/10 hover:bg-[#f9fafb] hover:shadow-sm active:scale-[0.98]"
                    >
                      <span className="mt-0.5 text-lg font-black leading-none text-[#e5e7eb]">
                        #{doc.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[#111]">{doc.title}</p>
                        <p className="mt-0.5 text-[10px] text-[#aaa]">{doc.category}</p>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-[#888]">
                          <span>{doc.viewCount.toLocaleString()} views</span>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* ── Bottom row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Recent Activity */}
            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#111]">Recent Activity</h3>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-[#aaa] transition-colors hover:bg-[#f3f4f6] hover:text-[#555] active:bg-[#e9eaec]"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3.5">
                {loading
                  ? Array(5).fill(null).map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="mt-0.5 h-7 w-7 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                      </div>
                    ))
                  : (stats?.recentActivity ?? []).map((item, i) => {
                      const color = ACTIVITY_COLORS[item.type] ?? "#888";
                      return (
                        <div
                          key={i}
                          className="group/act flex cursor-default items-start gap-3 rounded-xl p-1.5 transition-colors hover:bg-[#f9fafb]"
                        >
                          <div
                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white transition-transform group-hover/act:scale-105"
                            style={{ backgroundColor: color }}
                          >
                            {getInitials(item.user)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-snug text-[#333]">
                              <span className="font-medium">{item.user}</span>{" "}
                              {item.action}
                              {item.target && (
                                <>
                                  {" "}
                                  <span className="font-medium">&ldquo;{item.target}&rdquo;</span>
                                </>
                              )}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[#aaa]">{timeAgo(item.time)}</p>
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>

            {/* Latest Reports */}
            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#111]">Latest Reports</h3>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-[#aaa] transition-colors hover:bg-[#f3f4f6] hover:text-[#555] active:bg-[#e9eaec]"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {loading
                  ? Array(5).fill(null).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5">
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-2.5 w-24" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                        <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
                      </div>
                    ))
                  : (stats?.latestReports ?? []).map((report, i) => (
                      <div
                        key={report.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5 transition-all hover:border-black/10 hover:bg-[#f9fafb] hover:shadow-sm active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-[#bbb]">
                              #{String(i + 1).padStart(3, "0")}
                            </span>
                            <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#555]">
                              {report.category}
                            </span>
                          </div>
                          <p className="truncate text-xs text-[#333]">{report.title}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              report.resolved
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {report.resolved ? "resolved" : "pending"}
                          </span>
                          <span className="text-[10px] text-[#bbb]">{timeAgo(report.createdAt)}</span>
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
