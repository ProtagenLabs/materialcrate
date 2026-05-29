"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import DesktopChatPanel from "./DesktopChatPanel";
import {
  Home,
  Clipboard,
  Archive,
  Profile,
  Coin1,
  Messages2,
  Notification,
  DocumentUpload,
  MessageQuestion,
} from "iconsax-reactjs";
import type { Icon as IconsaxIcon } from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import { subscribeToNotificationActivity } from "@/app/lib/post-activity-realtime";

type NavItem = {
  label: string;
  href: string;
  Icon: IconsaxIcon;
};

const items: NavItem[] = [
  { label: "Home", href: "/", Icon: Home },
  { label: "AI Hub", href: "/hub", Icon: Clipboard },
  { label: "Chat", href: "/chat", Icon: Messages2 },
  { label: "Saved", href: "/saved", Icon: Archive },
  { label: "Profile", href: "/user", Icon: Profile },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const userProfileHref = user?.username
    ? `/user/${encodeURIComponent(user.username)}`
    : "/login";

  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [homeTab, setHomeTab] = useState("feed");
  const [rawUnreadCount, setRawUnreadCount] = useState(0);
  const [rawNotificationCount, setRawNotificationCount] = useState(0);
  const unreadMessageCount = user?.id ? rawUnreadCount : 0;
  const unreadNotificationCount = user?.id ? rawNotificationCount : 0;

  // Re-syncs the badge to the exact server-side unread total across all
  // conversations. Called on mount, on navigation, and whenever a conversation
  // is read or a new message arrives.
  const fetchUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations?: Array<{ unreadCount?: number }>;
      };
      if (Array.isArray(data?.conversations)) {
        const total = data.conversations.reduce(
          (sum, c) => sum + (c.unreadCount ?? 0),
          0,
        );
        setRawUnreadCount(total);
      }
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread, pathname]);

  // Initial fetch — gets the unread count once on mount.
  // After that, the Socket.IO subscription below keeps it current.
  useEffect(() => {
    if (!user?.id) return;
    void fetch("/api/notifications?limit=100&unreadOnly=true", {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { notifications?: unknown[] } | null) => {
        if (Array.isArray(data?.notifications)) {
          setRawNotificationCount(data.notifications.length);
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Real-time updates via Socket.IO — the server pushes the exact unread count
  // in every notification event so no re-fetch is needed.
  useEffect(() => {
    if (!user?.id) return;

    let unsubscribe: (() => void) | undefined;
    let disposed = false;

    void subscribeToNotificationActivity(user.id, (event) => {
      if (typeof event.unreadCount === "number") {
        setRawNotificationCount(event.unreadCount);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [user?.id]);

  useEffect(() => {
    // Optimistic +1 for instant feedback on an incoming message.
    const onNewChatMessage = () => setRawUnreadCount((n) => n + 1);
    // A conversation was read (or otherwise changed) — re-sync to the exact
    // server total. This is what makes the badge drop when you open a chat in
    // the desktop panel, where there's no route change to trigger a re-fetch.
    const onChatRead = () => void fetchUnread();
    window.addEventListener("mc:chat:new-message", onNewChatMessage);
    window.addEventListener("mc:chat:read", onChatRead);
    return () => {
      window.removeEventListener("mc:chat:new-message", onNewChatMessage);
      window.removeEventListener("mc:chat:read", onChatRead);
    };
  }, [fetchUnread]);

  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (tab) setHomeTab(tab);
    };
    window.addEventListener("mc:home-tab-change", onTabChange);
    return () => window.removeEventListener("mc:home-tab-change", onTabChange);
  }, []);

  return (
    <>
      <ul className="font-semibold text-xs flex w-full justify-between px-6 lg:hidden">
        {items.map(({ label, href, Icon }) => {
          const isProfileItem = href === "/user";
          const isArchiveItem = href === "/saved";
          const resolvedHref = isProfileItem ? userProfileHref : href;
          const isActive = isProfileItem
            ? userProfileHref !== "/login" && pathname === userProfileHref
            : isArchiveItem
              ? pathname === href || pathname.startsWith("/saved/folder/")
              : pathname === href;
          const color = isActive ? "#E1761F" : "#959595";
          return (
            <li key={href} className="flex flex-col items-center text-[10px]">
              <Link
                href={resolvedHref}
                className="flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition-colors duration-200 active:bg-black/5"
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (href === "/") return;
                  if (isLoading || user) return;
                  event.preventDefault();
                  router.push("/login");
                }}
              >
                <div className="relative">
                  <Icon
                    size={24}
                    color={color}
                    variant={isActive ? "Bold" : "Linear"}
                  />
                  {href === "/chat" && unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                      {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                    </span>
                  )}
                </div>
                <p className={isActive ? "text-[#E1761F]" : "text-[#959595]"}>
                  {label}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop sidebar nav */}
      <div className="hidden lg:flex flex-col h-full w-full">
        <div className="px-4 pt-8 pb-8">
          <button
            type="button"
            aria-label="MaterialCrate"
            onClick={() => {
              router.push("/");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="cursor-pointer transition-opacity duration-200 hover:opacity-80 active:opacity-60"
          >
            <Image
              src="/logo.svg"
              alt="MaterialCrate Logo"
              width={42}
              height={42}
              className="block"
            />
          </button>
        </div>
        <ul className="flex flex-col gap-1 px-2 flex-1">
          <li>
            <Link
              href="/notifications"
              className={`flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 hover:bg-black/5 active:scale-[0.97] ${
                pathname === "/notifications"
                  ? "text-[#E1761F] bg-[#FFF3E7]"
                  : "text-ink-2 hover:text-ink"
              }`}
              aria-current={pathname === "/notifications" ? "page" : undefined}
              onClick={(event) => {
                if (isLoading || user) return;
                event.preventDefault();
                router.push("/login");
              }}
            >
              <div className="relative shrink-0">
                <Notification
                  size={24}
                  color={pathname === "/notifications" ? "#E1761F" : "#959595"}
                  variant={pathname === "/notifications" ? "Bold" : "Linear"}
                />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </span>
                )}
              </div>
              <span className="hidden xl:inline">Notifications</span>
            </Link>
          </li>
          {user && (
            <li>
              <Link
                href="/tokens"
                className={`flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 hover:bg-black/5 active:scale-[0.97] ${
                  pathname === "/tokens"
                    ? "text-[#E1761F] bg-[#FFF3E7]"
                    : "text-ink-2 hover:text-ink"
                }`}
                aria-current={pathname === "/tokens" ? "page" : undefined}
              >
                <Coin1
                  size={24}
                  color={pathname === "/tokens" ? "#E1761F" : "#959595"}
                  variant={pathname === "/tokens" ? "Bold" : "Linear"}
                />
                <span className="hidden xl:inline">
                  Tokens
                  {user.tokenBalance != null && (
                    <span className="ml-1.5 rounded-full bg-[#FFF3E7] px-2 py-0.5 text-[10px] font-semibold text-[#E1761F]">
                      {new Intl.NumberFormat("en-US").format(user.tokenBalance)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )}
          {items.map(({ label, href, Icon }) => {
            const isProfileItem = href === "/user";
            const isArchiveItem = href === "/saved";
            const isChatItem = href === "/chat";
            const resolvedHref = isProfileItem ? userProfileHref : href;
            const isActive = isChatItem
              ? isChatPanelOpen
              : isProfileItem
                ? userProfileHref !== "/login" && pathname === userProfileHref
                : isArchiveItem
                  ? pathname === href || pathname.startsWith("/saved/folder/")
                  : pathname === href;
            const color = isActive ? "#E1761F" : "#959595";
            return (
              <li key={href}>
                <Link
                  href={resolvedHref}
                  className={`flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 hover:bg-black/5 active:scale-[0.97] ${
                    isActive
                      ? "text-[#E1761F] bg-[#FFF3E7]"
                      : "text-ink-2 hover:text-ink"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => {
                    if (isChatItem && window.innerWidth >= 1024) {
                      event.preventDefault();
                      if (!isLoading && !user) {
                        router.push("/login");
                        return;
                      }
                      setIsChatPanelOpen((prev) => !prev);
                      return;
                    }
                    if (href === "/") return;
                    if (isLoading || user) return;
                    event.preventDefault();
                    router.push("/login");
                  }}
                >
                  <div className="relative shrink-0">
                    <Icon
                      size={24}
                      color={color}
                      variant={isActive ? "Bold" : "Linear"}
                    />
                    {isChatItem && unreadMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                      </span>
                    )}
                  </div>
                  <span className="hidden xl:inline">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {user && (
          <div className="px-3 pb-3">
            {pathname === "/" && homeTab === "requests" ? (
              <button
                type="button"
                onClick={() => router.push("/request/create")}
                className="cursor-pointer w-full flex items-center justify-center gap-3 rounded-xl bg-[#E1761F] px-3 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#C96018] active:scale-[0.97]"
              >
                <MessageQuestion size={20} color="white" variant="Bold" />
                <span className="hidden xl:inline">New Request</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/create")}
                className="cursor-pointer w-full flex items-center justify-center gap-3 rounded-xl bg-[#E1761F] px-3 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#C96018] active:scale-[0.97]"
              >
                <DocumentUpload size={20} color="white" />
                <span className="hidden xl:inline">Upload</span>
              </button>
            )}
          </div>
        )}
        {!isLoading && !user && (
          <div className="px-3 pb-6">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="cursor-pointer w-full rounded-xl bg-[#131212] px-3 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#2A2A2A] active:scale-[0.97]"
            >
              <span className="hidden xl:inline">Log in</span>
              <span className="xl:hidden">
                <Profile size={24} color="white" variant="Bold" />
              </span>
            </button>
          </div>
        )}
      </div>
      <DesktopChatPanel
        isOpen={isChatPanelOpen}
        onClose={() => setIsChatPanelOpen(false)}
      />
    </>
  );
}
