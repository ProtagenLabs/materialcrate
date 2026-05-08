import { PrismaClient } from "@prisma/client";
import { ChunkRepository } from "../database/chunk-repository.js";
import { ExactMatcher } from "../matching/exact-matcher.js";
import { FuzzyMatcher } from "../matching/fuzzy-matcher.js";
import { scoreMatches } from "../matching/scoring-engine.js";
import { chunkDocument, normalizeText } from "../chunking/index.js";
import { fingerprintChunks } from "../fingerprinting/index.js";
import { sha256 } from "../fingerprinting/sha256.js";
import { PlagiarismDetectionResult, PlagiarismVerdict } from "../types.js";

// ─── Two-Pass Detection Pipeline ─────────────────────────────────────────────
//
// Pass 1 — Full-document SHA-256 hash
//   Cost:  one DB read, O(1)
//   Detects: exact copy-paste of entire document
//   When it fires: skip Pass 2 entirely and return immediately
//
// Pass 2 — Chunk-level fingerprinting
//   Cost: chunk extraction + DB reads for exact match + LSH candidate lookup
//   Detects: partial plagiarism, reordered sections, paraphrased passages
//
// The two-pass design keeps the common case (no plagiarism) cheap: Pass 1 is
// a single indexed lookup and Pass 2 only fires when Pass 1 misses.

export class DetectionPipeline {
  private readonly repo: ChunkRepository;
  private readonly exactMatcher: ExactMatcher;
  private readonly fuzzyMatcher: FuzzyMatcher;

  constructor(prisma: PrismaClient) {
    this.repo = new ChunkRepository(prisma);
    this.exactMatcher = new ExactMatcher(this.repo);
    this.fuzzyMatcher = new FuzzyMatcher(this.repo);
  }

  // Index a post so future uploads can be checked against it.
  // Call this AFTER the post has been saved to the database.
  async indexPost(postId: string, content: string): Promise<void> {
    const normalizedDoc = normalizeText(content);
    const docHash = sha256(normalizedDoc);

    const chunks = chunkDocument(content);
    const fingerprints = fingerprintChunks(chunks);

    await this.repo.upsertDocumentFingerprint(postId, docHash);
    await this.repo.storeChunks(postId, fingerprints);
  }

  // Run plagiarism detection on content BEFORE (or just after) saving.
  // `excludePostId` is the post being uploaded — exclude its own stored index
  // if re-checking an existing post.
  async detect(
    content: string,
    excludePostId = "",
  ): Promise<PlagiarismDetectionResult> {
    const t0 = Date.now();

    // ── Pass 1 ──────────────────────────────────────────────────────────────
    const normalizedDoc = normalizeText(content);
    const docHash = sha256(normalizedDoc);
    const docMatchId = await this.repo.findDocumentByHash(docHash, excludePostId);

    if (docMatchId) {
      return {
        newPostId: excludePostId || null,
        totalChunks: 0,
        processingTimeMs: Date.now() - t0,
        firstPassHit: true,
        firstPassMatchedPostId: docMatchId,
        chunkMatches: [],
        matchesByPost: [
          {
            postId: docMatchId,
            matchedChunks: [],
            consecutiveRuns: [],
            rawMatchRatio: 1,
            weightedScore: 1,
            plagiarismPercentage: 100,
            verdict: "DUPLICATE",
            confidence: 1,
            explanation: `Exact full-document duplicate of post ${docMatchId}.`,
          },
        ],
        overallVerdict: "DUPLICATE",
        overallScore: 1,
      };
    }

    // ── Pass 2 ──────────────────────────────────────────────────────────────
    const chunks = chunkDocument(content);
    const fingerprints = fingerprintChunks(chunks);

    // 2a. Exact chunk matches
    const exactMatches = await this.exactMatcher.findMatches(fingerprints, excludePostId);
    const exactMatchedIndices = new Set(exactMatches.map((m) => m.newChunkIndex));

    // 2b. Fuzzy matches for chunks not already caught by exact matching
    const fuzzyMatches = await this.fuzzyMatcher.findMatches(
      fingerprints,
      excludePostId,
      exactMatchedIndices,
    );

    const allMatches = [...exactMatches, ...fuzzyMatches];
    const matchesByPost = scoreMatches(allMatches, fingerprints.length);

    const overallVerdict: PlagiarismVerdict =
      matchesByPost.length > 0 ? matchesByPost[0].verdict : "CLEAN";
    const overallScore = matchesByPost.length > 0 ? matchesByPost[0].weightedScore : 0;

    return {
      newPostId: excludePostId || null,
      totalChunks: fingerprints.length,
      processingTimeMs: Date.now() - t0,
      firstPassHit: false,
      chunkMatches: allMatches,
      matchesByPost,
      overallVerdict,
      overallScore,
    };
  }

  async removePostIndex(postId: string): Promise<void> {
    await this.repo.deletePostFingerprints(postId);
  }
}
