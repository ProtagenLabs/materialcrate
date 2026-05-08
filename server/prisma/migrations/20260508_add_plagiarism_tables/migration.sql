-- ─────────────────────────────────────────────────────────────────────────────
-- Plagiarism detection tables
--
-- Three tables:
--   document_fingerprints  – full-document SHA-256 (pass 1, fast, exact)
--   content_chunks         – per-chunk fingerprints (pass 2, deeper)
--   chunk_lsh_bands        – LSH band index for approximate matching
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Pass 1: full-document fingerprints ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_fingerprints (
  id          TEXT        NOT NULL PRIMARY KEY,
  post_id     TEXT        NOT NULL UNIQUE,
  sha256_hash TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_doc_fp_post
    FOREIGN KEY (post_id) REFERENCES "Post"(id) ON DELETE CASCADE
);

-- Fast lookup when a new document arrives: "does this exact hash already exist?"
CREATE INDEX IF NOT EXISTS idx_doc_fp_sha256
  ON document_fingerprints(sha256_hash);

-- ─── Pass 2: chunk-level fingerprints ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_chunks (
  id                TEXT        NOT NULL PRIMARY KEY,
  post_id           TEXT        NOT NULL,
  chunk_index       SMALLINT    NOT NULL,
  -- 'paragraph' | 'sliding_window'
  chunk_type        TEXT        NOT NULL,
  -- SHA-256 of the normalised chunk text. Used for exact matching.
  sha256_hash       TEXT        NOT NULL,
  -- 128-element MinHash signature. Used for fuzzy matching.
  minhash_signature INTEGER[]   NOT NULL,
  word_count        SMALLINT    NOT NULL,
  char_count        INTEGER     NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_cc_post
    FOREIGN KEY (post_id) REFERENCES "Post"(id) ON DELETE CASCADE,
  CONSTRAINT cc_type_check
    CHECK (chunk_type IN ('paragraph', 'sliding_window')),
  CONSTRAINT cc_word_count_positive
    CHECK (word_count > 0),
  CONSTRAINT cc_unique_chunk
    UNIQUE (post_id, chunk_index, chunk_type)
);

-- Primary exact-match lookup path.
-- Partial index excludes stub chunks that are too short to be meaningful —
-- they would produce false positives on boilerplate phrases.
CREATE INDEX IF NOT EXISTS idx_cc_sha256_meaningful
  ON content_chunks(sha256_hash)
  WHERE word_count >= 30;

-- Post-level queries: fetch all chunks for a post, delete on post removal.
CREATE INDEX IF NOT EXISTS idx_cc_post_id
  ON content_chunks(post_id);

-- ─── LSH bands: candidate generation for fuzzy matching ──────────────────────
--
-- For each chunk we store b=16 band rows. To find fuzzy candidates for a new
-- chunk, we query: WHERE (band_index, band_hash) IN (<new chunk's bands>).
-- The composite index makes each band lookup O(log n).

CREATE TABLE IF NOT EXISTS chunk_lsh_bands (
  chunk_id    TEXT     NOT NULL,
  band_index  SMALLINT NOT NULL,
  -- FNV-64 hash of the band's r=8 signature rows.
  band_hash   BIGINT   NOT NULL,

  PRIMARY KEY (chunk_id, band_index),

  CONSTRAINT fk_lsh_chunk
    FOREIGN KEY (chunk_id) REFERENCES content_chunks(id) ON DELETE CASCADE
);

-- The hot path: given (band_index, band_hash) pairs, return matching chunk_ids.
-- INCLUDE (chunk_id) is redundant here since it's in the primary key,
-- but explicit for readability of the query plan.
CREATE INDEX IF NOT EXISTS idx_lsh_band_lookup
  ON chunk_lsh_bands(band_index, band_hash);
