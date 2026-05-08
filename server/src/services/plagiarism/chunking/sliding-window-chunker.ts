import { TextChunk } from "../types.js";
import { normalizeText, splitWords } from "./normalizer.js";
import { PLAGIARISM_CONFIG } from "../config.js";

// Sliding window produces overlapping fixed-size chunks so that a copied phrase
// cannot escape detection by straddling two non-overlapping boundaries.
export function slidingWindowChunk(text: string, startIndex = 0): TextChunk[] {
  const { windowSizeWords, overlapWords } = PLAGIARISM_CONFIG.chunking.slidingWindow;
  const { minWordCount } = PLAGIARISM_CONFIG.chunking.paragraph;
  const stride = windowSizeWords - overlapWords;

  const words = splitWords(text);
  const chunks: TextChunk[] = [];
  let chunkIndex = startIndex;

  for (let i = 0; i < words.length; i += stride) {
    const windowWords = words.slice(i, i + windowSizeWords);
    if (windowWords.length < minWordCount) break;

    const chunkText = windowWords.join(" ");
    chunks.push({
      index: chunkIndex++,
      text: chunkText,
      normalizedText: normalizeText(chunkText),
      wordCount: windowWords.length,
      charCount: chunkText.length,
      type: "sliding_window",
    });
  }

  return chunks;
}
