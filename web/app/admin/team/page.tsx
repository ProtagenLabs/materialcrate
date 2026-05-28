"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HiUserPlus,
  HiTrash,
  HiCheckCircle,
  HiXMark,
  HiEye,
  HiEyeSlash,
  HiExclamationTriangle,
} from "react-icons/hi2";
import AdminSidebar from "../components/AdminSidebar";

// ─── Types ─────────────────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  createdAt: string;
};

type Me = { email: string; role: string };

// ─── Constants ─────────────────────────────────────────────────────────────

const ROLES = ["super_admin", "admin", "moderator", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_META: Record<
  Role,
  { label: string; bg: string; text: string; dot: string }
> = {
  super_admin: {
    label: "Super Admin",
    bg: "#F5F3FF",
    text: "#6D28D9",
    dot: "#8B5CF6",
  },
  admin: { label: "Admin", bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
  moderator: {
    label: "Moderator",
    bg: "#FFFBEB",
    text: "#92400E",
    dot: "#F59E0B",
  },
  viewer: { label: "Viewer", bg: "#F8FAFC", text: "#475569", dot: "#94A3B8" },
};

function roleMeta(role: string) {
  return ROLE_META[role as Role] ?? ROLE_META.viewer;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function initials(user: AdminUser) {
  if (user.name) {
    const parts = user.name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

// ─── Role Badge ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const m = roleMeta(role);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: m.bg, color: m.text }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: m.dot }}
      />
      {m.label}
    </span>
  );
}

// ─── Add Member Modal ───────────────────────────────────────────────────────

type AddModalProps = {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
};

function AddMemberModal({ onClose, onCreated }: AddModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<Role>("moderator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role, name: name || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to create member");
        return;
      }
      onCreated(body.admin);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/6 px-6 py-4">
          <h2 className="text-sm font-semibold text-[#111]">Add team member</h2>
          <button
            aria-label="Close"
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f3f4f6] hover:text-[#555] active:bg-[#e9eaec]"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
              <HiExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#555]">
              Name <span className="text-[#aaa]">(optional)</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Kim"
              className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 text-sm transition-colors focus:border-[#E1761F] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#555]">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="alex@example.com"
              className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 text-sm transition-colors focus:border-[#E1761F] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#555]">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 pr-10 text-sm transition-colors focus:border-[#E1761F] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#888]"
              >
                {showPw ? (
                  <HiEyeSlash className="h-4 w-4" />
                ) : (
                  <HiEye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#555]">
              Role <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const m = roleMeta(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all ${
                      role === r
                        ? "border-transparent shadow-sm"
                        : "border-black/8 text-[#555] hover:border-black/15"
                    }`}
                    style={
                      role === r
                        ? {
                            backgroundColor: m.bg,
                            color: m.text,
                            borderColor: m.dot + "40",
                          }
                        : {}
                    }
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: role === r ? m.dot : "#d1d5db",
                      }}
                    />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-medium text-[#555] transition-colors hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex-1 rounded-xl bg-[#E1761F] py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#cf6919] active:scale-[0.98] disabled:bg-[#f0f0f0] disabled:text-[#aaa]"
            >
              {loading ? "Creating…" : "Create member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Member Row ─────────────────────────────────────────────────────────────

type MemberRowProps = {
  user: AdminUser;
  isMe: boolean;
  onRoleChange: (id: string, role: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

function MemberRow({ user, isMe, onRoleChange, onRemove }: MemberRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function armDelete() {
    setConfirmDelete(true);
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
  }

  async function handleDelete() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setRemoveLoading(true);
    await onRemove(user.id);
    setRemoveLoading(false);
    setConfirmDelete(false);
  }

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setRoleLoading(true);
    await onRoleChange(user.id, e.target.value);
    setRoleLoading(false);
  }

  const m = roleMeta(user.role);

  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 transition-shadow hover:shadow-sm">
      {/* Avatar */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: m.dot }}
      >
        {initials(user)}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-[#111]">
            {user.name ?? user.email}
          </p>
          {isMe && (
            <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold text-[#888]">
              You
            </span>
          )}
        </div>
        {user.name && (
          <p className="truncate text-xs text-[#aaa]">{user.email}</p>
        )}
      </div>

      {/* Role */}
      <RoleBadge role={user.role} />

      {/* Joined */}
      <p className="w-20 shrink-0 text-right text-xs text-[#bbb]">
        {timeAgo(user.createdAt)}
      </p>

      {/* Change role */}
      <div className="relative shrink-0">
        <select
          title="Change role"
          value={user.role}
          onChange={handleRoleChange}
          disabled={isMe || roleLoading}
          className="appearance-none rounded-xl border border-black/8 bg-[#f9fafb] px-3 py-1.5 pr-7 text-xs font-medium text-[#555] transition-colors hover:border-black/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleMeta(r).label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#bbb]">
          ▾
        </span>
      </div>

      {/* Remove */}
      {!isMe &&
        (confirmDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={removeLoading}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-red-600 active:scale-95 disabled:opacity-60"
          >
            <HiCheckCircle className="h-3.5 w-3.5" />
            {removeLoading ? "Removing…" : "Confirm"}
          </button>
        ) : (
          <button
            aria-label={`Remove ${user.name ?? user.email}`}
            type="button"
            onClick={armDelete}
            className="shrink-0 rounded-xl p-2 text-[#ccc] opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-400 active:scale-95"
          >
            <HiTrash className="h-4 w-4" />
          </button>
        ))}

      {isMe && <div className="w-8 shrink-0" />}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminTeamPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamRes, meRes] = await Promise.all([
        fetch("/api/admin/team"),
        fetch("/api/admin/me"),
      ]);
      if (teamRes.status === 401 || meRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      const [teamBody, meBody] = await Promise.all([
        teamRes.json(),
        meRes.json(),
      ]);
      setAdmins(teamBody.admins ?? []);
      setMe(meBody);
    } catch {
      setError("Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRoleChange(id: string, role: string) {
    const res = await fetch("/api/admin/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to update role");
      return;
    }
    setAdmins((prev) => prev.map((a) => (a.id === id ? body.admin : a)));
  }

  async function handleRemove(id: string) {
    const res = await fetch("/api/admin/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to remove member");
      return;
    }
    setAdmins((prev) => prev.filter((a) => a.id !== id));
  }

  function handleCreated(user: AdminUser) {
    setAdmins((prev) => [...prev, user]);
    setShowAdd(false);
  }

  const filtered =
    roleFilter === "all" ? admins : admins.filter((a) => a.role === roleFilter);

  const roleCounts = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = admins.filter((a) => a.role === r).length;
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-[#f3f4f6]">
      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-black/[0.07] bg-white px-8 py-4">
          <div>
            <h1 className="text-lg font-bold text-[#111]">Team</h1>
            <p className="text-xs text-[#888]">
              {loading
                ? "Loading…"
                : `${admins.length} member${admins.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-500">{error}</span>}
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-xl bg-[#E1761F] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#cf6919] active:scale-95"
            >
              <HiUserPlus className="h-4 w-4" />
              Add member
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          {/* Role stats */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRoleFilter("all")}
              className={`rounded-xl px-4 py-2 text-xs font-medium transition-colors ${
                roleFilter === "all"
                  ? "bg-[#111] text-white"
                  : "border border-black/8 bg-white text-[#555] hover:border-black/15"
              }`}
            >
              All ({admins.length})
            </button>
            {ROLES.map((r) => {
              const m = roleMeta(r);
              const count = roleCounts[r] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                    roleFilter === r
                      ? "shadow-sm"
                      : "border border-black/8 bg-white hover:border-black/15"
                  }`}
                  style={
                    roleFilter === r
                      ? { backgroundColor: m.bg, color: m.text }
                      : { color: "#555" }
                  }
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: roleFilter === r ? m.dot : "#d1d5db",
                    }}
                  />
                  {m.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Member list */}
          <div className="space-y-2">
            {loading ? (
              Array(3)
                .fill(null)
                .map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4"
                  >
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#f0f0f0]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-[#f0f0f0]" />
                      <div className="h-3 w-48 animate-pulse rounded bg-[#f0f0f0]" />
                    </div>
                    <div className="h-6 w-20 animate-pulse rounded-full bg-[#f0f0f0]" />
                  </div>
                ))
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-black/6 bg-white px-6 py-12 text-center">
                <p className="text-sm text-[#aaa]">
                  No members with this role yet.
                </p>
              </div>
            ) : (
              filtered.map((user) => (
                <MemberRow
                  key={user.id}
                  user={user}
                  isMe={me?.email === user.email}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                />
              ))
            )}
          </div>
        </main>
      </div>

      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
