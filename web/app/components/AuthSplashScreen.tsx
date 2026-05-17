"use client";

import Image from "next/image";

export default function AuthSplashScreen() {
  return (
    <div className="fixed inset-0 z-100 flex min-h-dvh items-center justify-center bg-[#111111] text-ink">
      <div className="flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="Material Crate"
          width={132}
          height={132}
          priority
          className="h-28 w-auto object-contain"
        />
      </div>
      <div className="absolute bottom-10">
        <Image
          src="/protagenlabs-logo-text.png"
          alt="Protagen Labs"
          width={120}
          height={120}
          priority
        />
      </div>
    </div>
  );
}
