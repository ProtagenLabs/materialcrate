"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  onRetry: () => void;
};

export default function ServerDownPage({ onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetry();
    // onRetry updates parent state; give it a moment before re-enabling
    setTimeout(() => setRetrying(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-[#f7f1e8] text-ink">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <Image
          src="/logo.png"
          alt="Material Crate"
          width={96}
          height={96}
          priority
          className="h-24 w-auto object-contain opacity-40"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-gray-800">
            Server Unavailable
          </h1>
          <p className="max-w-xs text-sm text-gray-500">
            We&apos;re having trouble reaching our servers. Please try again in
            a moment.
          </p>
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-2 rounded-lg bg-[#E1761F] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {retrying ? "Checking…" : "Try Again"}
        </button>
      </div>
      <div className="absolute bottom-10">
        <Image
          src="/mc-wordmark.svg"
          alt="MaterialCrate"
          width={120}
          height={120}
          priority
        />
      </div>
    </div>
  );
}
