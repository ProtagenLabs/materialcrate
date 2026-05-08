import { PLAGIARISM_CONFIG } from "../config.js";

// ─── How MinHash works ────────────────────────────────────────────────────────
//
// 1. Shingle the text: extract overlapping word n-grams ("the cat sat",
//    "cat sat on", ...). These form the "set" representation of the document.
//
// 2. Apply k independent hash functions h_0..h_{k-1} to every shingle value.
//    For each h_i, keep only the MINIMUM hash seen across all shingles.
//    This gives a signature of k integers.
//
// 3. The probability that signature_A[i] == signature_B[i] equals the Jaccard
//    similarity of the underlying shingle sets. So comparing two signatures
//    gives an unbiased estimate of similarity without comparing all shingles.
//
// Why it detects paraphrasing:
//   Paraphrased text reorders words and replaces synonyms but keeps many of the
//   same n-gram patterns. Jaccard similarity above ~0.5 still implies substantial
//   overlap even after light editing.
//
// Shingle size = 3 words:
//   - 2-grams are too common ("of the", "in a") → false positives
//   - 4-grams miss minor edits → false negatives
//   - 3-grams strike the right balance for academic/professional documents

const { signatureLength, shingleSize } = PLAGIARISM_CONFIG.minhash;

// Largest 32-bit prime. All hash arithmetic is mod this value.
const P = 4_294_967_311n;

// Generate k pairs (a, b) for universal hashing h_i(x) = (a*x + b) mod P.
// Uses a deterministic LCG so signatures are reproducible across restarts.
function buildHashParams(count: number): Array<[bigint, bigint]> {
  const params: Array<[bigint, bigint]> = [];
  let seed = 0xdeadbeef;
  for (let i = 0; i < count; i++) {
    seed = Math.imul(seed, 1_664_525) + 1_013_904_223;
    const a = (BigInt(seed >>> 0) % (P - 1n)) + 1n;
    seed = Math.imul(seed, 1_664_525) + 1_013_904_223;
    const b = BigInt(seed >>> 0) % P;
    params.push([a, b]);
  }
  return params;
}

const HASH_PARAMS = buildHashParams(signatureLength);

// FNV-1a 32-bit hash for a shingle string → deterministic 32-bit integer.
function fnv1a32(s: string): bigint {
  let h = 2_166_136_261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16_777_619) >>> 0;
  }
  return BigInt(h);
}

export function generateShingles(normalizedText: string): bigint[] {
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const shingles: bigint[] = [];
  for (let i = 0; i <= words.length - shingleSize; i++) {
    shingles.push(fnv1a32(words.slice(i, i + shingleSize).join(" ")));
  }
  return shingles;
}

export function computeMinHashSignature(normalizedText: string): number[] {
  const shingles = generateShingles(normalizedText);
  if (shingles.length === 0) return new Array<number>(signatureLength).fill(0);

  const sig = new Array<bigint>(signatureLength).fill(P);

  for (const s of shingles) {
    for (let i = 0; i < signatureLength; i++) {
      const [a, b] = HASH_PARAMS[i];
      const h = (a * s + b) % P;
      if (h < sig[i]) sig[i] = h;
    }
  }

  // Safe to downcast to Number — values fit in 53-bit JS float.
  return sig.map((v) => Number(v === P ? 0n : v));
}

// Estimated Jaccard similarity between two minhash signatures.
// Accuracy: ±1/sqrt(k) → ±~8.8% at k=128.
export function estimateJaccard(sigA: number[], sigB: number[]): number {
  if (sigA.length !== sigB.length || sigA.length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) matches++;
  }
  return matches / sigA.length;
}
