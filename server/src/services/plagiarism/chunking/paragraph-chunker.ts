import { TextChunk } from "../types.js";
import { normalizeText, countWords } from "./normalizer.js";
import { slidingWindowChunk } from "./sliding-window-chunker.js";
import { PLAGIARISM_CONFIG } from "../config.js";

// Primary strategy. Paragraph splits are semantically meaningful — plagiarists
// tend to copy whole paragraphs. When a paragraph is abnormally long (solid wall
// of text with no breaks) we defer to sliding window on that block.
export function paragraphChunk(text: string): TextChunk[] {
  const { minWordCount, maxWordCount } = PLAGIARISM_CONFIG.chunking.paragraph;

  // Support both Unix and Windows line endings, markdown and plain text.
  const rawParagraphs = text.split(/\r?\n(?:\r?\n)+/);

  const chunks: TextChunk[] = [];
  let index = 0;

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const wc = countWords(trimmed);

    // Skip stub paragraphs — headings, page numbers, captions.
    if (wc < minWordCount) continue;

    // Oversized paragraph → fall back to sliding window on just this block.
    if (wc > maxWordCount) {
      const subChunks = slidingWindowChunk(trimmed, index);
      for (const sc of subChunks) {
        chunks.push({ ...sc, index: index++ });
      }
      continue;
    }

    chunks.push({
      index: index++,
      text: trimmed,
      normalizedText: normalizeText(trimmed),
      wordCount: wc,
      charCount: trimmed.length,
      type: "paragraph",
    });
  }

  return chunks;
}
