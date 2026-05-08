// Strip punctuation, collapse whitespace, lowercase — deterministic.
// Every chunk goes through this before hashing so "Hello, World!" and
// "hello world" produce the same fingerprint.
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
