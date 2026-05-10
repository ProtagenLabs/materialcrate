"use client";

import { useEffect, useState } from "react";
import { CloseCircle } from "iconsax-reactjs";
import { trackFeedInteraction } from "@/app/lib/feed-tracking";
import type { HomePost } from "./Post";

function buildViewerHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 15px; }
  body {
    font-family: Georgia, "Times New Roman", Times, serif;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 36px 48px;
    max-width: 800px;
    margin-inline: auto;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  h1, h2, h3, h4, h5, h6 {
    font-weight: 700;
    line-height: 1.3;
    margin: 1.2em 0 0.4em;
    color: #111;
  }
  h1 { font-size: 1.9em; }
  h2 { font-size: 1.55em; }
  h3 { font-size: 1.3em; }
  h4 { font-size: 1.1em; }
  p { margin: 0 0 0.85em; }
  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  ul, ol { padding-left: 1.8em; margin: 0 0 0.85em; }
  li { margin-bottom: 0.25em; }
  blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 3px solid #ccc;
    color: #555;
    font-style: italic;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1.2em 0;
    font-size: 0.92em;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 7px 12px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f3f3f3;
    font-weight: 700;
    color: #222;
  }
  tr:nth-child(even) td { background: #fafafa; }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.75em auto;
    border-radius: 4px;
  }
  a { color: #1a6bb5; text-underline-offset: 2px; }
  a:visited { color: #7b4a9e; }
  pre, code {
    font-family: "Courier New", Courier, monospace;
    background: #f4f4f4;
    border-radius: 3px;
    font-size: 0.88em;
  }
  pre { padding: 10px 14px; overflow-x: auto; }
  code { padding: 1px 4px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }

  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #e0e0e0; }
    h1, h2, h3, h4 { color: #f0f0f0; }
    th { background: #2d2d2d; color: #e0e0e0; }
    th, td { border-color: #3a3a3a; }
    tr:nth-child(even) td { background: #252525; }
    blockquote { border-left-color: #555; color: #aaa; }
    a { color: #5aa7f8; }
    a:visited { color: #b58cf5; }
    pre, code { background: #2a2a2a; color: #d4d4d4; }
  }

  @media (max-width: 600px) {
    body { padding: 18px 20px; font-size: 14px; }
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.3em; }
    table { font-size: 0.82em; }
    th, td { padding: 5px 8px; }
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

type WordDocumentViewerProps = {
  post: HomePost | null;
  isOpen: boolean;
  onClose: () => void;
};

type DocState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; html: string }
  | { phase: "error"; message: string };

export default function WordDocumentViewer({
  post,
  isOpen,
  onClose,
}: WordDocumentViewerProps) {
  const [docState, setDocState] = useState<DocState>({ phase: "idle" });

  useEffect(() => {
    if (!isOpen || !post?.id) return;
    const timer = window.setTimeout(() => {
      void trackFeedInteraction({
        postId: post.id,
        interactionType: "LONG_VIEW",
        signalKind: "positive",
        durationMs: 8000,
        metadata: { source: "word-viewer" },
      });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [isOpen, post?.id]);

  useEffect(() => {
    if (!isOpen || !post?.id) {
      setDocState({ phase: "idle" });
      return;
    }

    let cancelled = false;
    setDocState({ phase: "loading" });

    void (async () => {
      try {
        const res = await fetch(
          `/api/posts/rendered-html?postId=${encodeURIComponent(post.id)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const html = await res.text();
        if (!cancelled) setDocState({ phase: "ready", html });
      } catch {
        if (!cancelled) {
          setDocState({
            phase: "error",
            message: "Unable to render this document right now.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, post?.id]);


  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center px-4 py-6">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[#F4F1EC] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-edge-mid px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">
              {post.title}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {post.categories.join(", ")}
              {post.fileType && post.fileType !== "pdf" && (
                <span className="ml-2 rounded bg-surface-high px-1.5 py-0.5 text-xs font-medium uppercase text-ink-3">
                  {post.fileType}
                </span>
              )}
            </p>
          </div>
          <button type="button" aria-label="Close button" onClick={onClose}>
            <CloseCircle size={28} color="var(--ink)" variant="Bold" />
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden bg-[#E7E1D8]">
          {docState.phase === "loading" && (
            <div className="flex h-full items-center justify-center text-sm text-ink-2">
              Loading document...
            </div>
          )}
          {docState.phase === "error" && (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-sm text-center text-sm text-[#8A3A25]">
                {docState.message}
              </p>
            </div>
          )}
          {docState.phase === "ready" && (
            <iframe
              key={docState.html.length}
              title={post.title}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={buildViewerHtml(docState.html)}
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
