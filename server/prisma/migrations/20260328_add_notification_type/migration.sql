ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "type" TEXT;

UPDATE "Notification"
SET "type" = CASE
  WHEN "icon" = 'Profile2User' THEN 'FOLLOW'
  WHEN "icon" = 'Heart' THEN 'POST_LIKE'
  WHEN "icon" = 'Like1' THEN 'COMMENT_LIKE'
  WHEN "icon" = 'MessageText1' THEN 'COMMENT'
  ELSE 'SYSTEM'
END
WHERE "type" IS NULL OR TRIM("type") = '';

ALTER TABLE "Notification"
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'SYSTEM';

CREATE INDEX IF NOT EXISTS "Notification_userId_type_idx" ON "Notification"("userId", "type");
CREATE INDEX IF NOT EXISTS "Notification_userId_type_actorId_idx" ON "Notification"("userId", "type", "actorId");
