"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import useScrollVisibility from "./useScrollVisibility";

const NAV_PATHS = new Set(["/", "/hub", "/saved"]);

export default function ConditionalNavbar() {
  const pathname = usePathname();
  const isVisible = useScrollVisibility();

  const shouldShowNavbar =
    NAV_PATHS.has(pathname) ||
    pathname.startsWith("/saved/folder/") ||
    pathname.startsWith("/user/");

  if (!shouldShowNavbar) {
    return null;
  }

  return (
    <>
      <nav
        className="fixed left-0 right-0 bottom-0 z-30 flex items-center border-t border-t-edge-mid bg-surface py-4 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{
          transform: isVisible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms ease-out",
        }}
      >
        <Navbar />
      </nav>
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30 w-18 xl:w-55 border-r border-edge-mid bg-surface flex-col transition-[width] duration-300 ease-out">
        <Navbar />
      </nav>
    </>
  );
}
