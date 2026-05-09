-- Add isFree and price to Post
ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "price"  DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create Purchase table
CREATE TABLE IF NOT EXISTS "Purchase" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "Purchase_userId_postId_key" UNIQUE ("userId", "postId"),
  CONSTRAINT "Purchase_userId_fkey"       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Purchase_postId_fkey"       FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Purchase_postId_idx"           ON "Purchase"("postId");
CREATE INDEX IF NOT EXISTS "Post_isFree_idx"               ON "Post"("isFree");
