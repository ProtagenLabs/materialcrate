import { ChunkFingerprint, ChunkMatch } from "../types.js";
import { ChunkRepository } from "../database/chunk-repository.js";
import { estimateJaccard } from "../fingerprinting/minhash.js";
import { PLAGIARISM_CONFIG } from "../config.js";

// How this works:
//   1. Collect LSH bands from all unmatched new chunks.
//   2. One DB query retrieves all candidate stored chunks that share any band.
//   3. For each candidate, compute Jaccard estimate against the new chunk
//      whose band triggered the match.
//   4. Accept candidates above the similarity threshold.
//
// This is intentionally done in a single batched DB round-trip per call.
// Sending one chunk at a time would be N times slower.

const BATCH_SIZE = 15; // chunks per DB round-trip
const { fuzzyMinSimilarity } = PLAGIARISM_CONFIG.scoring;

export class FuzzyMatcher {
  constructor(private readonly repo: ChunkRepository) {}

  async findMatches(
    fingerprints: ChunkFingerprint[],
    excludePostId: string,
    alreadyExactMatchedIndices: Set<number>,
  ): Promise<ChunkMatch[]> {
    const unmatched = fingerprints.filter(
      (fp) => !alreadyExactMatchedIndices.has(fp.chunk.index),
    );

    const allMatches: ChunkMatch[] = [];

    // Process in batches to keep the VALUES list in the SQL manageable.
    for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
      const batch = unmatched.slice(i, i + BATCH_SIZE);

      // Aggregate all LSH bands from the batch for a single DB query.
      const allBands = batch.flatMap((fp) => fp.lshBands);
      const candidates = await this.repo.findCandidatesByLsh(allBands, excludePostId);

      if (candidates.length === 0) continue;

      // Match each batch chunk against every candidate.
      for (const fp of batch) {
        let bestSimilarity = 0;
        let bestCandidate: (typeof candidates)[0] | null = null;

        for (const candidate of candidates) {
          const j = estimateJaccard(fp.minHashSignature, candidate.minhash_signature);
          if (j > bestSimilarity) {
            bestSimilarity = j;
            bestCandidate = candidate;
          }
        }

        if (bestSimilarity >= fuzzyMinSimilarity && bestCandidate) {
          allMatches.push({
            newChunkIndex: fp.chunk.index,
            matchedChunkId: bestCandidate.chunk_id,
            matchedPostId: bestCandidate.post_id,
            matchType: "fuzzy",
            similarity: bestSimilarity,
          });
        }
      }
    }

    return allMatches;
  }
}
