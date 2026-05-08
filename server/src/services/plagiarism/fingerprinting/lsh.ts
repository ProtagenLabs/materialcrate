import { LshBand } from "../types.js";
import { PLAGIARISM_CONFIG } from "../config.js";

// ─── LSH (Locality Sensitive Hashing) ────────────────────────────────────────
//
// Problem: comparing every new chunk against every stored chunk is O(n·m).
// At 10k stored chunks with 20 new chunks that's 200k Jaccard comparisons.
//
// LSH solution:
//   Divide the k-element signature into b bands of r rows each.
//   Hash each band's r values into a bucket. Two chunks that land in the
//   SAME bucket for ANY band become candidates for full comparison.
//
//   P(candidate | Jaccard = J) = 1 − (1 − J^r)^b
//
//   With b=16, r=8:
//     J=0.8 → 94.5% recall  (almost all real matches surface as candidates)
//     J=0.5 → 33%   recall  (intentional — below our threshold)
//     J=0.4 → 10%   recall  (very few false candidates pass through)
//
// Database strategy:
//   Store one row per (chunk_id, band_index) in chunk_lsh_bands.
//   To find candidates for a new chunk, OR-query across all its bands.
//   The index on (band_index, band_hash) makes each band lookup O(log n).
//   Total candidates retrieved: typically <<500 even at millions of chunks.

const { bands, rowsPerBand } = PLAGIARISM_CONFIG.minhash;

// FNV-1a 64-bit over the r integer rows in a band → single BigInt bucket key.
function hashBand(rows: number[]): bigint {
  let h = 14_695_981_039_346_656_037n;
  for (const row of rows) {
    // Feed each 4-byte row into the hash.
    for (let shift = 0; shift < 32; shift += 8) {
      h ^= BigInt((row >>> shift) & 0xff);
      h = BigInt.asUintN(64, h * 1_099_511_628_211n);
    }
  }
  return h;
}

export function computeLshBands(signature: number[]): LshBand[] {
  const result: LshBand[] = [];
  for (let b = 0; b < bands; b++) {
    const rows = signature.slice(b * rowsPerBand, (b + 1) * rowsPerBand);
    // BigInt.asIntN(64) reinterprets the unsigned FNV-64 output as a signed
    // int64, keeping all bits identical. PostgreSQL BIGINT is signed 64-bit,
    // so values above 2^63-1 overflow it — this cast avoids that.
    result.push({ bandIndex: b, bandHash: BigInt.asIntN(64, hashBand(rows)).toString() });
  }
  return result;
}
