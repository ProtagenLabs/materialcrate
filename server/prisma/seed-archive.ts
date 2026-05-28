import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import bcrypt from "bcrypt";
import * as dotenv from "dotenv";

// pdfjs-dist@3 (legacy build) requires canvas@2.11.2 which has no Node v24
// prebuilt binaries. Intercept require('canvas') at the Node module level and
// return @napi-rs/canvas instead — this catches both init-time AND lazy
// render-time requires inside pdfjs.
(globalThis as any).DOMMatrix ??= DOMMatrix;
(globalThis as any).Path2D ??= Path2D;
(globalThis as any).ImageData ??= ImageData;

const _require = createRequire(import.meta.url);
const NodeModule = _require("module") as any;
const _nativeCanvas = { createCanvas, DOMMatrix, Path2D, ImageData };
const _origLoad = NodeModule._load.bind(NodeModule);
NodeModule._load = (id: string, ...args: any[]) => {
  if (id === "canvas") return _nativeCanvas;
  return _origLoad(id, ...args);
};

const pdfjsLib = _require("pdfjs-dist/legacy/build/pdf.js") as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED" as const,
  responseChecksumValidation: "WHEN_REQUIRED" as const,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArchiveItem {
  identifier: string;
  title: string;
  creator: string;
  subject: string;
  description: string;
  year: number;
  pageUrl: string;
  categories: string[];
}

// ─── Subject Query Plan ───────────────────────────────────────────────────────
// [searchTerm, normalizedSubjectLabel, maxItemsToKeep]
// Sorted by downloads desc so the first N results are popular/vetted titles.

const SUBJECT_QUERIES: Array<[string, string, number]> = [
  ["mathematics textbook", "Mathematics", 14],
  ["calculus textbook", "Mathematics", 8],
  ["linear algebra textbook", "Mathematics", 6],
  ["physics textbook", "Physics", 14],
  ["chemistry textbook", "Chemistry", 10],
  ["biology textbook", "Biology", 10],
  ["economics textbook", "Economics", 10],
  ["history", "History", 8],
  ["computer science algorithms", "Computer Science", 10],
  ["philosophy", "Philosophy", 8],
  ["engineering textbook", "Engineering", 8],
  ["statistics textbook", "Statistics", 8],
  ["psychology textbook", "Psychology", 8],
  ["sociology textbook", "Sociology", 6],
];
// Approx total before dedup: 128 items. Dedup by identifier brings it lower.

// Max PDF size we are willing to download (bytes). Large scanned books can
// exceed 200 MB and are impractical for a seed run.
const MAX_PDF_BYTES = 40 * 1024 * 1024; // 40 MB

// ─── Fake Users ───────────────────────────────────────────────────────────────

const DICEBEAR_STYLES = [
  "adventurer",
  "adventurer-neutral",
  "avataaars",
  "avataaars-neutral",
  "big-ears",
  "big-ears-neutral",
  "big-smile",
  "bottts",
  "bottts-neutral",
  "croodles",
  "croodles-neutral",
  "dylan",
  "fun-emoji",
  "glass",
  "icons",
  "identicon",
  "initials",
  "lorelei",
  "lorelei-neutral",
  "micah",
  "miniavs",
  "notionists",
  "notionists-neutral",
  "open-peeps",
  "personas",
  "pixel-art",
  "pixel-art-neutral",
  "rings",
  "shapes",
  "thumbs",
];

const SEED_USERS = [
  // prolific archivist — 20 posts, premium badge
  {
    username: "archive_librarian",
    displayName: "Archive Librarian",
    email: "librarian@archive.example.com",
    institution: "Internet Archive",
    program: "Digital Preservation",
    plan: "premium",
    prolific: true,
  },
  {
    username: "zara_khalil",
    displayName: "Zara Khalil",
    email: "zara.khalil@example.com",
    institution: "American University of Beirut",
    program: "Mathematics",
    plan: "pro",
    prolific: false,
  },
  {
    username: "tom_odhiambo",
    displayName: "Tom Odhiambo",
    email: "tom.odhiambo@example.com",
    institution: "University of Nairobi",
    program: "Physics",
    plan: "free",
    prolific: false,
  },
  {
    username: "claire_dubois",
    displayName: "Claire Dubois",
    email: "claire.dubois@example.com",
    institution: "Université Paris-Saclay",
    program: "Chemistry",
    plan: "premium",
    prolific: false,
  },
  {
    username: "ibrahim_yilmaz",
    displayName: "İbrahim Yılmaz",
    email: "ibrahim.yilmaz@example.com",
    institution: "Middle East Technical University",
    program: "Engineering",
    plan: "pro",
    prolific: false,
  },
  {
    username: "grace_osei",
    displayName: "Grace Osei",
    email: "grace.osei@example.com",
    institution: "Kwame Nkrumah University",
    program: "Biology",
    plan: "free",
    prolific: false,
  },
  {
    username: "dmitri_volkov",
    displayName: "Dmitri Volkov",
    email: "dmitri.volkov@example.com",
    institution: "Novosibirsk State University",
    program: "Statistics",
    plan: "pro",
    prolific: false,
  },
  {
    username: "preethi_subramanian",
    displayName: "Preethi Subramanian",
    email: "preethi.subramanian@example.com",
    institution: "IIT Bombay",
    program: "Computer Science",
    plan: "free",
    prolific: false,
  },
  {
    username: "luisa_ferreira",
    displayName: "Luisa Ferreira",
    email: "luisa.ferreira@example.com",
    institution: "Universidade de Lisboa",
    program: "History",
    plan: "pro",
    prolific: false,
  },
  {
    username: "yusuf_balogun",
    displayName: "Yusuf Balogun",
    email: "yusuf.balogun@example.com",
    institution: "Obafemi Awolowo University",
    program: "Economics",
    plan: "free",
    prolific: false,
  },
  {
    username: "hana_novak",
    displayName: "Hana Novák",
    email: "hana.novak@example.com",
    institution: "Charles University",
    program: "Philosophy",
    plan: "premium",
    prolific: false,
  },
  {
    username: "rin_nakamura",
    displayName: "Rin Nakamura",
    email: "rin.nakamura@example.com",
    institution: "Kyoto University",
    program: "Psychology",
    plan: "pro",
    prolific: false,
  },
  {
    username: "kweku_amponsah",
    displayName: "Kweku Amponsah",
    email: "kweku.amponsah@example.com",
    institution: "University of Ghana",
    program: "Sociology",
    plan: "free",
    prolific: false,
  },
  {
    username: "natalia_suarez",
    displayName: "Natalia Suárez",
    email: "natalia.suarez@example.com",
    institution: "Universidad Nacional de Colombia",
    program: "Biology",
    plan: "pro",
    prolific: false,
  },
  {
    username: "alexei_morozov",
    displayName: "Alexei Morozov",
    email: "alexei.morozov@example.com",
    institution: "Moscow State Technical University",
    program: "Physics",
    plan: "free",
    prolific: false,
  },
  {
    username: "amina_touré",
    displayName: "Amina Touré",
    email: "amina.toure@example.com",
    institution: "Université de Bamako",
    program: "Economics",
    plan: "premium",
    prolific: false,
  },
  {
    username: "samuel_asare",
    displayName: "Samuel Asare",
    email: "samuel.asare@example.com",
    institution: "University of Cape Coast",
    program: "Mathematics",
    plan: "pro",
    prolific: false,
  },
  {
    username: "elif_demir",
    displayName: "Elif Demir",
    email: "elif.demir@example.com",
    institution: "Boğaziçi University",
    program: "Chemistry",
    plan: "free",
    prolific: false,
  },
  {
    username: "bongani_dlamini",
    displayName: "Bongani Dlamini",
    email: "bongani.dlamini@example.com",
    institution: "University of KwaZulu-Natal",
    program: "Engineering",
    plan: "pro",
    prolific: false,
  },
  {
    username: "mei_hong_lin",
    displayName: "Mei-Hong Lin",
    email: "mei.hong.lin@example.com",
    institution: "National Taiwan University",
    program: "Statistics",
    plan: "free",
    prolific: false,
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function coerceToString(val: unknown): string {
  if (!val) return "";
  if (Array.isArray(val)) return val[0] ?? "";
  return String(val);
}

function coerceToArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return [String(val)];
}

// Strip simple HTML tags and collapse whitespace from archive.org descriptions.
function cleanDescription(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function isEnglish(lang: unknown): boolean {
  const strs = coerceToArray(lang).map((s) => s.toLowerCase());
  return (
    strs.length === 0 ||
    strs.some((s) => s === "en" || s === "eng" || s.startsWith("english"))
  );
}

function hasFreeablePdf(formats: string[]): boolean {
  const pdfTypes = ["Text PDF", "Image Container PDF", "Additional Text PDF"];
  const drmTypes = ["ACS Encrypted PDF", "LCP Encrypted PDF"];
  const hasDrm = formats.some((f) => drmTypes.includes(f));
  const hasPdf = formats.some((f) => pdfTypes.includes(f));
  return hasPdf && !hasDrm;
}

function pickCategories(subjects: string[], normalizedSubject: string): string[] {
  const cleaned = subjects
    .map((s) => s.toLowerCase().replace(/\s*[-–—]\s*.+$/, "").trim())
    .filter(
      (s) =>
        s.length > 2 &&
        s.length < 40 &&
        !s.includes("archive") &&
        !s.includes("digitized"),
    )
    .slice(0, 3);

  const base = normalizedSubject.toLowerCase();
  if (!cleaned.includes(base)) cleaned.unshift(base);
  return cleaned.slice(0, 3);
}

// ─── Archive.org Search ───────────────────────────────────────────────────────

async function searchArchive(
  query: string,
  subject: string,
  rows: number,
): Promise<ArchiveItem[]> {
  // Sort by downloads so the top results are popular/vetted items.
  // Exclude CDL (controlled digital lending) borrow-only items which require
  // an archive.org account and return HTML pages instead of real PDFs.
  const params = new URLSearchParams({
    q: `${query} AND mediatype:texts AND language:eng AND NOT access-restricted-item:true`,
    output: "json",
    rows: String(rows * 6), // oversample more generously — CDL/DRM filtering reduces yield
    page: "1",
    "sort[]": "downloads desc",
  });
  // Comma-separated fl list
  const fields = "identifier,title,creator,subject,description,year,language,format";
  const url = `https://archive.org/advancedsearch.php?${params.toString()}&fl[]=${encodeURIComponent(fields)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];

  const json = await res.json();
  const docs: Record<string, unknown>[] = json?.response?.docs ?? [];

  const items: ArchiveItem[] = [];
  for (const doc of docs) {
    if (items.length >= rows) break;

    const identifier = coerceToString(doc["identifier"]);
    const title = coerceToString(doc["title"]).trim();
    const formats = coerceToArray(doc["format"]);
    const lang = doc["language"];

    if (!identifier || !title) continue;
    if (!isEnglish(lang)) continue;
    if (!hasFreeablePdf(formats)) continue;

    const rawDesc = coerceToString(doc["description"]);
    const description = rawDesc
      ? cleanDescription(rawDesc)
      : `Classic text from the Internet Archive: "${title}".`;

    const rawSubjects = coerceToArray(doc["subject"]);
    const yearRaw = coerceToString(doc["year"]);
    const year = parseInt(yearRaw) || 1950;

    items.push({
      identifier,
      title,
      creator: coerceToString(doc["creator"]),
      subject,
      description,
      year,
      pageUrl: `https://archive.org/details/${identifier}`,
      categories: pickCategories(rawSubjects, subject),
    });
  }

  return items;
}

// ─── Resolve PDF Download URL ─────────────────────────────────────────────────
// Queries the archive.org metadata/files API to find the best PDF filename,
// preferring "Text PDF" (born-digital/OCR) over "Image Container PDF" (scan).

const PDF_PRIORITY = ["Text PDF", "Additional Text PDF", "Image Container PDF"];

async function resolveArchivePdfUrl(identifier: string): Promise<string | null> {
  const url = `https://archive.org/metadata/${identifier}/files`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const files: Record<string, string>[] = json?.result ?? [];

    // Find the best PDF by priority order.
    for (const pdfFormat of PDF_PRIORITY) {
      const file = files.find((f) => f["format"] === pdfFormat);
      if (file?.["name"]) {
        return `https://archive.org/download/${identifier}/${encodeURIComponent(file["name"])}`;
      }
    }
    // Last-resort: any file ending in .pdf
    const any = files.find((f) => f["name"]?.toLowerCase().endsWith(".pdf"));
    if (any?.["name"]) {
      return `https://archive.org/download/${identifier}/${encodeURIComponent(any["name"])}`;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Per-Item S3 PDF Upload ───────────────────────────────────────────────────

async function ensureItemPdfsOnS3(
  items: ArchiveItem[],
): Promise<Map<string, string>> {
  const bucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error(
      "AWS_S3_PRIVATE_BUCKET and AWS_REGION must be set in .env.",
    );
  }

  const result = new Map<string, string>(); // identifier → s3Url
  console.log(`Ensuring PDFs for ${items.length} items...`);

  for (const item of items) {
    const slug = `${item.identifier}-${sanitizeName(item.title).slice(0, 40)}`;
    const key = `documents/seed-archive-${slug.slice(0, 80)}.pdf`;
    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    // Idempotent: skip if already in S3.
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      result.set(item.identifier, s3Url);
      continue;
    } catch {
      // Not found — fall through to upload.
    }

    // Resolve the actual PDF filename from the archive.org metadata API.
    const downloadUrl = await resolveArchivePdfUrl(item.identifier);
    if (!downloadUrl) {
      console.warn(`  No PDF resolved for "${item.title}" (${item.identifier})`);
      continue;
    }

    // archive.org CDN can be slow — try twice with increasing timeouts before giving up.
    let buffer: Buffer | null = null;
    for (const timeoutMs of [120_000, 180_000]) {
      try {
        const res = await fetch(downloadUrl, {
          headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // archive.org returns HTML login/borrow pages (200 OK) for CDL items
        // that require an account. Reject anything that isn't a PDF.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/pdf") && !contentType.includes("octet-stream")) {
          console.warn(
            `  Skipping "${item.title}" — not a PDF (Content-Type: ${contentType})`,
          );
          buffer = null;
          break;
        }

        // Check Content-Length before buffering to skip oversized scans.
        const contentLength = parseInt(
          res.headers.get("content-length") ?? "0",
        );
        if (contentLength > MAX_PDF_BYTES) {
          console.warn(
            `  Skipping "${item.title}" — PDF too large (${(contentLength / 1024 / 1024).toFixed(0)} MB)`,
          );
          buffer = null;
          break;
        }

        buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_PDF_BYTES) {
          console.warn(
            `  Skipping "${item.title}" — PDF too large after download (${(buffer.length / 1024 / 1024).toFixed(0)} MB)`,
          );
          buffer = null;
          break;
        }

        // Validate PDF magic bytes — catches HTML borrow pages served as
        // octet-stream and any other non-PDF binary responses.
        if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
          console.warn(
            `  Skipping "${item.title}" — response is not a valid PDF (no %PDF- header)`,
          );
          buffer = null;
        }
        break; // success (or validation skip) — don't retry
      } catch (err) {
        const msg = (err as Error).message;
        const isTimeout =
          msg.includes("timeout") ||
          msg.includes("aborted") ||
          msg.includes("abort");
        if (isTimeout && timeoutMs < 180_000) {
          console.warn(
            `  Timeout on "${item.title.slice(0, 40)}" — retrying with longer timeout...`,
          );
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.warn(`  PDF failed "${item.title}": ${msg}`);
        break;
      }
    }

    if (buffer) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: "application/pdf",
          }),
        );
        process.stdout.write(
          `  PDF: "${item.title.slice(0, 48)}" (${(buffer.length / 1024).toFixed(0)} KB)\n`,
        );
        result.set(item.identifier, s3Url);
      } catch (err) {
        console.warn(
          `  S3 upload failed "${item.title}": ${(err as Error).message}`,
        );
      }
    }

    // Archive.org asks for polite crawling — 1.5 s between requests.
    await new Promise((r) => setTimeout(r, 1500));
  }

  return result;
}

// ─── PDF Thumbnail Generation ─────────────────────────────────────────────────

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(
    obj: ReturnType<NodeCanvasFactory["create"]>,
    width: number,
    height: number,
  ) {
    obj.canvas.width = width;
    obj.canvas.height = height;
  }
  destroy(obj: ReturnType<NodeCanvasFactory["create"]>) {
    obj.canvas.width = 0;
    obj.canvas.height = 0;
  }
}

async function pdfFirstPageToJpeg(pdfBuffer: Buffer): Promise<Buffer> {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const factory = new NodeCanvasFactory();
  const canvasObj = factory.create(
    Math.floor(viewport.width),
    Math.floor(viewport.height),
  );

  await page.render({
    canvasContext: canvasObj.context as any,
    viewport,
    canvasFactory: factory as any,
  }).promise;

  const pngBuffer = canvasObj.canvas.toBuffer("image/png");
  factory.destroy(canvasObj);

  return sharp(pngBuffer)
    .resize(800, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function generateItemThumbnails(
  items: ArchiveItem[],
  fileUrlByIdentifier: Map<string, string>,
): Promise<Map<string, string>> {
  const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
  const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const cfBase = (process.env.CLOUDFRONT_URL ?? "").replace(/\/$/, "");
  const result = new Map<string, string>();

  if (!publicBucket || !privateBucket || !cfBase) {
    console.warn(
      "  S3 or CloudFront env vars missing — thumbnails will be null.",
    );
    return result;
  }

  console.log(`Generating thumbnails for ${items.length} items...`);

  for (const item of items) {
    if (!fileUrlByIdentifier.has(item.identifier)) continue;

    const slug = `${item.identifier}-${sanitizeName(item.title).slice(0, 40)}`;
    const thumbKey = `thumbnails/seed-archive-${slug.slice(0, 80)}.jpg`;
    const cfUrl = `${cfBase}/${thumbKey}`;

    try {
      await s3.send(
        new HeadObjectCommand({ Bucket: publicBucket, Key: thumbKey }),
      );
      result.set(item.identifier, cfUrl);
      continue;
    } catch {
      // Not found — generate
    }

    const pdfKey = `documents/seed-archive-${slug.slice(0, 80)}.pdf`;
    try {
      const getRes = await s3.send(
        new GetObjectCommand({ Bucket: privateBucket, Key: pdfKey }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of getRes.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const jpegBuffer = await pdfFirstPageToJpeg(Buffer.concat(chunks));
      await s3.send(
        new PutObjectCommand({
          Bucket: publicBucket,
          Key: thumbKey,
          Body: jpegBuffer,
          ContentType: "image/jpeg",
        }),
      );
      process.stdout.write(`  Thumbnail: "${item.title.slice(0, 50)}"\n`);
      result.set(item.identifier, cfUrl);
    } catch (err) {
      console.warn(
        `  Thumbnail failed "${item.title}": ${(err as Error).message}`,
      );
    }
  }

  return result;
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
  const existingCount = await prisma.post.count();
  console.log(
    `Database has ${existingCount} existing posts — adding Internet Archive posts alongside them.`,
  );

  if (process.argv.includes("--reset")) {
    console.log("--reset: removing previous seed users and their posts...");
    await prisma.user.deleteMany({
      where: { email: { in: SEED_USERS.map((u) => u.email) } },
    });
  }

  // ── Fetch items from archive.org ──
  console.log("Fetching items from the Internet Archive...");
  const seenIdentifiers = new Set<string>();
  const allItems: ArchiveItem[] = [];

  for (const [query, subject, maxItems] of SUBJECT_QUERIES) {
    process.stdout.write(`  Searching: "${query}" (${subject})...`);
    try {
      const results = await searchArchive(query, subject, maxItems);
      let added = 0;
      for (const item of results) {
        if (!seenIdentifiers.has(item.identifier)) {
          seenIdentifiers.add(item.identifier);
          allItems.push(item);
          added++;
        }
      }
      process.stdout.write(` ${added} unique items\n`);
    } catch (err) {
      process.stdout.write(` failed: ${(err as Error).message}\n`);
    }
    // Polite crawl delay between subject queries.
    await new Promise((r) => setTimeout(r, 1000));
  }

  // TEST CAP — remove after prod test
  allItems.splice(10);

  console.log(`Total unique items fetched: ${allItems.length}`);
  if (allItems.length === 0) {
    console.error("No items fetched from the Internet Archive. Aborting.");
    process.exit(1);
  }

  // ── Hash shared password ──
  const passwordHash = await bcrypt.hash("SeedPassword123!", 10);

  // ── Create or reuse users ──
  console.log("Creating users (skipping any that already exist)...");
  const createdUsers = await Promise.all(
    SEED_USERS.map(async (u, idx) => {
      const existing = await prisma.user.findFirst({
        where: { email: u.email },
      });
      if (existing) {
        console.log(`  Reusing existing user: ${u.email}`);
        return existing;
      }
      const style = DICEBEAR_STYLES[idx % DICEBEAR_STYLES.length];
      const profilePicture = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(u.username)}&size=200`;
      return prisma.user.create({
        data: {
          username: u.username,
          displayName: u.displayName,
          email: u.email,
          password: passwordHash,
          emailVerified: true,
          institution: u.institution,
          program: u.program,
          subscriptionPlan: u.plan,
          profilePicture,
        },
      });
    }),
  );

  // ── Seed follow relationships ──
  console.log("Seeding follow relationships...");
  {
    const weights = createdUsers.map((_, i) => {
      const u = SEED_USERS[i];
      if (u.prolific) return 5;
      if (u.plan === "premium") return 3;
      if (u.plan === "pro") return 2;
      return 1;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    function pickFollowTarget(excludeIdx: number): number {
      let r = Math.random() * totalWeight;
      for (let i = 0; i < weights.length; i++) {
        if (i === excludeIdx) continue;
        r -= weights[i];
        if (r <= 0) return i;
      }
      return excludeIdx === 0 ? 1 : 0;
    }

    const followPairs: Array<{ followerId: string; followingId: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < createdUsers.length; i++) {
      const count = 5 + Math.floor(Math.random() * 10);
      const targets = new Set<number>();
      let attempts = 0;
      while (
        targets.size < Math.min(count, createdUsers.length - 1) &&
        attempts < 100
      ) {
        targets.add(pickFollowTarget(i));
        attempts++;
      }
      for (const j of targets) {
        const key = `${createdUsers[i].id}:${createdUsers[j].id}`;
        if (!seen.has(key)) {
          seen.add(key);
          followPairs.push({
            followerId: createdUsers[i].id,
            followingId: createdUsers[j].id,
          });
        }
      }
    }

    await prisma.follow.createMany({ data: followPairs, skipDuplicates: true });
    console.log(`  Created ${followPairs.length} follow relationships.`);
  }

  const prolificUser = createdUsers.find((_, i) => SEED_USERS[i].prolific)!;
  const regularUsers = createdUsers.filter((u) => u.id !== prolificUser.id);

  // ── Distribute items: prolific gets first 20, rest split among regulars ──
  const shuffled = [...allItems].sort(() => Math.random() - 0.5);
  const prolificItems = shuffled.slice(0, Math.min(20, shuffled.length));
  const remaining = shuffled.slice(prolificItems.length);

  type Assignment = { user: (typeof createdUsers)[0]; item: ArchiveItem };
  const assignments: Assignment[] = prolificItems.map((item) => ({
    user: prolificUser,
    item,
  }));
  remaining.forEach((item, i) => {
    assignments.push({ user: regularUsers[i % regularUsers.length], item });
  });

  // ── Upload PDFs then render thumbnails ──
  const fileUrlByIdentifier = await ensureItemPdfsOnS3(allItems);
  const thumbnailByIdentifier = await generateItemThumbnails(
    allItems,
    fileUrlByIdentifier,
  );

  // ── Create posts (only for items that got a PDF uploaded) ──
  console.log(`Seeding posts...`);
  let count = 0;

  for (const { user, item } of assignments) {
    const fileUrl = fileUrlByIdentifier.get(item.identifier);
    if (!fileUrl) continue; // PDF couldn't be fetched — skip silently

    const thumbnailUrl = thumbnailByIdentifier.get(item.identifier) ?? null;
    await prisma.post.create({
      data: {
        title: item.title,
        fileUrl,
        fileType: "pdf",
        thumbnailUrl,
        categories: item.categories,
        description: item.description,
        year: item.year,
        isFree: true,
        price: 0,
        authorId: user.id,
        versions: {
          create: {
            versionNumber: 1,
            title: item.title,
            categories: item.categories,
            description: item.description,
            year: item.year,
            fileUrl,
            thumbnailUrl,
            fileType: "pdf",
            editorId: user.id,
          },
        },
      },
    });

    count++;
    if (count % 10 === 0)
      process.stdout.write(`  ${count}/${assignments.length}\n`);
  }

  console.log(
    `\nDone! Created ${createdUsers.length} users and ${count} posts.`,
  );
  console.log(
    `  Prolific user: ${prolificUser.username} (up to ${prolificItems.length} posts)`,
  );
  console.log(
    `  Regular users: ${regularUsers.length} users sharing remaining posts`,
  );
  console.log("\nSeed user credentials:");
  console.log("  Password for all: SeedPassword123!");
  SEED_USERS.forEach((u) => console.log(`  ${u.email}`));
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
