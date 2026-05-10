import { createRequire } from "module";

const _require = createRequire(import.meta.url);

type MammothMod = {
  convertToHtml: (
    input: { buffer: Buffer },
    options?: Record<string, unknown>,
  ) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
};

let _mammoth: MammothMod | null = null;

function getMammoth(): MammothMod {
  if (_mammoth) return _mammoth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = _require("mammoth") as any;
  const resolved = mod?.default ?? mod;
  if (typeof resolved?.convertToHtml !== "function") {
    throw new Error("[doc-converter] mammoth.convertToHtml not found");
  }
  _mammoth = resolved as MammothMod;
  return _mammoth;
}

function sanitizeHtml(html: string): string {
  return (
    html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(
        /<\/?(iframe|object|embed|applet|form|input|button|textarea|select|meta|link|base|xml)[^>]*>/gi,
        "",
      )
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      .replace(
        /(href|src|action)\s*=\s*["']?\s*(javascript|vbscript):[^"'\s>]*/gi,
        '$1="#"',
      )
      .replace(/style\s*=\s*"[^"]*\bexpression\s*\([^"]*"/gi, "")
      .replace(/style\s*=\s*'[^']*\bexpression\s*\([^']*'/gi, "")
      .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')
  );
}

export interface WordConversionResult {
  html: string;
  text: string;
  warnings: string[];
}

export async function convertWordToHtml(
  buffer: Buffer,
): Promise<WordConversionResult> {
  const mammoth = getMammoth();

  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
  ]);

  const warnings = htmlResult.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message);

  return {
    html: sanitizeHtml(htmlResult.value),
    text: textResult.value,
    warnings,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word.slice(0, maxChars);
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateWordThumbnail(
  text: string,
): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sharpMod = (await import("sharp")) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sharpFn: (input: Buffer) => any = sharpMod.default ?? sharpMod;

    const svgW = 224;
    const svgH = 320;
    const padX = 14;
    const padY = 18;
    const fontSize = 9;
    const lineH = 13;
    const maxLines = 21;
    const charsPerLine = 34;

    const normalized = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    const lines = wordWrap(normalized, charsPerLine).slice(0, maxLines);

    const textElements = lines
      .map((line, i) => {
        const y = padY + i * lineH;
        const bold = i === 0 ? ' font-weight="700"' : "";
        return `  <text x="${padX}" y="${y}" font-size="${fontSize}" fill="#1a1a1a" font-family="Georgia, serif"${bold}>${escapeXml(line)}</text>`;
      })
      .join("\n");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="#ffffff"/>
  <rect x="1" y="1" width="${svgW - 2}" height="${svgH - 2}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
${textElements}
</svg>`;

    return (await sharpFn(Buffer.from(svg))
      .resize(112, 160, { kernel: "lanczos3" })
      .webp({ quality: 80 })
      .toBuffer()) as Buffer;
  } catch {
    return null;
  }
}

export function isValidWordBuffer(
  buffer: Buffer,
  fileType: "docx" | "doc",
): boolean {
  if (buffer.length < 4) return false;

  if (fileType === "docx") {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}
