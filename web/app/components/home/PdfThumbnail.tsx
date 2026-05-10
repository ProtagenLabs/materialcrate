"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/lib/auth-client";

type PdfThumbnailProps = {
  postId: string;
  fileUrl?: string;
  thumbnailUrl?: string | null;
  title: string;
  fileType?: string | null;
};

type ThumbnailState = "idle" | "loading" | "ready" | "error";

export default function PdfThumbnail({
  postId,
  fileUrl,
  thumbnailUrl,
  title,
  fileType,
}: PdfThumbnailProps) {
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !authLoading && Boolean(user);
  const isWordDoc = fileType === "docx" || fileType === "doc";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>("idle");
  const [imageFailed, setImageFailed] = useState(false);
  const proxiedFileUrl = postId
    ? `/api/posts/file?postId=${encodeURIComponent(postId)}`
    : "";
  const proxiedThumbnailUrl = postId
    ? `/api/posts/thumbnail?postId=${encodeURIComponent(postId)}`
    : "";
  const canUseStoredThumbnail = Boolean(thumbnailUrl && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (canUseStoredThumbnail) {
      setThumbnailState("ready");
      return;
    }

    if (isWordDoc) {
      setThumbnailState("error");
      return;
    }

    if (!isAuthenticated) {
      setThumbnailState("error");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !proxiedFileUrl) {
      setThumbnailState("error");
      return;
    }

    let isCancelled = false;

    const renderThumbnail = async () => {
      setThumbnailState("loading");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjs.getDocument({
          url: proxiedFileUrl,
          httpHeaders: {
            "x-materialcrate-pdf-request": "viewer",
          },
          withCredentials: true,
          disableRange: true,
        }).promise;
        const page = await pdf.getPage(1);

        if (isCancelled) {
          return;
        }

        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = 140 / unscaledViewport.width;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Failed to render thumbnail");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, canvasContext: context, viewport }).promise;

        if (!isCancelled) {
          setThumbnailState("ready");
        }
      } catch {
        if (!isCancelled) {
          setThumbnailState("error");
        }
      }
    };

    void renderThumbnail();

    return () => {
      isCancelled = true;
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [canUseStoredThumbnail, isAuthenticated, isWordDoc, proxiedFileUrl]);

  return (
    <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-sm bg-[#E8E8E8]">
      {canUseStoredThumbnail && proxiedThumbnailUrl ? (
        <Image
          src={proxiedThumbnailUrl}
          alt={`${title} preview`}
          className="block h-full w-full object-cover object-top"
          width={112}
          height={160}
          unoptimized
          loading="eager"
          onError={() => {
            setImageFailed(true);
            setThumbnailState("idle");
          }}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        aria-label={`${title} preview`}
        className={`block h-full w-full object-top ${
          !canUseStoredThumbnail && thumbnailState === "ready"
            ? "opacity-100"
            : "opacity-0"
        }`}
      />
      {!canUseStoredThumbnail && thumbnailState !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#E8E8E8] px-2 text-center text-[10px] font-medium text-ink-2">
          {thumbnailState === "error"
            ? isWordDoc
              ? fileType?.toUpperCase() ?? "WORD"
              : "PDF"
            : "Loading preview..."}
        </div>
      )}
    </div>
  );
}
