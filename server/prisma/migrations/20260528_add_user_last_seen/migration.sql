-- Add lastSeen to User for presence tracking
ALTER TABLE "User" ADD COLUMN "lastSeen" TIMESTAMP(3);
CREATE INDEX "User_lastSeen_idx" ON "User"("lastSeen");
