"use client";

import { useEffect } from "react";

const ADSENSE_CLIENT = "ca-pub-4938895869648539";
const ADSENSE_SLOT = "5899842940";

export default function FeedAd() {
  useEffect(() => {
    if (!document.querySelector(`script[src*="pagead2.googlesyndication.com"]`)) {
      const script = document.createElement("script");
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }

    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {}
  }, []);

  return (
    <article className="lg:rounded-xl lg:border lg:border-edge lg:mb-4 lg:bg-surface lg:shadow-sm">
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <div className="flex items-center gap-2 py-1 pl-1">
          <div className="flex h-11 w-11 aspect-square items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-edge">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"
                fill="var(--ink-3)"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Sponsored</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ background: "var(--edge)", color: "var(--ink-3)" }}
              >
                Ad
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 pt-2 pb-4">
        <div className="overflow-hidden rounded-[22px] bg-doc-card p-3">
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={ADSENSE_SLOT}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </div>
    </article>
  );
}
