import { ChunkMatch, PostMatchSummary, PlagiarismVerdict } from "../types.js";
import { PLAGIARISM_CONFIG } from "../config.js";

const {
  exactMatchWeight,
  fuzzyMatchWeight,
  consecutiveRunBonus,
  thresholds,
} = PLAGIARISM_CONFIG.scoring;

// ─── Consecutive run detection ────────────────────────────────────────────────
//
// Five scattered matched chunks is suspicious. Five consecutive ones means an
// entire section was copied verbatim — a much stronger signal. We detect runs
// and add a bonus to the weighted score so the verdict reflects this.

function findConsecutiveRuns(indices: number[]): number[][] {
  if (indices.length === 0) return [];
  const sorted = [...indices].sort((a, b) => a - b);
  const runs: number[][] = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      current.push(sorted[i]);
    } else {
      runs.push(current);
      current = [sorted[i]];
    }
  }
  runs.push(current);
  return runs;
}

// ─── Weighted score ───────────────────────────────────────────────────────────
//
// Raw ratio = matched / total. This ignores that:
//   - exact matches are more reliable than fuzzy
//   - fuzzy matches at 0.95 similarity are stronger than at 0.73
//   - consecutive clusters of matched chunks are structurally damning
//
// Weighted score accounts for all three.

function computeWeightedScore(
  matches: ChunkMatch[],
  totalChunks: number,
  consecutiveRuns: number[][],
): number {
  if (totalChunks === 0) return 0;

  let base = 0;
  for (const m of matches) {
    const weight =
      m.matchType === "exact"
        ? exactMatchWeight
        : fuzzyMatchWeight * m.similarity;
    base += weight;
  }
  base /= totalChunks;

  // Bonus: for each chunk beyond the second in a run, add consecutiveRunBonus.
  let runBonus = 0;
  for (const run of consecutiveRuns) {
    if (run.length > 2) runBonus += (run.length - 2) * consecutiveRunBonus;
  }
  runBonus /= totalChunks;

  return Math.min(1, base + runBonus);
}

// ─── Confidence ───────────────────────────────────────────────────────────────
//
// Confidence answers "how sure are we of this verdict?", separate from score.
// A document with 30 exact matches is more certain than one with 30 fuzzy 0.73s.

function computeConfidence(matches: ChunkMatch[], totalChunks: number): number {
  if (totalChunks === 0 || matches.length === 0) return 0;
  const exactCount = matches.filter((m) => m.matchType === "exact").length;
  const avgSimilarity = matches.reduce((s, m) => s + m.similarity, 0) / matches.length;
  const exactRatio = exactCount / totalChunks;
  const fuzzyContrib = ((matches.length - exactCount) / totalChunks) * avgSimilarity * 0.8;
  return Math.min(1, exactRatio + fuzzyContrib);
}

function verdictFromScore(score: number): PlagiarismVerdict {
  if (score >= thresholds.duplicate) return "DUPLICATE";
  if (score >= thresholds.suspicious) return "SUSPICIOUS";
  if (score >= thresholds.possible) return "POSSIBLE";
  return "CLEAN";
}

function buildExplanation(
  postId: string,
  matches: ChunkMatch[],
  totalChunks: number,
  score: number,
  verdict: PlagiarismVerdict,
  runs: number[][],
): string {
  const pct = Math.round(score * 100);
  const exactCount = matches.filter((m) => m.matchType === "exact").length;
  const fuzzyCount = matches.length - exactCount;
  const maxRun = runs.reduce((mx, r) => Math.max(mx, r.length), 0);

  const parts: string[] = [
    `${pct}% weighted plagiarism score against post ${postId}.`,
  ];
  if (exactCount > 0) parts.push(`${exactCount} chunk(s) matched exactly (SHA-256).`);
  if (fuzzyCount > 0) parts.push(`${fuzzyCount} chunk(s) matched approximately (MinHash).`);
  if (maxRun > 2) parts.push(`Largest consecutive matching section: ${maxRun} chunks.`);
  parts.push(`Verdict: ${verdict}.`);

  return parts.join(" ");
}

// ─── Public function ──────────────────────────────────────────────────────────

export function scoreMatches(
  allMatches: ChunkMatch[],
  totalChunks: number,
): PostMatchSummary[] {
  // Group by source post.
  const byPost = new Map<string, ChunkMatch[]>();
  for (const m of allMatches) {
    const group = byPost.get(m.matchedPostId) ?? [];
    group.push(m);
    byPost.set(m.matchedPostId, group);
  }

  const summaries: PostMatchSummary[] = [];

  for (const [postId, matches] of byPost) {
    // Deduplicate: if a new chunk matched multiple stored chunks, keep the best.
    const bestByIndex = new Map<number, ChunkMatch>();
    for (const m of matches) {
      const existing = bestByIndex.get(m.newChunkIndex);
      if (!existing || m.similarity > existing.similarity) {
        bestByIndex.set(m.newChunkIndex, m);
      }
    }
    const dedupedMatches = Array.from(bestByIndex.values());

    const matchedIndices = dedupedMatches.map((m) => m.newChunkIndex);
    const consecutiveRuns = findConsecutiveRuns(matchedIndices);
    const weightedScore = computeWeightedScore(dedupedMatches, totalChunks, consecutiveRuns);
    const verdict = verdictFromScore(weightedScore);
    const confidence = computeConfidence(dedupedMatches, totalChunks);

    summaries.push({
      postId,
      matchedChunks: dedupedMatches,
      consecutiveRuns,
      rawMatchRatio: dedupedMatches.length / Math.max(1, totalChunks),
      weightedScore,
      plagiarismPercentage: Math.round(weightedScore * 100),
      verdict,
      confidence,
      explanation: buildExplanation(postId, dedupedMatches, totalChunks, weightedScore, verdict, consecutiveRuns),
    });
  }

  // Return highest-scoring sources first.
  return summaries.sort((a, b) => b.weightedScore - a.weightedScore);
}
