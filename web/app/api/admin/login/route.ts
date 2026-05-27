import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE,
  createAdminToken,
} from "@/app/lib/admin-auth";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

// ─── In-memory rate limiter ────────────────────────────────────────────────
// 5 failed attempts within a 15-minute window → 15-minute lockout.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type Entry = { count: number; windowStart: number; lockedUntil: number | null };
const store = new Map<string, Entry>();

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

function isLocked(ip: string): { locked: boolean; retryAfter: number } {
  const now = Date.now();
  const e = store.get(ip);
  if (!e) return { locked: false, retryAfter: 0 };
  if (e.lockedUntil && now < e.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((e.lockedUntil - now) / 1000) };
  }
  if (now - e.windowStart > WINDOW_MS) store.delete(ip);
  return { locked: false, retryAfter: 0 };
}

function recordFailure(ip: string): { attemptsRemaining: number; retryAfter: number } {
  const now = Date.now();
  let e = store.get(ip);
  if (!e || now - e.windowStart > WINDOW_MS) {
    e = { count: 0, windowStart: now, lockedUntil: null };
    store.set(ip, e);
  }
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) {
    e.lockedUntil = now + LOCKOUT_MS;
    return { attemptsRemaining: 0, retryAfter: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { attemptsRemaining: MAX_ATTEMPTS - e.count, retryAfter: 0 };
}

function reset(ip: string) {
  store.delete(ip);
}

// ─── GraphQL ────────────────────────────────────────────────────────────────

const VERIFY_MUTATION = `
  mutation AdminVerifyCredentials($email: String!, $password: String!) {
    adminVerifyCredentials(email: $email, password: $password) {
      valid
      role
      name
    }
  }
`;

// ─── Route ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getIp(req);

  const { locked, retryAfter } = isLocked(ip);
  if (locked) {
    const mins = Math.ceil(retryAfter / 60);
    return NextResponse.json(
      {
        error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
        retryAfter,
      },
      { status: 429 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  let result: { valid: boolean; role: string | null; name: string | null };
  try {
    const gqlRes = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: VERIFY_MUTATION,
        variables: { email, password },
      }),
    });
    const gqlBody = await gqlRes.json().catch(() => ({}));
    result = gqlBody?.data?.adminVerifyCredentials ?? { valid: false, role: null, name: null };
  } catch {
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }

  if (!result.valid) {
    const { attemptsRemaining, retryAfter: lockRetry } = recordFailure(ip);
    if (lockRetry > 0) {
      const mins = Math.ceil(lockRetry / 60);
      return NextResponse.json(
        {
          error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
          retryAfter: lockRetry,
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Invalid credentials", attemptsRemaining },
      { status: 401 },
    );
  }

  reset(ip);

  const token = createAdminToken(result.role ?? "moderator");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });

  return response;
}
