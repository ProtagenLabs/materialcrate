import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runGql } from "@/app/lib/gql";

const PING_MUTATION = `mutation PingPresence { pingPresence }`;

// Server-side per-user rate limit: track last ping time in memory.
// This is best-effort (resets on cold start) — the real guard is the
// 30-second heartbeat interval on the client.
const lastPingByToken = new Map<string, number>();
const RATE_LIMIT_MS = 20_000; // allow at most 1 ping per 20 s per token

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = Date.now();
  const lastPing = lastPingByToken.get(token) ?? 0;
  if (now - lastPing < RATE_LIMIT_MS) {
    return NextResponse.json({ ok: true }); // silently accept, already fresh
  }
  lastPingByToken.set(token, now);

  // Clean up stale entries periodically to avoid unbounded growth
  if (lastPingByToken.size > 10_000) {
    const cutoff = now - 5 * 60 * 1000;
    for (const [t, ts] of lastPingByToken) {
      if (ts < cutoff) lastPingByToken.delete(t);
    }
  }

  const result = await runGql({ query: PING_MUTATION, token });

  if (!result.ok) {
    return NextResponse.json({ error: "Failed to update presence" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
