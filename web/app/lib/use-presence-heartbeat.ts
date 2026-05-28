"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL_MS = 30_000;
// Minimum gap between pings from any tab on this device
const CROSS_TAB_DEBOUNCE_MS = 20_000;
const STORAGE_KEY = "mc.presence.last_ping";

// Module-level singleton so multiple React renders share one interval
let intervalId: ReturnType<typeof setInterval> | null = null;
let refCount = 0;
let moduleLastPing = 0;

async function sendPing(): Promise<void> {
  const now = Date.now();

  // In-process guard (same tab, multiple hook instances)
  if (now - moduleLastPing < CROSS_TAB_DEBOUNCE_MS) return;

  // Cross-tab guard via localStorage
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
    if (now - stored < CROSS_TAB_DEBOUNCE_MS) return;
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Private browsing or storage quota — proceed anyway
  }

  moduleLastPing = now;

  try {
    await fetch("/api/presence/ping", { method: "POST", cache: "no-store" });
  } catch {
    // Network failures are silent — next heartbeat will retry
  }
}

export function usePresenceHeartbeat(userId: string | undefined) {
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Immediate ping on mount / user becoming known
    void sendPing();

    // Shared interval — only the first consumer creates it
    refCount++;
    if (refCount === 1) {
      intervalId = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
          void sendPing();
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    // Re-ping when the tab regains focus
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sendPing();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      refCount--;
      if (refCount === 0 && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [userId]);

  // Ping on route change
  useEffect(() => {
    if (!userId) return;
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return; // skip the very first render — mount already sent a ping
    }
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      void sendPing();
    }
  }, [userId, pathname]);
}
