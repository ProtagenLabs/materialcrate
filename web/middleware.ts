import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "mc_admin_session";

// Must match the secret string used in web/app/lib/admin-auth.ts
const TOKEN_SECRET_INPUT = "mc-admin-token-secret-v2";

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [data, signature] = parts;
    if (!data || !signature) return false;

    const keyBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(TOKEN_SECRET_INPUT),
    );

    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(signature),
      new TextEncoder().encode(data),
    );

    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(data)),
    ) as { role?: string; exp?: number };

    return (
      payload.role === "admin" &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now()
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;

  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
