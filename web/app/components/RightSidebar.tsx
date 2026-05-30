"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchNormal1 } from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";

type SidebarPost = {
  id: string;
  title: string;
  viewCount?: number | null;
};

type SidebarUser = {
  id: string;
  username: string;
  displayName: string;
  profilePicture?: string | null;
  subscriptionPlan: string;
};

type SidebarData = {
  trendingPosts: SidebarPost[];
  suggestedCategories: string[];
  suggestedUsers: SidebarUser[];
};

export default function RightSidebar({
  profileUsername,
}: {
  profileUsername?: string;
} = {}) {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [sidebarData, setSidebarData] = useState<SidebarData | null>(null);
  const [isLoadingSidebar, setIsLoadingSidebar] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/sidebar", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SidebarData | null) => {
        if (cancelled || !data) return;
        setSidebarData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingSidebar(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <aside className="hidden lg:flex flex-col sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Search — stays pinned at top of sidebar while content scrolls */}
      <div className="sticky top-0 z-10 pb-2 pt-4">
        <div className="relative">
          <SearchNormal1
            size={15}
            color="var(--ink-3)"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="text"
            placeholder={profileUsername ? "Search in profile" : "Search…"}
            className="w-full rounded-2xl border border-edge bg-surface py-3 pl-9 pr-4 text-sm text-ink placeholder:text-ink-3 shadow-sm transition-all focus:border-[#E1761F]/40 focus:outline-none focus:ring-2 focus:ring-[#E1761F]/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (!val) return;
                const params = new URLSearchParams({ q: val });
                if (profileUsername) params.set("author", profileUsername);
                router.push(`/search?${params.toString()}`);
              }
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 pb-12">
        {/* Subscribe CTA */}
        {!user?.subscriptionPlan && (
          <div className="relative overflow-hidden rounded-2xl bg-[#0d0d0d] p-5">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[#E1761F]/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-violet-500/15 blur-2xl" />
            <div className="relative">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#E1761F]/15 px-2.5 py-1 text-[11px] font-semibold text-[#E1761F]">
                ✦ MaterialCrate Pro
              </span>
              <p className="text-sm font-semibold leading-snug text-white">
                Upgrade your experience
              </p>
              <ul className="mt-3 space-y-2">
                {[
                  "Get rid of ads, completely",
                  "More AI assistant credits",
                  "Your own verification badge",
                  "Early access to new features",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-xs text-white/60"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-[#E1761F]" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => router.push("/plans")}
                className="mt-4 w-full rounded-xl bg-[#E1761F] py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#C96018] active:scale-[.98] cursor-pointer"
              >
                Subscribe
              </button>
            </div>
          </div>
        )}

        {/* Trending materials */}
        <div className="rounded-2xl border border-edge bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-ink">
            Trending materials
          </h3>
          {isLoadingSidebar ? (
            <div className="space-y-3">
              {[72, 88, 64, 96, 80].map((w) => (
                <div key={w} className="flex gap-3">
                  <div className="skeleton h-4 w-4 shrink-0 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className="skeleton h-3 rounded-full"
                      style={{ width: w }}
                    />
                    <div className="skeleton h-2.5 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !sidebarData?.trendingPosts.length ? (
            <p className="text-xs text-ink-3">Nothing trending yet.</p>
          ) : (
            <div className="space-y-3">
              {sidebarData.trendingPosts.map((post, i) => (
                <button
                  key={post.id}
                  type="button"
                  className="group flex w-full cursor-pointer gap-3 text-left"
                  onClick={() => router.push(`/post/${post.id}`)}
                >
                  <span className="mt-0.5 w-4 shrink-0 text-right text-sm font-bold text-ink-3">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs font-medium leading-relaxed text-ink transition-colors duration-150 group-hover:text-[#E1761F]">
                      {post.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-3">
                      {(post.viewCount ?? 0).toLocaleString()} views
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subjects for you */}
        <div className="rounded-2xl border border-edge bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-ink">Subjects for you</h3>
          <p className="mb-3 mt-0.5 text-xs text-ink-3">
            Based on what you&apos;ve been exploring
          </p>
          {isLoadingSidebar ? (
            <div className="flex flex-wrap gap-2">
              {[80, 64, 96, 72, 88, 56, 76].map((w) => (
                <div
                  key={w}
                  className="skeleton h-7 rounded-full"
                  style={{ width: w }}
                />
              ))}
            </div>
          ) : !sidebarData?.suggestedCategories.length ? (
            <p className="text-xs text-ink-3">Nothing to show yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sidebarData.suggestedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    router.push(`/search?q=${encodeURIComponent(cat)}`)
                  }
                  className="cursor-pointer rounded-full border border-edge bg-page px-3 py-1 text-xs font-medium text-ink-2 transition-colors duration-150 hover:border-[#E1761F]/50 hover:bg-[#E1761F]/5 hover:text-[#E1761F]"
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Who to follow */}
        <div className="rounded-2xl border border-edge bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-ink">Who to follow</h3>
          {isLoadingSidebar || isLoadingAuth ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-24 rounded-full" />
                    <div className="skeleton h-2.5 w-16 rounded-full" />
                  </div>
                  <div className="skeleton h-7 w-14 rounded-full" />
                </div>
              ))}
            </div>
          ) : !sidebarData?.suggestedUsers.length ? (
            <p className="text-xs text-ink-3">No suggestions yet.</p>
          ) : (
            <div className="space-y-3">
              {sidebarData.suggestedUsers.map((su) => (
                <div key={su.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/user/${su.username}`)}
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-ink/8 cursor-pointer"
                  >
                    {su.profilePicture ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={su.profilePicture}
                        alt={su.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#E1761F]/10 text-[11px] font-bold text-[#E1761F]">
                        {su.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-ink">
                      {su.displayName}
                    </p>
                    <p className="text-[10px] text-ink-3">@{su.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/user/${su.username}`)}
                    className="shrink-0 rounded-full border border-edge px-3 py-1 text-xs font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink cursor-pointer"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
