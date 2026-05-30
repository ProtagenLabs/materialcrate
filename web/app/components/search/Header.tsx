"use client";

import { ArrowLeft2, SearchNormal1 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import useScrollVisibility from "../useScrollVisibility";
import LoadingBar from "../LoadingBar";

export type SearchTab = "users" | "documents";

type HeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  activeTab: SearchTab;
  onTabChange: (tab: SearchTab) => void;
  search: () => void;
  isLoading?: boolean;
};

export default function Header({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  search,
  isLoading = false,
}: HeaderProps) {
  const router = useRouter();
  const isVisible = useScrollVisibility();

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-30 bg-surface backdrop-blur-md transition-transform duration-300 ease-out lg:hidden ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      } ${!query && "pb-6"}`}
    >
      <div className="mx-auto max-w-2xl px-5 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => router.back()}
            className="transition-opacity hover:opacity-60 active:opacity-40"
          >
            <ArrowLeft2 size={20} color="var(--ink)" />
          </button>

          <div className="w-full rounded-[28px] border border-[#f0dfc8] bg-[#fffaf4]/90 px-4 py-3 shadow-[0_24px_60px_rgba(92,57,16,0.08)]">
            <label className="flex items-center justify-between gap-3">
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Find users and documents..."
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
              />
              <button type="button" onClick={search} aria-label="Search">
                <SearchNormal1 size={18} color="#c56f1b" />
              </button>
            </label>
          </div>
        </div>

        {query.trim().length > 0 && (
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0 h-0.75 w-[calc(50%-0.5rem)]  rounded-full bg-ink transition-transform duration-300 ease-out ${
                activeTab === "documents"
                  ? "translate-x-4"
                  : "translate-x-[calc(100%+0.5rem)]"
              }`}
            />
            {(["documents", "users"] as SearchTab[]).map((tab) => {
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  className="relative px-4 py-3 text-sm font-medium capitalize text-ink-2 transition-colors duration-300"
                >
                  <span>{tab}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {isLoading && <LoadingBar />}
    </div>
  );
}
