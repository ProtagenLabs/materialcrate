"use client";

import { usePathname } from "next/navigation";
const NAV_PATHS = new Set(["/", "/hub", "/saved"]);

export default function DesktopSidebarOffset({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const hasSidebar =
    NAV_PATHS.has(pathname) ||
    pathname.startsWith("/saved/folder/") ||
    pathname.startsWith("/user/");

  return (
    <div
      className={
        hasSidebar
          ? "lg:ml-18 lg:mr-18 xl:ml-55 xl:mr-55 transition-[margin] duration-300 ease-out"
          : ""
      }
    >
      {children}
    </div>
  );
}
