import { createCanvas, Canvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const THUMBNAIL_WIDTH = 280;

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas: Canvas; context: unknown }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: Canvas; context: unknown }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

export async function pdfToThumbnailBuffer(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = _require("pdfjs-dist/legacy/build/pdf.js");

    const pdf = await pdfjsLib
      .getDocument({
        data: new Uint8Array(pdfBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      })
      .promise;

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_WIDTH / Math.max(baseViewport.width, 1);
    const viewport = page.getViewport({ scale });

    const factory = new NodeCanvasFactory();
    const canvasObj: { canvas: Canvas; context: unknown } = factory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );

    await page.render({
      canvasContext: canvasObj.context,
      viewport,
      canvasFactory: factory,
    }).promise;

    const pngBuffer = canvasObj.canvas.toBuffer("image/png");
    factory.destroy(canvasObj);
    page.cleanup();
    void pdf.destroy();

    return await sharp(pngBuffer).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}
