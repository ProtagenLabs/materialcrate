import { ChunkFingerprint, ChunkMatch } from "../types.js";
import { ChunkRepository } from "../database/chunk-repository.js";

export class ExactMatcher {
  constructor(private readonly repo: ChunkRepository) {}

  async findMatches(
    fingerprints: ChunkFingerprint[],
    excludePostId: string,
  ): Promise<ChunkMatch[]> {
    // Build a map hash→fingerprint so we can look up the chunk index after the DB query.
    const hashToFp = new Map<string, ChunkFingerprint>();
    for (const fp of fingerprints) {
      hashToFp.set(fp.sha256Hash, fp);
    }

    const rows = await this.repo.findExactMatches(
      Array.from(hashToFp.keys()),
      excludePostId,
    );

    return rows.map((r) => ({
      newChunkIndex: hashToFp.get(r.sha256_hash)!.chunk.index,
      matchedChunkId: r.chunk_id,
      matchedPostId: r.post_id,
      matchType: "exact" as const,
      similarity: 1.0,
    }));
  }
}
