import { Prisma, PrismaClient } from "@prisma/client";
import { ChunkFingerprint, StoredChunk, ChunkType } from "../types.js";

// Raw row types returned from $queryRaw (snake_case from PostgreSQL)
interface RawChunk {
  id: string;
  post_id: string;
  chunk_index: number;
  chunk_type: string;
  sha256_hash: string;
  minhash_signature: number[];
  word_count: number;
  char_count: number;
}

interface ExactMatchRow {
  sha256_hash: string;
  chunk_id: string;
  post_id: string;
}

interface CandidateRow {
  chunk_id: string;
  post_id: string;
  minhash_signature: number[];
}

export class ChunkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Document-level fingerprints (pass 1) ──────────────────────────────────

  async upsertDocumentFingerprint(postId: string, sha256Hash: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO document_fingerprints (id, post_id, sha256_hash)
      VALUES (gen_random_uuid(), ${postId}, ${sha256Hash})
      ON CONFLICT (post_id)
      DO UPDATE SET sha256_hash = EXCLUDED.sha256_hash
    `;
  }

  async findDocumentByHash(
    sha256Hash: string,
    excludePostId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ post_id: string }>>`
      SELECT post_id
      FROM   document_fingerprints
      WHERE  sha256_hash = ${sha256Hash}
        AND  post_id     != ${excludePostId}
      LIMIT  1
    `;
    return rows[0]?.post_id ?? null;
  }

  // ── Chunk-level fingerprints (pass 2) ─────────────────────────────────────

  async storeChunks(
    postId: string,
    fingerprints: ChunkFingerprint[],
  ): Promise<StoredChunk[]> {
    if (fingerprints.length === 0) return [];

    const stored: StoredChunk[] = [];

    // Batch inserts in a single transaction for atomicity and speed.
    await this.prisma.$transaction(async (tx) => {
      for (const fp of fingerprints) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO content_chunks
            (id, post_id, chunk_index, chunk_type, sha256_hash, minhash_signature, word_count, char_count)
          VALUES (
            gen_random_uuid(),
            ${postId},
            ${fp.chunk.index},
            ${fp.chunk.type},
            ${fp.sha256Hash},
            ${fp.minHashSignature}::integer[],
            ${fp.chunk.wordCount},
            ${fp.chunk.charCount}
          )
          ON CONFLICT (post_id, chunk_index, chunk_type)
          DO UPDATE SET
            sha256_hash       = EXCLUDED.sha256_hash,
            minhash_signature = EXCLUDED.minhash_signature,
            word_count        = EXCLUDED.word_count,
            char_count        = EXCLUDED.char_count
          RETURNING id
        `;

        const chunkId = rows[0].id;

        // Upsert LSH bands for this chunk in a single statement.
        if (fp.lshBands.length > 0) {
          const bandValues = fp.lshBands
            .map((b) => Prisma.sql`(${chunkId}, ${b.bandIndex}, ${b.bandHash}::bigint)`)
            .reduce((acc, v, i) => (i === 0 ? v : Prisma.sql`${acc}, ${v}`));

          await tx.$executeRaw`
            INSERT INTO chunk_lsh_bands (chunk_id, band_index, band_hash)
            VALUES ${bandValues}
            ON CONFLICT (chunk_id, band_index)
            DO UPDATE SET band_hash = EXCLUDED.band_hash
          `;
        }

        stored.push({
          id: chunkId,
          postId,
          chunkIndex: fp.chunk.index,
          chunkType: fp.chunk.type as ChunkType,
          sha256Hash: fp.sha256Hash,
          minHashSignature: fp.minHashSignature,
          wordCount: fp.chunk.wordCount,
          charCount: fp.chunk.charCount,
        });
      }
    });

    return stored;
  }

  // ── Exact match lookup ────────────────────────────────────────────────────

  async findExactMatches(
    hashes: string[],
    excludePostId: string,
  ): Promise<ExactMatchRow[]> {
    if (hashes.length === 0) return [];

    return this.prisma.$queryRaw<ExactMatchRow[]>`
      SELECT sha256_hash, id AS chunk_id, post_id
      FROM   content_chunks
      WHERE  sha256_hash = ANY(${hashes}::text[])
        AND  post_id     != ${excludePostId}
        AND  word_count  >= 30
      LIMIT  2000
    `;
  }

  // ── LSH candidate lookup ──────────────────────────────────────────────────

  // For a set of LSH bands belonging to one or more new chunks, retrieve all
  // stored chunk candidates that share at least one band bucket.
  async findCandidatesByLsh(
    bands: Array<{ bandIndex: number; bandHash: string }>,
    excludePostId: string,
  ): Promise<CandidateRow[]> {
    if (bands.length === 0) return [];

    // bandHash is a decimal string (e.g. "16013852875127289599").
    // ::bigint casts it to match the BIGINT column type in PostgreSQL.
    const bandPairs = bands
      .map((b) => Prisma.sql`(${b.bandIndex}::smallint, ${b.bandHash}::bigint)`)
      .reduce((acc, v, i) => (i === 0 ? v : Prisma.sql`${acc}, ${v}`));

    return this.prisma.$queryRaw<CandidateRow[]>`
      SELECT DISTINCT cc.id AS chunk_id, cc.post_id, cc.minhash_signature
      FROM   chunk_lsh_bands lb
      JOIN   content_chunks cc ON cc.id = lb.chunk_id
      WHERE  (lb.band_index, lb.band_hash) IN (VALUES ${bandPairs})
        AND  cc.post_id   != ${excludePostId}
        AND  cc.word_count >= 30
      LIMIT  1000
    `;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async deletePostFingerprints(postId: string): Promise<void> {
    // Chunks and LSH bands cascade-delete via FK.
    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM document_fingerprints WHERE post_id = ${postId}`,
      this.prisma.$executeRaw`DELETE FROM content_chunks        WHERE post_id = ${postId}`,
    ]);
  }
}
