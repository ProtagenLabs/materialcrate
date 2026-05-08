// Thin singleton wrapper so the rest of the codebase doesn't construct
// DetectionPipeline directly or worry about the Prisma client reference.

import { prisma } from "../../config/prisma.js";
import { DetectionPipeline } from "./pipeline/detection-pipeline.js";
import { extractText } from "./text-extractor.js";
import { PlagiarismDetectionResult } from "./types.js";

let _pipeline: DetectionPipeline | null = null;
function pipeline(): DetectionPipeline {
  if (!_pipeline) _pipeline = new DetectionPipeline(prisma);
  return _pipeline;
}

// Check a newly uploaded file for plagiarism before (or just after) saving.
// Returns null when text extraction is not supported for the file type.
export async function checkUploadForPlagiarism(
  fileBase64: string,
  mimeType: string,
  excludePostId = "",
): Promise<PlagiarismDetectionResult | null> {
  const text = await extractText(fileBase64, mimeType);
  if (!text || text.trim().length < 50) return null;

  return pipeline().detect(text, excludePostId);
}

// Index a saved post so future uploads can match against it.
// Call this after the post row is committed — pass the extracted text.
export async function indexPostContent(
  postId: string,
  text: string,
): Promise<void> {
  if (!text || text.trim().length < 50) return;
  await pipeline().indexPost(postId, text);
}

// Remove all fingerprints when a post is deleted.
export async function removePostIndex(postId: string): Promise<void> {
  await pipeline().removePostIndex(postId);
}

export type { PlagiarismDetectionResult } from "./types.js";
