"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseCircle, Cpu } from "iconsax-reactjs";
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
  const base = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;}</style></head><body>${AD_SANDBOX_SCRIPT}`;
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
  return base + `<script src="${zone.src}?r=${cacheBust}"><\/script>` + close;
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
  const router = useRouter();
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
    let observer: IntersectionObserver | null = null;

    const renderPdf = async () => {
      setPdfState({
        isLoading: true,
        isRendering: false,
        error: "",
        pageCount: 0,
      });

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const task = pdfjs.getDocument({
          url: proxiedFileUrl,
          httpHeaders: { "x-materialcrate-pdf-request": "viewer" },
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

        const dpr = window.devicePixelRatio ?? 1;
        // Cap at 2× physical pixels per CSS pixel.
        // A4 at 2× = ~8 MB/canvas; beyond that Safari's GPU texture budget
        // crashes the tab on large documents even with per-page cleanup.
        const RENDER_SCALE = Math.min(1.5 * dpr, 2);
        const MAX_DIM = 4096;

        // Sample first page so all placeholders share its aspect ratio.
        // Most PDFs are single-size; mixed-size pages will re-flow on render.
        const firstPage = await pdf.getPage(1);
        const sampleVP = firstPage.getViewport({ scale: RENDER_SCALE });
        firstPage.cleanup();
        const placeholderRatio = `${sampleVP.width / dpr} / ${sampleVP.height / dpr}`;

        const adInterval = 3 + Math.floor(Math.random() * 3);
        let adSlotIndex = 0;

        // ── Build all placeholder wrappers up-front ───────────────────────
        // The scroll container gets the correct total height immediately, so
        // users can jump to any page without waiting for sequential rendering.
        const pageWrappers: HTMLDivElement[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const wrapper = document.createElement("div");
          wrapper.className =
            "relative overflow-hidden rounded bg-surface-high shadow-sm select-none";
          wrapper.dataset.page = String(n);
          wrapper.style.aspectRatio = placeholderRatio;
          canvasContainer.appendChild(wrapper);
          pageWrappers.push(wrapper);

          if (n % adInterval === 0 && n < pdf.numPages) {
            const zone = AD_ZONES[adSlotIndex % AD_ZONES.length];
            adSlotIndex++;
            const adWrapper = document.createElement("div");
            adWrapper.className = "relative rounded-xl bg-surface shadow-sm";
            const sponsored = document.createElement("span");
            sponsored.textContent = "Sponsored";
            sponsored.style.cssText =
              "position:absolute;top:8px;right:10px;font-size:10px;color:var(--ink-3);z-index:1;pointer-events:none;";
            adWrapper.appendChild(sponsored);
            const iframe = document.createElement("iframe");
            const minHeight = zone.type === "banner" ? zone.height : 120;
            iframe.style.cssText = `width:100%;height:${minHeight}px;border:none;display:block;overflow:hidden;`;
            iframe.sandbox.add(
              "allow-scripts",
              "allow-same-origin",
              "allow-popups",
              "allow-popups-to-escape-sandbox",
              "allow-forms",
            );
            adWrapper.appendChild(iframe);
            canvasContainer.appendChild(adWrapper);
            const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            iframe.srcdoc = buildAdHtml(zone, cacheBust);
            const resizeToContent = () => {
              const body = iframe.contentDocument?.body;
              if (body && body.scrollHeight > minHeight)
                iframe.style.height = `${body.scrollHeight}px`;
            };
            iframe.addEventListener("load", () => {
              resizeToContent();
              let attempts = 0;
              const poll = setInterval(() => {
                resizeToContent();
                if (++attempts >= 10) clearInterval(poll);
              }, 300);
            });
          }
        }

        setPdfState({
          isLoading: false,
          isRendering: false,
          error: "",
          pageCount: pdf.numPages,
        });

        // ── Per-page paint / wipe ─────────────────────────────────────────
        const rendering = new Set<number>();
        const rendered = new Set<number>();

        const paintPage = async (num: number, el: HTMLDivElement) => {
          if (rendering.has(num) || rendered.has(num) || isCancelled) return;
          rendering.add(num);
          try {
            const page = await pdf.getPage(num);
            const vp = page.getViewport({ scale: RENDER_SCALE });
            const finalVP =
              vp.width > MAX_DIM || vp.height > MAX_DIM
                ? page.getViewport({
                    scale:
                      RENDER_SCALE *
                      Math.min(MAX_DIM / vp.width, MAX_DIM / vp.height),
                  })
                : vp;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              page.cleanup();
              return;
            }

            canvas.width = finalVP.width;
            canvas.height = finalVP.height;
            canvas.className = "h-auto w-full pointer-events-none";

            await page.render({ canvas, canvasContext: ctx, viewport: finalVP })
              .promise;
            // Free pdfjs's internal decode buffer — canvas pixels stay on GPU.
            page.cleanup();

            if (isCancelled) return;

            el.style.aspectRatio = "";
            el.className =
              "relative overflow-hidden rounded bg-surface shadow-sm select-none";
            el.appendChild(canvas);
            rendered.add(num);
          } catch {
            // Leave as placeholder on transient errors; observer will retry on re-entry.
          } finally {
            rendering.delete(num);
          }
        };

        const wipePage = (num: number, el: HTMLDivElement) => {
          if (!rendered.has(num)) return;
          const canvas = el.querySelector("canvas");
          if (canvas) {
            // Setting dimensions to 0 immediately releases the GPU texture.
            canvas.width = 0;
            canvas.height = 0;
            canvas.remove();
          }
          el.style.aspectRatio = placeholderRatio;
          el.className =
            "relative overflow-hidden rounded bg-surface-high shadow-sm select-none";
          rendered.delete(num);
        };

        // ── IntersectionObserver virtual window ───────────────────────────
        // rootMargin pre-renders pages 400 px before they enter the viewport,
        // giving smooth scrolling without keeping every canvas in GPU memory.
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const el = entry.target as HTMLDivElement;
              const num = parseInt(el.dataset.page ?? "0", 10);
              if (!num) continue;
              if (entry.isIntersecting) {
                void paintPage(num, el);
              } else {
                wipePage(num, el);
              }
            }
          },
          {
            root: canvasContainer.parentElement,
            rootMargin: "400px 0px",
            threshold: 0,
          },
        );

        for (const wrapper of pageWrappers) {
          if (isCancelled) break;
          observer.observe(wrapper);
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
      observer?.disconnect();
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
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/hub?postId=${encodeURIComponent(post.id)}`);
              }}
              className="rounded-3xl bg-[#E1761F] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#C96018] active:scale-95 shrink-0 cursor-pointer"
            >
              Open in Hub
            </button>
            <button type="button" aria-label="Close" onClick={onClose}>
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
