-- ─── Add text storage to content_chunks ──────────────────────────────────────
-- Required for the side-by-side comparison UI on the plagiarism case page.
ALTER TABLE "content_chunks"
  ADD COLUMN IF NOT EXISTS "text" TEXT NOT NULL DEFAULT '';

-- ─── Add caseId to Notification ───────────────────────────────────────────────
-- Plagiarism notifications link directly to the case page (/cases/:caseId).
ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "caseId" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_caseId_idx"
  ON "Notification"("caseId") WHERE "caseId" IS NOT NULL;

-- ─── Case event timeline ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CaseEvent" (
  "id"          TEXT        NOT NULL,
  "caseId"      TEXT        NOT NULL,
  "type"        TEXT        NOT NULL,
  "description" TEXT        NOT NULL,
  "actorId"     TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaseEvent_case_fkey" FOREIGN KEY ("caseId")
    REFERENCES "PlagiarismCase"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CaseEvent_caseId_createdAt_idx"
  ON "CaseEvent"("caseId", "createdAt");
