// ─── Chunk types ──────────────────────────────────────────────────────────────

export type ChunkType = "paragraph" | "sliding_window";

export interface TextChunk {
  index: number;
  text: string;
  normalizedText: string;
  wordCount: number;
  charCount: number;
  type: ChunkType;
}

// ─── Fingerprint types ────────────────────────────────────────────────────────

export interface LshBand {
  bandIndex: number;
  bandHash: string; // decimal string representation of the 64-bit FNV hash
}

export interface ChunkFingerprint {
  chunk: TextChunk;
  sha256Hash: string;
  minHashSignature: number[];
  lshBands: LshBand[];
}

// ─── Storage types ────────────────────────────────────────────────────────────

export interface StoredChunk {
  id: string;
  postId: string;
  chunkIndex: number;
  chunkType: ChunkType;
  sha256Hash: string;
  minHashSignature: number[];
  wordCount: number;
  charCount: number;
}

// ─── Match types ──────────────────────────────────────────────────────────────

export type MatchType = "exact" | "fuzzy";

export interface ChunkMatch {
  newChunkIndex: number;
  matchedChunkId: string;
  matchedPostId: string;
  matchType: MatchType;
  similarity: number; // 0–1
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type PlagiarismVerdict = "DUPLICATE" | "SUSPICIOUS" | "POSSIBLE" | "CLEAN";

export interface PostMatchSummary {
  postId: string;
  matchedChunks: ChunkMatch[];
  consecutiveRuns: number[][];
  rawMatchRatio: number;
  weightedScore: number;
  plagiarismPercentage: number;
  verdict: PlagiarismVerdict;
  confidence: number;
  explanation: string;
}

export interface PlagiarismDetectionResult {
  newPostId: string | null;
  totalChunks: number;
  processingTimeMs: number;
  // Pass 1: full-document hash
  firstPassHit: boolean;
  firstPassMatchedPostId?: string;
  // Pass 2: chunk-level
  chunkMatches: ChunkMatch[];
  matchesByPost: PostMatchSummary[];
  overallVerdict: PlagiarismVerdict;
  overallScore: number;
}
