import { TextChunk, ChunkFingerprint } from "../types.js";
import { sha256 } from "./sha256.js";
import { computeMinHashSignature } from "./minhash.js";
import { computeLshBands } from "./lsh.js";

export function fingerprintChunk(chunk: TextChunk): ChunkFingerprint {
  const minHashSignature = computeMinHashSignature(chunk.normalizedText);
  return {
    chunk,
    sha256Hash: sha256(chunk.normalizedText),
    minHashSignature,
    lshBands: computeLshBands(minHashSignature),
  };
}

export function fingerprintChunks(chunks: TextChunk[]): ChunkFingerprint[] {
  return chunks.map(fingerprintChunk);
}
