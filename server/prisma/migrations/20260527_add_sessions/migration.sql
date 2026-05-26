-- Session table for per-device session tracking with JWT jti
CREATE TABLE IF NOT EXISTS "Session" (
  "id"         TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "jti"        TEXT         NOT NULL,
  "deviceName" TEXT         NOT NULL DEFAULT 'Unknown device',
  "ipAddress"  TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "Session_jti_key" UNIQUE ("jti"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "Session_jti_idx"              ON "Session"("jti");
