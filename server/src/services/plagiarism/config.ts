export const PLAGIARISM_CONFIG = {
  chunking: {
    paragraph: {
      // Chunks below this word count are skipped — too short to be meaningful,
      // and cause false positives on common phrases like "Introduction" or "Chapter 1".
      minWordCount: 30,
      // Chunks above this are split further via sliding window. A 500-word
      // paragraph is unusual and likely indicates missing paragraph breaks.
      maxWordCount: 500,
    },
    slidingWindow: {
      // ~150 words ≈ one dense paragraph. Wide enough to catch paraphrased
      // content, narrow enough to localise where plagiarism occurs.
      windowSizeWords: 150,
      // 50% overlap so a copied phrase can't "fall between" two windows.
      overlapWords: 75,
    },
  },

  minhash: {
    // 128 hash functions → signatures accurate to ±8% Jaccard at 95% CI.
    // Halving to 64 cuts memory in half but doubles estimation error.
    signatureLength: 128,
    // Word 3-grams preserve phrase-level meaning. 2-grams are too common,
    // 4-grams are too rare and miss minor paraphrasing.
    shingleSize: 3,
    // bands * rowsPerBand must equal signatureLength.
    // With b=16 r=8: P(candidate | J=0.8) ≈ 94.5% — good recall.
    // With b=16 r=8: P(candidate | J=0.4) ≈ 10% — reasonable precision.
    bands: 16,
    rowsPerBand: 8,
  },

  scoring: {
    exactMatchWeight: 1.0,
    // Fuzzy match base weight, further scaled by actual similarity score.
    fuzzyMatchWeight: 0.75,
    // Each extra chunk in a consecutive run of 3+ adds this bonus.
    // Rationale: 5 consecutive matched chunks is much stronger than 5 scattered ones.
    consecutiveRunBonus: 0.12,
    // Below this Jaccard similarity, fuzzy candidates are discarded.
    fuzzyMinSimilarity: 0.72,
    thresholds: {
      duplicate: 0.5,   // ≥50% weighted coverage → flag as DUPLICATE
      suspicious: 0.25, // ≥25% → SUSPICIOUS
      possible: 0.10,   // ≥10% → POSSIBLE (log only)
    },
  },
} as const;
