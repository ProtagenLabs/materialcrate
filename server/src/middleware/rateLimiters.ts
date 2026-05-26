import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const IS_DEV = process.env.NODE_ENV !== "production";
const skipInDev = () => IS_DEV;

// Lowercase operation names — covers both explicit operationName and names parsed from query string
const AUTH_OPERATIONS = new Set(["login", "signup", "socialauth"]);
const EMAIL_OPERATIONS = new Set([
  "resendverificationemail",
  "requestemailchange",
  "resendpendingemailchange",
  "verifyemailcode",
]);

// Baseline protection for all routes (health checks bypass this by responding before it runs).
// Limit is per-IP; Next.js API routes forward the real client IP so this is per-user in practice.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Prevents hammering the GraphQL endpoint regardless of operation.
// Limit is per-IP. In production the Next.js API routes forward the real
// client IP via X-Forwarded-For (trust proxy: 1), so each user gets their
// own counter. Keep this high enough to not catch server-side proxy calls.
export const graphqlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: [{ message: "Too many requests, please slow down." }] },
});

// Tight limit for login / signup / socialAuth — prevents credential brute force
const authOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: [{ message: "Too many authentication attempts, please try again later." }] },
});

// Per-hour limit for operations that trigger outbound emails
const emailOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: [{ message: "Too many email requests, please try again later." }] },
});

// Extracts the GraphQL operation name, falling back to parsing the query string
// when the client doesn't explicitly send operationName (e.g. raw fetch calls).
function extractOpName(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b) return null;

  if (typeof b.operationName === "string" && b.operationName) {
    return b.operationName.toLowerCase();
  }

  if (typeof b.query === "string") {
    const match = b.query.match(/(?:mutation|query)\s+(\w+)/);
    if (match?.[1]) return match[1].toLowerCase();
  }

  return null;
}

// Inspects the parsed GraphQL body and routes to the appropriate limiter.
// Must run after express.json() has populated req.body.
export const operationLimiter = (req: Request, res: Response, next: NextFunction) => {
  const opName = extractOpName(req.body);
  if (opName) {
    if (AUTH_OPERATIONS.has(opName)) return authOperationLimiter(req, res, next);
    if (EMAIL_OPERATIONS.has(opName)) return emailOperationLimiter(req, res, next);
  }
  next();
};

// REST: Google mobile OAuth code exchange
export const googleMobileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many authentication attempts, please try again later." },
});

// REST: Gumroad webhook — external, but still bounded
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests." },
});
