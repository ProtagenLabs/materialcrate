"use client";

import { useEffect, useRef, useState } from "react";
import { CloseCircle } from "iconsax-reactjs";
import { trackFeedInteraction } from "@/app/lib/feed-tracking";
import type { HomePost } from "./Post";

// ─── Adsterra Ad Zones (rotated per slot) ────────────────────────────────────
type AdZone =
  | { type: "native"; src: string; containerId: string }
  | { type: "banner"; key: string; src: string; width: number; height: number }
  | { type: "socialbar"; src: string };

const AD_ZONES: AdZone[] = [
  {
    type: "native",
    src: "https://pl29107546.profitablecpmratenetwork.com/dca3faf47483a0c15be4506365e921d8/invoke.js",
    containerId: "container-dca3faf47483a0c15be4506365e921d8",
  },
  {
    type: "banner",
    key: "44be9916dcda20992159a6ccdf64c31e",
    src: "https://www.highperformanceformat.com/44be9916dcda20992159a6ccdf64c31e/invoke.js",
    width: 468,
    height: 60,
  },
  {
    type: "socialbar",
    src: "https://pl29109074.profitablecpmratenetwork.com/c5/54/ee/c554ee202f818aef11daa36cba5961d3.js",
  },
];

// Injected before every ad script — blocks redirects and makes popups safe.
const AD_SANDBOX_SCRIPT = `<script>
(function(){
  var _open = window.open.bind(window);
  window.open = function(url, name, features) {
    var f = (features || '') + ',noopener,noreferrer';
    return _open(url, '_blank', f);
  };
  // Block any attempt to navigate the parent frame
  try { window.top.location; } catch(e) {}
  Object.defineProperty(window, 'top', { get: function(){ return window; } });
})();
<\/script>`;

function buildAdHtml(zone: AdZone, cacheBust: string): string {
  const base =
    `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;}</style></head><body>${AD_SANDBOX_SCRIPT}`;
  const close = `</body></html>`;

  if (zone.type === "native") {
    return (
      base +
      `<script async="async" data-cfasync="false" src="${zone.src}?r=${cacheBust}"><\/script>` +
      `<div id="${zone.containerId}"></div>` +
      close
    );
  }
  if (zone.type === "banner") {
    return (
      base +
      `<script>atOptions={'key':'${zone.key}','format':'iframe','height':${zone.height},'width':${zone.width},'params':{}};<\/script>` +
      `<script src="${zone.src}?r=${cacheBust}"><\/script>` +
      close
    );
  }
  // socialbar
  return (
    base +
    `<script src="${zone.src}?r=${cacheBust}"><\/script>` +
    close
  );
}
// ─────────────────────────────────────────────────────────────────────────────

type PdfViewerModalProps = {
  post: HomePost | null;
  isOpen: boolean;
  onClose: () => void;
};

type PdfState = {
  isLoading: boolean;
  isRendering: boolean;
  error: string;
  pageCount: number;
};

const INITIAL_STATE: PdfState = {
  isLoading: false,
  isRendering: false,
  error: "",
  pageCount: 0,
};

export default function PdfViewerModal({
  post,
  isOpen,
  onClose,
}: PdfViewerModalProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [pdfState, setPdfState] = useState<PdfState>(INITIAL_STATE);
  const proxiedFileUrl = post?.id
    ? `/api/posts/file?postId=${encodeURIComponent(post.id)}`
    : "";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const preventShortcutDownloadOrPrint = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const hideBeforePrint = () => {
      const container = canvasContainerRef.current;
      if (container) {
        container.style.visibility = "hidden";
      }
    };

    const restoreAfterPrint = () => {
      const container = canvasContainerRef.current;
      if (container) {
        container.style.visibility = "visible";
      }
    };

    document.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("keydown", preventShortcutDownloadOrPrint, true);
    window.addEventListener("beforeprint", hideBeforePrint);
    window.addEventListener("afterprint", restoreAfterPrint);

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener(
        "keydown",
        preventShortcutDownloadOrPrint,
        true,
      );
      window.removeEventListener("beforeprint", hideBeforePrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
      restoreAfterPrint();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !post?.id) {
      return;
    }

    const timer = window.setTimeout(() => {
      void trackFeedInteraction({
        postId: post.id,
        interactionType: "LONG_VIEW",
        signalKind: "positive",
        durationMs: 8000,
        metadata: {
          source: "pdf-viewer",
        },
      });
    }, 8000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, post?.id]);

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;

    if (!isOpen || !proxiedFileUrl || !canvasContainer) {
      setPdfState(INITIAL_STATE);
      return;
    }

    let isCancelled = false;
    let loadingTask: { destroy: () => void } | null = null;

    const renderPdf = async () => {
      setPdfState({ isLoading: true, isRendering: false, error: "", pageCount: 0 });

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        // Range requests are disabled: the proxy re-authenticates and
        // re-downloads from S3 on every request, so chunked fetching would
        // be far slower than a single download. Memory safety comes from
        // page.cleanup() below, not from limiting fetch size.
        const task = pdfjs.getDocument({
          url: proxiedFileUrl,
          httpHeaders: {
            "x-materialcrate-pdf-request": "viewer",
          },
          withCredentials: true,
          disableRange: true,
        });
        loadingTask = task;

        const pdf = await task.promise;

        if (isCancelled) {
          task.destroy();
          return;
        }

        canvasContainer.innerHTML = "";

        // Reveal the container and start showing pages as they render.
        // isRendering stays true until the last page is done.
        setPdfState({
          isLoading: false,
          isRendering: pdf.numPages > 1,
          error: "",
          pageCount: pdf.numPages,
        });

        // Randomise the ad interval (3–5 pages), stable for this render.
        const adInterval = 3 + Math.floor(Math.random() * 3);
        let adSlotIndex = 0;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (isCancelled) break;

          const page = await pdf.getPage(pageNumber);

          // Two sources of blurriness to fix:
          //
          // 1. Scale too low: A4 at 1.25× = ~743 px wide. If the container
          //    is 768 px the browser upscales the canvas, which always blurs.
          //    Downscaling a larger canvas is always sharper — so we use 1.5×
          //    as the base (A4 → 892 px, US Letter → 918 px, both > container).
          //
          // 2. HiDPI/Retina: multiply by devicePixelRatio so the buffer has
          //    one physical pixel per screen pixel. Cap the combined scale at 3×
          //    so 100-page PDFs on Retina don't blow the canvas memory budget.
          const dpr = window.devicePixelRatio ?? 1;
          const RENDER_SCALE = Math.min(1.5 * dpr, 3);
          const viewport = page.getViewport({ scale: RENDER_SCALE });

          // Placeholder aspect ratio uses logical (CSS) dimensions — dpr cancels.
          const wrapper = document.createElement("div");
          wrapper.className =
            "relative overflow-hidden rounded bg-surface-high shadow-sm select-none";
          wrapper.style.aspectRatio = `${viewport.width / dpr} / ${viewport.height / dpr}`;
          canvasContainer.appendChild(wrapper);

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            continue;
          }

          // Canvas buffer = physical pixels; CSS display = w-full h-auto so the
          // browser downscales it to fit the container — giving crisp text.
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "h-auto w-full pointer-events-none";

          // Guard against Safari's per-canvas size limit (~4096 px on some
          // versions). Scale down proportionally if a dimension exceeds it.
          const MAX_CANVAS_DIM = 4096;
          if (canvas.width > MAX_CANVAS_DIM || canvas.height > MAX_CANVAS_DIM) {
            const ratio = Math.min(
              MAX_CANVAS_DIM / canvas.width,
              MAX_CANVAS_DIM / canvas.height,
            );
            const cappedViewport = page.getViewport({ scale: RENDER_SCALE * ratio });
            canvas.width = cappedViewport.width;
            canvas.height = cappedViewport.height;
            await page.render({ canvas, canvasContext: context, viewport: cappedViewport }).promise;
          } else {
            await page.render({ canvas, canvasContext: context, viewport }).promise;
          }

          // Release pdfjs's internal decoded image data for this page.
          // Without this, every page's pixel data stays live in memory for
          // the entire session — Safari kills the tab on large PDFs.
          page.cleanup();

          if (isCancelled) break;

          wrapper.style.aspectRatio = "";
          wrapper.className =
            "relative overflow-hidden rounded bg-surface shadow-sm select-none";
          wrapper.appendChild(canvas);

          // Insert a native ad after every adInterval pages (not after the last page).
          // Each ad uses an isolated iframe so Adsterra runs fresh with no ID conflicts.
          if (
            pageNumber % adInterval === 0 &&
            pageNumber < pdf.numPages
          ) {
            const zone = AD_ZONES[adSlotIndex % AD_ZONES.length];
            adSlotIndex += 1;

            const adWrapper = document.createElement("div");
            adWrapper.className =
              "relative rounded-xl bg-surface shadow-sm";

            const sponsored = document.createElement("span");
            sponsored.textContent = "Sponsored";
            sponsored.style.cssText =
              "position:absolute;top:8px;right:10px;font-size:10px;color:var(--ink-3);z-index:1;pointer-events:none;";
            adWrapper.appendChild(sponsored);

            const iframe = document.createElement("iframe");
            // Start with a sensible min-height per format so the slot isn't collapsed.
            const minHeight = zone.type === "banner" ? zone.height : 120;
            iframe.style.cssText =
              `width:100%;height:${minHeight}px;border:none;display:block;overflow:hidden;`;
            iframe.sandbox.add(
              "allow-scripts",
              "allow-same-origin",
              "allow-popups",
              "allow-popups-to-escape-sandbox",
              "allow-forms",
            );
            adWrapper.appendChild(iframe);
            canvasContainer.appendChild(adWrapper);

            // srcdoc replaces the deprecated document.write pattern.
            const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            iframe.srcdoc = buildAdHtml(zone, cacheBust);

            // Resize once the iframe settles — ad scripts inject content
            // asynchronously so we watch with ResizeObserver instead of 'load'.
            const resizeToContent = () => {
              const body = iframe.contentDocument?.body;
              if (body && body.scrollHeight > minHeight) {
                iframe.style.height = `${body.scrollHeight}px`;
              }
            };

            iframe.addEventListener("load", () => {
              resizeToContent();
              // Poll briefly for async ad injection finishing.
              let attempts = 0;
              const poll = setInterval(() => {
                resizeToContent();
                attempts += 1;
                if (attempts >= 10) clearInterval(poll);
              }, 300);
            });
          }

          if (pageNumber === pdf.numPages) {
            setPdfState((prev) => ({ ...prev, isRendering: false }));
          }
        }
      } catch {
        if (!isCancelled) {
          setPdfState({
            isLoading: false,
            isRendering: false,
            error: "Unable to render this protected PDF right now.",
            pageCount: 0,
          });
        }
      }
    };

    void renderPdf();

    return () => {
      isCancelled = true;
      loadingTask?.destroy();
      canvasContainer.innerHTML = "";
    };
  }, [isOpen, proxiedFileUrl]);

  if (!isOpen || !post) return null;

  return (
    <div
      className="fixed inset-0 z-150 flex items-center justify-center sm:px-4 sm:py-6"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[#F4F1EC] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-edge-mid px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">
              {post.title}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {post.categories.join(", ")}
              {pdfState.pageCount > 0 && ` • ${pdfState.pageCount} pages`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Close button" onClick={onClose}>
              <CloseCircle size={28} color="var(--ink)" variant="Bold" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#E7E1D8] p-4">
          {pdfState.isLoading && (
            <div className="flex h-full items-center justify-center text-sm text-ink-2">
              Loading PDF...
            </div>
          )}
          {pdfState.error && (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-sm text-center text-sm text-[#8A3A25]">
                {pdfState.error}
              </p>
            </div>
          )}
          <div
            ref={canvasContainerRef}
            className={`mx-auto flex max-w-3xl flex-col gap-4 ${
              pdfState.isLoading || (pdfState.error && "hidden")
            }`}
          />
          {pdfState.isRendering && (
            <div className="mt-4 flex justify-center text-xs text-ink-2">
              Loading more pages...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
