-- DocumentRequest table
CREATE TABLE IF NOT EXISTS "DocumentRequest" (
  "id"                    TEXT        NOT NULL,
  "authorId"              TEXT        NOT NULL,
  "title"                 TEXT        NOT NULL,
  "description"           TEXT        NOT NULL,
  "categories"            TEXT[]      NOT NULL DEFAULT '{}',
  "bounty"                INTEGER,
  "bountyEscrowedAt"      TIMESTAMP(3),
  "acceptedFulfillmentId" TEXT,
  "bountyReleasedAt"      TIMESTAMP(3),
  "solved"                BOOLEAN     NOT NULL DEFAULT FALSE,
  "closed"                BOOLEAN     NOT NULL DEFAULT FALSE,
  "deleted"               BOOLEAN     NOT NULL DEFAULT FALSE,
  "deletedAt"             TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentRequest_acceptedFulfillmentId_key" UNIQUE ("acceptedFulfillmentId"),
  CONSTRAINT "DocumentRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DocumentRequest_authorId_createdAt_idx"            ON "DocumentRequest"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "DocumentRequest_solved_closed_deleted_createdAt_idx" ON "DocumentRequest"("solved", "closed", "deleted", "createdAt");
CREATE INDEX IF NOT EXISTS "DocumentRequest_bountyEscrowedAt_idx"              ON "DocumentRequest"("bountyEscrowedAt");

-- DocumentRequestFulfillment table
CREATE TABLE IF NOT EXISTS "DocumentRequestFulfillment" (
  "id"        TEXT        NOT NULL,
  "requestId" TEXT        NOT NULL,
  "postId"    TEXT        NOT NULL,
  "authorId"  TEXT        NOT NULL,
  "likeCount" INTEGER     NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRequestFulfillment_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "DocumentRequestFulfillment_requestId_postId_key" UNIQUE ("requestId", "postId"),
  CONSTRAINT "DocumentRequestFulfillment_requestId_fkey"   FOREIGN KEY ("requestId") REFERENCES "DocumentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentRequestFulfillment_postId_fkey"      FOREIGN KEY ("postId")    REFERENCES "Post"("id")           ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentRequestFulfillment_authorId_fkey"    FOREIGN KEY ("authorId")  REFERENCES "User"("id")           ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DocumentRequestFulfillment_requestId_likeCount_idx" ON "DocumentRequestFulfillment"("requestId", "likeCount");
CREATE INDEX IF NOT EXISTS "DocumentRequestFulfillment_requestId_createdAt_idx" ON "DocumentRequestFulfillment"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "DocumentRequestFulfillment_authorId_idx"            ON "DocumentRequestFulfillment"("authorId");
CREATE INDEX IF NOT EXISTS "DocumentRequestFulfillment_postId_idx"              ON "DocumentRequestFulfillment"("postId");

-- Add FK from DocumentRequest.acceptedFulfillmentId → DocumentRequestFulfillment
ALTER TABLE "DocumentRequest"
  ADD CONSTRAINT "DocumentRequest_acceptedFulfillmentId_fkey"
  FOREIGN KEY ("acceptedFulfillmentId") REFERENCES "DocumentRequestFulfillment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- DocumentRequestFulfillmentLike table
CREATE TABLE IF NOT EXISTS "DocumentRequestFulfillmentLike" (
  "userId"        TEXT        NOT NULL,
  "fulfillmentId" TEXT        NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRequestFulfillmentLike_pkey" PRIMARY KEY ("userId", "fulfillmentId"),
  CONSTRAINT "DocumentRequestFulfillmentLike_userId_fkey"        FOREIGN KEY ("userId")        REFERENCES "User"("id")                       ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentRequestFulfillmentLike_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "DocumentRequestFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DocumentRequestFulfillmentLike_fulfillmentId_idx" ON "DocumentRequestFulfillmentLike"("fulfillmentId");

-- Add requestId to Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
