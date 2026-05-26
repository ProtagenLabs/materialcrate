import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";

type JwtPayload = {
  sub: string;
  email: string;
  jti?: string;
};

export const context = async ({ req }: any) => {
  const result: Record<string, unknown> = {};

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  result.ip = ip;

  const userAgent = (req.headers["user-agent"] as string) || undefined;
  result.userAgent = userAgent;

  const auth = req.headers.authorization;
  if (auth) {
    const token = auth.replace("Bearer ", "");
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const payload = jwt.verify(token, secret) as JwtPayload;

        if (payload.jti) {
          const session = await (prisma as any).session.findUnique({
            where: { jti: payload.jti },
            select: { id: true, revokedAt: true },
          });

          if (session && !session.revokedAt) {
            result.user = payload;
            result.sessionJti = payload.jti;

            // Fire-and-forget: update lastSeenAt and ip without blocking
            void (prisma as any).session
              .update({
                where: { jti: payload.jti },
                data: { lastSeenAt: new Date(), ipAddress: ip },
              })
              .catch(() => {});
          }
          // Session not found or revoked → user stays unset (unauthenticated)
        } else {
          // Legacy token without jti — allow during transition period
          result.user = payload;
        }
      }
    } catch {}
  }

  const adminSecret = req.headers["x-admin-secret"];
  if (
    adminSecret &&
    process.env.ADMIN_SECRET &&
    adminSecret === process.env.ADMIN_SECRET
  ) {
    result.isAdmin = true;
  }

  return result;
};
