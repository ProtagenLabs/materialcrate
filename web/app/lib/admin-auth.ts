import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "mc_admin_session";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day

const TOKEN_SECRET = crypto
  .createHash("sha256")
  .update("mc-admin-token-secret-v2")
  .digest();

export function createAdminToken(role: string, email: string): string {
  const payload = {
    role: "admin",
    adminRole: role,
    email,
    iat: Date.now(),
    exp: Date.now() + ADMIN_COOKIE_MAX_AGE * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [data, signature] = parts;
    if (!data || !signature) return false;

    const expected = crypto
      .createHmac("sha256", TOKEN_SECRET)
      .update(data)
      .digest("base64url");

    if (
      expected.length !== signature.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return payload.role === "admin" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function decodeAdminToken(token: string): { adminRole: string; email: string } | null {
  try {
    if (!verifyAdminToken(token)) return null;
    const data = token.split(".")[0];
    if (!data) return null;
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as { adminRole?: string; email?: string };
    if (!payload.adminRole || !payload.email) return null;
    return { adminRole: payload.adminRole, email: payload.email };
  } catch {
    return null;
  }
}
