"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchNormal1 } from "iconsax-reactjs";
import Post, {
  type HomePost,
  type PostOptionsAnchor,
} from "@/app/components/home/Post";
import OptionsDrawer from "@/app/components/home/PostOptions";
import Header, { type SearchTab } from "@/app/components/search/Header";
import UserCard, { type SearchUser } from "@/app/components/search/UserCard";
import RightSidebar from "@/app/components/RightSidebar";
import Alert from "../components/Alert";

const PAGE_SIZE = 12;

function PostSkeleton() {
  const sk = "skeleton";
  return (
    <div className="w-full px-3">
      <article className="lg:rounded-xl lg:border lg:border-edge lg:bg-surface lg:shadow-sm">
        <div className="flex items-start justify-between px-2 pt-2">
          <div className="flex items-center gap-3">
            <div className={`${sk} h-11 w-11 shrink-0 rounded-full`} />
            <div className="space-y-2">
              <div className={`${sk} h-3.5 w-32 rounded-full`} />
              <div className={`${sk} h-2.5 w-24 rounded-full`} />
            </div>
          </div>
          <div className={`${sk} h-8 w-8 rounded-full`} />
        </div>
        <div className={`${sk} mx-2 mt-3 h-36 rounded-xl`} />
        <div className="px-2 pt-3 space-y-2">
          <div className={`${sk} h-3.5 w-3/4 rounded-full`} />
          <div className="flex gap-2">
            <div className={`${sk} h-5 w-16 rounded-full`} />
            <div className={`${sk} h-5 w-20 rounded-full`} />
          </div>
        </div>
        <div className="flex items-center gap-4 px-2 py-3">
          <div className={`${sk} h-5 w-12 rounded-full`} />
          <div className={`${sk} h-5 w-12 rounded-full`} />
          <div className={`${sk} h-5 w-12 rounded-full`} />
        </div>
      </article>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-0 pt-3">
      {[0, 1, 2, 3].map((i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const authorParam = searchParams.get("author")?.trim() ?? "";
  const initialTab =
    searchParams.get("tab") === "users" ? "users" : "documents";

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [documents, setDocuments] = useState<HomePost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [isPostOptionsDrawerOpen, setIsPostOptionsDrawerOpen] = useState(false);
  const [activeOptionsPost, setActiveOptionsPost] = useState<HomePost | null>(null);
  const [activeOptionsAnchor, setActiveOptionsAnchor] =
    useState<PostOptionsAnchor | null>(null);

  const offsetRef = useRef({ users: 0, documents: 0 });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    const nextQuery = searchParams.get("q")?.trim() ?? "";
    const nextTab = searchParams.get("tab") === "users" ? "users" : "documents";
    setQuery((c) => (c === nextQuery ? c : nextQuery));
    setActiveTab((c) => (c === nextTab ? c : nextTab));
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsString);
    if (query.trim()) nextParams.set("q", query.trim());
    else nextParams.delete("q");
    nextParams.set("tab", activeTab);
    const qs = nextParams.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [activeTab, query, router, searchParamsString]);

  const fetchResults = useCallback(
    async (
      q: string,
      tab: SearchTab,
      offset: number,
      signal: AbortSignal,
    ): Promise<{ users: SearchUser[]; documents: HomePost[]; hasMore: boolean }> => {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}${authorParam ? `&author=${encodeURIComponent(authorParam)}` : ""}`,
        { cache: "no-store", signal },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Failed to search");
      return {
        users: Array.isArray(body?.users) ? body.users : [],
        documents: Array.isArray(body?.documents) ? body.documents : [],
        hasMore: Boolean(body?.hasMore),
      };
    },
    [authorParam],
  );

  useEffect(() => {
    const normalizedQuery = deferredQuery.trim();

    if (!normalizedQuery) {
      setUsers([]);
      setDocuments([]);
      setHasMore(false);
      setError("");
      setIsLoading(false);
      offsetRef.current = { users: 0, documents: 0 };
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setError("");
        offsetRef.current = { users: 0, documents: 0 };

        const result = await fetchResults(normalizedQuery, activeTab, 0, controller.signal);

        if (!controller.signal.aborted) {
          setUsers(result.users);
          setDocuments(result.documents);
          setHasMore(result.hasMore);
          offsetRef.current = {
            users: result.users.length,
            documents: result.documents.length,
          };
        }
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setUsers([]);
          setDocuments([]);
          setHasMore(false);
          setError("Failed to search");
          console.error("Error during search:", searchError);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, fetchResults]);

  useEffect(() => {
    const normalizedQuery = deferredQuery.trim();
    if (!normalizedQuery) return;

    const controller = new AbortController();

    void (async () => {
      try {
        setIsLoading(true);
        setError("");
        offsetRef.current = { users: 0, documents: 0 };

        const result = await fetchResults(normalizedQuery, activeTab, 0, controller.signal);

        if (!controller.signal.aborted) {
          setUsers(result.users);
          setDocuments(result.documents);
          setHasMore(result.hasMore);
          offsetRef.current = {
            users: result.users.length,
            documents: result.documents.length,
          };
        }
      } catch {
        if (!controller.signal.aborted) setError("Failed to search");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadMore = useCallback(async () => {
    const normalizedQuery = deferredQuery.trim();
    if (!normalizedQuery || isFetchingMore || !hasMore) return;

    const offset =
      activeTab === "users"
        ? offsetRef.current.users
        : offsetRef.current.documents;

    setIsFetchingMore(true);
    try {
      const controller = new AbortController();
      const result = await fetchResults(normalizedQuery, activeTab, offset, controller.signal);

      setUsers((prev) =>
        activeTab === "users" ? [...prev, ...result.users] : prev,
      );
      setDocuments((prev) =>
        activeTab === "documents" ? [...prev, ...result.documents] : prev,
      );
      setHasMore(result.hasMore);
      offsetRef.current = {
        users: activeTab === "users"
          ? offsetRef.current.users + result.users.length
          : offsetRef.current.users,
        documents: activeTab === "documents"
          ? offsetRef.current.documents + result.documents.length
          : offsetRef.current.documents,
      };
    } catch {
      // silently fail — user can scroll again to retry
    } finally {
      setIsFetchingMore(false);
    }
  }, [activeTab, deferredQuery, fetchResults, hasMore, isFetchingMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const visibleResults = activeTab === "users" ? users : documents;
  const hasQuery = query.trim().length > 0;

  const handlePostUpdated = (updatedPost: HomePost) => {
    const updatedAuthorUsername =
      updatedPost.author?.username?.trim().toLowerCase() || "";

    setDocuments((current) =>
      current.map((post) =>
        post.id === updatedPost.id
          ? { ...post, ...updatedPost }
          : updatedAuthorUsername &&
              post.author?.username?.trim().toLowerCase() ===
                updatedAuthorUsername
            ? {
                ...post,
                isAuthorFollowedByCurrentUser:
                  updatedPost.isAuthorFollowedByCurrentUser,
                isAuthorMutedByCurrentUser:
                  updatedPost.isAuthorMutedByCurrentUser,
                isAuthorBlockedByCurrentUser:
                  updatedPost.isAuthorBlockedByCurrentUser,
              }
            : post,
      ),
    );
    setActiveOptionsPost((current) =>
      current?.id === updatedPost.id ? { ...current, ...updatedPost } : current,
    );
  };

  const handlePostDeleted = (deletedPostId: string) => {
    setDocuments((current) =>
      current.filter((post) => post.id !== deletedPostId),
    );
    setActiveOptionsPost((current) =>
      current?.id === deletedPostId ? null : current,
    );
  };

  const runSearch = () => {
    const nextParams = new URLSearchParams(searchParamsString);
    if (query.trim()) nextParams.set("q", query.trim());
    else nextParams.delete("q");
    nextParams.set("tab", activeTab);
    const qs = nextParams.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  };

  // Desktop search controls live in the right sidebar (no fixed header on lg+).
  const desktopSearchSlot = (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#f0dfc8] bg-[#fffaf4]/90 px-4 py-3 shadow-sm">
        <label className="flex items-center justify-between gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find users and documents..."
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <button type="button" onClick={runSearch} aria-label="Search">
            <SearchNormal1 size={18} color="#c56f1b" />
          </button>
        </label>
      </div>
      {query.trim().length > 0 && (
        <div className="relative grid grid-cols-2 gap-2 border-b border-edge">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 h-0.75 w-[calc(50%-0.25rem)] rounded-full bg-ink transition-transform duration-300 ease-out ${
              activeTab === "documents"
                ? "translate-x-0"
                : "translate-x-[calc(100%+0.5rem)]"
            }`}
          />
          {(["documents", "users"] as SearchTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative px-2 py-2.5 text-sm font-medium capitalize transition-colors duration-300 ${
                activeTab === tab ? "text-ink" : "text-ink-2"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-page pb-16 pt-34 lg:pt-4">
      {error && <Alert type="error" message={error} />}
      <OptionsDrawer
        isOpen={isPostOptionsDrawerOpen}
        onClose={() => {
          setIsPostOptionsDrawerOpen(false);
          setActiveOptionsPost(null);
          setActiveOptionsAnchor(null);
        }}
        post={activeOptionsPost}
        anchor={activeOptionsAnchor}
        onPostUpdated={handlePostUpdated}
        onPostDeleted={handlePostDeleted}
      />
      <Header
        query={query}
        onQueryChange={setQuery}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLoading={false}
        search={runSearch}
      />

      <div className="lg:mx-auto lg:max-w-255 lg:grid lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-6 lg:px-4 lg:items-start">
        <main className="mx-auto w-full max-w-140 2xl:max-w-120 lg:max-w-none lg:mx-0 lg:pt-4 lg:pb-8">
        {visibleResults.length === 0 && hasQuery && isLoading ? (
          activeTab === "documents" ? (
            <SearchSkeleton />
          ) : null
        ) : visibleResults.length === 0 && hasQuery && !isLoading ? (
          <section>
            <p className="px-4 text-sm leading-6 text-ink-2">
              Nothing matched &quot;{query.trim()}&quot;. Try a broader keyword
              or switch tabs.
            </p>
          </section>
        ) : activeTab === "users" ? (
          <section className="space-y-3 pt-3">
            {users.map((searchUser) => (
              <UserCard
                key={searchUser.id}
                user={searchUser}
                onClick={(selectedUser) =>
                  router.push(
                    `/user/${encodeURIComponent(selectedUser.username)}`,
                  )
                }
              />
            ))}
          </section>
        ) : (
          <section>
            {documents.map((document) => (
              <div key={document.id} className="px-3">
                <Post
                  post={document}
                  onOptionsClick={(selectedDocument, anchor) => {
                    setActiveOptionsPost(selectedDocument);
                    setActiveOptionsAnchor(anchor);
                    setIsPostOptionsDrawerOpen(true);
                  }}
                  onFileClick={(selectedDocument) =>
                    router.push(
                      `/post/${encodeURIComponent(selectedDocument.id)}`,
                    )
                  }
                  onCommentClick={(selectedDocument) =>
                    router.push(
                      `/post/${encodeURIComponent(selectedDocument.id)}`,
                    )
                  }
                />
              </div>
            ))}
          </section>
        )}

          {/* Infinite scroll sentinel */}
          {hasQuery && hasMore && !isLoading && (
            <div ref={sentinelRef} className="h-16" />
          )}
        </main>
        <RightSidebar searchSlot={desktopSearchSlot} />
      </div>
    </div>
  );
}
