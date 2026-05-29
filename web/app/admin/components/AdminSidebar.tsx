"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiHome, HiUsers, HiDocumentText } from "react-icons/hi2";

const NAV_ITEMS = [
  { href: "/admin", label: "Home", icon: HiHome },
  { href: "/admin/uploads", label: "Uploads", icon: HiDocumentText },
  { href: "/admin/team", label: "Team", icon: HiUsers },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col bg-[#0d0d0d]">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <Image src="/logo.svg" alt="MaterialCrate" width={24} height={24} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-white">
            MaterialCrate
          </p>
          <p className="mt-1 text-[10px] text-white/35">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:bg-white/5 hover:text-white/75"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.07] px-5 py-4">
        <p className="text-[10px] text-white/25">Restricted access</p>
      </div>
    </aside>
  );
}
