import { createRequire } from "module";

const _require = createRequire(import.meta.url);

// pdf-parse v2 API:
//   new PDFParse({ verbosity, data: Uint8Array }) → parser
//   await parser.load()          → loads the PDF (no args — data is in constructor)
//   await parser.getText()       → { text: string, pages: [...], total: number }
type PdfParseV2Class = new (opts: { verbosity: number; data: Uint8Array }) => {
  load: () => Promise<void>;
  getText: () => Promise<{ text: string }>;
};
type MammothMod = { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };

function resolvePdfParse(): PdfParseV2Class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = _require("pdf-parse") as any;
  const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse;
  if (typeof PDFParse !== "function") {
    throw new Error(
      `[plagiarism] pdf-parse.PDFParse not found. Keys: ${Object.keys(mod ?? {}).join(", ")}`,
    );
  }
  return PDFParse as PdfParseV2Class;
}

function resolveMammoth(): MammothMod {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = _require("mammoth") as any;
  const resolved = mod?.default ?? mod;
  if (typeof resolved?.extractRawText !== "function") {
    throw new Error(
      `[plagiarism] mammoth.extractRawText not found. ` +
      `Top-level keys: ${Object.keys(mod ?? {}).join(", ")}`,
    );
  }
  return resolved as MammothMod;
}

let _pdfParse: PdfParseV2Class | null = null;
let _mammoth: MammothMod | null = null;

export async function extractText(
  fileBase64: string,
  mimeType: string,
): Promise<string | null> {
  const buffer = Buffer.from(fileBase64, "base64");

  try {
    if (mimeType === "application/pdf") {
      if (!_pdfParse) _pdfParse = resolvePdfParse();
      const parser = new _pdfParse({ verbosity: -1, data: new Uint8Array(buffer) });
      await parser.load();
      const result = await parser.getText();
      return result.text;
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      if (!_mammoth) _mammoth = resolveMammoth();
      const result = await _mammoth.extractRawText({ buffer });
      return result.value;
    }

    if (mimeType === "text/plain") {
      return buffer.toString("utf8");
    }

    return null;
  } catch (err) {
    console.error("[plagiarism] text extraction failed:", err);
    return null;
  }
}
