"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresenceInfo = {
  online: boolean;
  lastSeen: string | null;
};

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatPresence(info: PresenceInfo | null): string {
  if (!info) return "";
  if (info.online) return "Online";
  if (!info.lastSeen) return "";
  const diff = Date.now() - new Date(info.lastSeen).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "Online";
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Active yesterday";
  if (days < 30) return `Active ${days}d ago`;
  return "Inactive";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUserPresence(userId: string | null | undefined): PresenceInfo | null {
  const [presence, setPresence] = useState<PresenceInfo | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetch(`/api/presence/user/${userId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PresenceInfo | null) => {
        if (!cancelled && data) setPresence(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  return presence;
}

// ─── Dot ──────────────────────────────────────────────────────────────────────

type DotProps = {
  online: boolean;
  /** "sm" = 8 px, "md" = 10 px, "lg" = 12 px */
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function PresenceDot({ online, size = "sm", className = "" }: DotProps) {
  const dim = size === "sm" ? "h-2 w-2" : size === "md" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 border-surface ${dim} ${
        online ? "bg-green-500" : "bg-gray-300"
      } ${className}`}
    />
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────

type LabelProps = {
  info: PresenceInfo | null;
  className?: string;
};

export function PresenceLabel({ info, className = "" }: LabelProps) {
  const text = formatPresence(info);
  if (!text) return null;

  if (info?.online) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium text-green-600 ${className}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Online
      </span>
    );
  }

  return <span className={`text-xs text-ink-3 ${className}`}>{text}</span>;
}

// ─── Avatar overlay ───────────────────────────────────────────────────────────

/**
 * Wraps any avatar JSX and overlays a presence dot in the bottom-right corner.
 * Usage: <PresenceAvatar online={info?.online ?? false}><img …/></PresenceAvatar>
 */
type AvatarProps = {
  online: boolean;
  dotSize?: DotProps["size"];
  children: React.ReactNode;
};

export function PresenceAvatar({ online, dotSize = "sm", children }: AvatarProps) {
  return (
    <div className="relative inline-block">
      {children}
      <PresenceDot
        online={online}
        size={dotSize}
        className="absolute bottom-0 right-0"
      />
    </div>
  );
}
