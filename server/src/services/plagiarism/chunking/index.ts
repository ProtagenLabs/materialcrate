import { TextChunk } from "../types.js";
import { paragraphChunk } from "./paragraph-chunker.js";
import { slidingWindowChunk } from "./sliding-window-chunker.js";
import { countWords } from "./normalizer.js";
import { PLAGIARISM_CONFIG } from "../config.js";

// Decision logic:
// 1. Try paragraph chunking first.
// 2. If the document is dense (expected many chunks but got almost none),
//    fall back to sliding window on the whole document.
//    This handles PDFs where text extractors don't preserve paragraph breaks.
export function chunkDocument(text: string): TextChunk[] {
  const paragraphChunks = paragraphChunk(text);

  const totalWords = countWords(text);
  const { windowSizeWords } = PLAGIARISM_CONFIG.chunking.slidingWindow;
  // A "well-structured" document should produce roughly one chunk per window.
  const expectedChunks = Math.floor(totalWords / windowSizeWords);

  if (paragraphChunks.length === 0 || (expectedChunks >= 4 && paragraphChunks.length < 2)) {
    return slidingWindowChunk(text);
  }

  return paragraphChunks;
}

export { paragraphChunk } from "./paragraph-chunker.js";
export { slidingWindowChunk } from "./sliding-window-chunker.js";
export { normalizeText, countWords } from "./normalizer.js";
