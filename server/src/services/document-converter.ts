import { createRequire } from "module";
import sanitizeHtmlLib from "sanitize-html";

const _require = createRequire(import.meta.url);

type MammothImage = {
  read: (encoding: "base64" | "binary") => Promise<string>;
  contentType: string;
  altText?: string;
};

type MammothMod = {
  convertToHtml: (
    input: { buffer: Buffer },
    options?: Record<string, unknown>,
  ) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  images: {
    imgElement: (
      converter: (image: MammothImage) => Promise<Record<string, string>>,
    ) => unknown;
  };
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
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "div", "span", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "em", "b", "i", "u", "s", "strike", "sub", "sup", "code", "pre",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
      "a", "img",
    ],
    allowedAttributes: {
      "*": ["class", "style"],
      "a": ["href", "target", "rel"],
      "img": ["src", "alt", "width", "height"],
      "td": ["colspan", "rowspan"],
      "th": ["colspan", "rowspan"],
      "col": ["span"],
    },
    allowedSchemes: ["https", "http"],
    allowedSchemesByTag: {
      img: ["https", "http", "data"],
    },
    allowedStyles: {
      "*": {
        "color": [/.*/],
        "background-color": [/.*/],
        "font-size": [/.*/],
        "font-weight": [/.*/],
        "font-style": [/.*/],
        "text-align": [/.*/],
        "text-decoration": [/.*/],
        "margin": [/.*/],
        "padding": [/.*/],
      },
    },
    transformTags: {
      "a": sanitizeHtmlLib.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}

export interface WordConversionResult {
  html: string;
  text: string;
  warnings: string[];
}

// Max dimension for images embedded in the rendered HTML.
// Keeps data URIs small enough that the full document stays well under 5 MB.
const MAX_EMBEDDED_IMAGE_PX = 900;

export async function convertWordToHtml(
  buffer: Buffer,
): Promise<WordConversionResult> {
  const mammoth = getMammoth();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharpMod = (await import("sharp")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharpFn: (input: Buffer) => any = sharpMod.default ?? sharpMod;

  const convertImage = mammoth.images.imgElement(async (image: MammothImage) => {
    const base64 = await image.read("base64");
    const attrs: Record<string, string> = {};
    if (image.altText) attrs["alt"] = image.altText;

    try {
      const rawBuffer = Buffer.from(base64, "base64");
      const compressed: Buffer = await sharpFn(rawBuffer)
        .resize({ width: MAX_EMBEDDED_IMAGE_PX, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      attrs["src"] = `data:image/webp;base64,${compressed.toString("base64")}`;
    } catch {
      attrs["src"] = `data:${image.contentType};base64,${base64}`;
    }

    return attrs;
  });

  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }, { convertImage }),
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
