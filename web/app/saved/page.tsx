"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import SavedFileCard from "@/app/components/saved/SavedFileCard";
import { FolderOpen, Folder2, DocumentText } from "iconsax-reactjs";
import emptyWorkspace from "@/assets/icons/empty-workspace.svg";
import DocumentViewer from "@/app/components/home/DocumentViewer";
import type { HomePost } from "@/app/components/home/Post";
import type {
  SavedFolder,
  SavedPostRecord,
} from "@/app/components/saved/SavedFileCard";
import LoadingBar from "../components/LoadingBar";
import Alert from "../components/Alert";
import { useSystemPopup } from "../components/SystemPopup";

type SavedData = {
  id: string;
  name: string;
  folders: SavedFolder[];
  savedPosts: SavedPostRecord[];
};

export default function SavedPage() {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const popup = useSystemPopup();
  const [removingSavedPostIds, setRemovingSavedPostIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    const loadSaved = async () => {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch("/api/archive", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to fetch saved files");
        }

        setSaved(body?.archive ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError("Failed to fetch saved files");
          console.error("Error fetching saved files:", loadError);
          setSaved(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadSaved();
    return () => controller.abort();
  }, []);

  const rootSavedPosts = useMemo(
    () => saved?.savedPosts?.filter((item) => !item.folderId) ?? [],
    [saved],
  );

  const totalFileCount = rootSavedPosts.length;
  const totalFolderCount = saved?.folders.length ?? 0;

  const foldersWithSavedPosts = useMemo(
    () =>
      (saved?.folders ?? []).map((folder) => ({
        ...folder,
        savedPosts:
          saved?.savedPosts?.filter((item) => item.folderId === folder.id) ??
          [],
      })),
    [saved],
  );

  const handleRemoveSavedFile = async (savedPost: SavedPostRecord) => {
    if (removingSavedPostIds[savedPost.id]) {
      return;
    }

    const confirmed = await popup.confirm({
      title: "Remove Saved File?",
      message: "This file will be removed from your saved list.",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      isDestructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      setRemovingSavedPostIds((current) => ({
        ...current,
        [savedPost.id]: true,
      }));
      setError("");

      const response = await fetch("/api/archive", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          savedPostId: savedPost.id,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to remove saved file");
      }

      setSaved((currentSaved) => {
        if (!currentSaved) {
          return currentSaved;
        }

        return {
          ...currentSaved,
          savedPosts: currentSaved.savedPosts.filter(
            (item) => item.id !== savedPost.id,
          ),
        };
      });
    } catch (removeError) {
      setError("Failed to remove saved file");
      console.error("Error removing saved file:", removeError);
    } finally {
      setRemovingSavedPostIds((current) => ({
        ...current,
        [savedPost.id]: false,
      }));
    }
  };

  return (
    <div className="min-h-dvh bg-surface pb-32 pt-20">
      <DocumentViewer
        isOpen={Boolean(activePdfPost)}
        post={activePdfPost}
        onClose={() => setActivePdfPost(null)}
      />

      {error && <Alert type="error" message={error} />}

      <div className="fixed top-0 left-0 right-0 z-40 ">
        <header className="bg-page px-6 pt-6 pb-3">
          <h1 className="text-center text-LG font-medium">My Saved</h1>
        </header>
        {isLoading && <LoadingBar />}
      </div>

      {!isLoading && (
        <main className="mx-auto max-w-2xl space-y-6 px-4 sm:px-6">
          {!saved || (!saved.folders.length && !saved.savedPosts.length) ? (
            <div className="flex flex-col items-center justify-center gap-4 px-12 py-16 text-center lg:rounded-3xl lg:border lg:border-edge lg:bg-surface lg:shadow-sm">
              <Image
                src={emptyWorkspace}
                alt="Empty saved files"
                width={80}
                height={80}
              />
              <p className="text-sm text-ink-2">
                You haven&apos;t saved any files yet. Save attachments from the
                feed and they&apos;ll appear here.
              </p>
            </div>
          ) : (
            <>
              {foldersWithSavedPosts.length > 0 && (
                <section className="space-y-3 lg:rounded-3xl lg:border lg:border-edge lg:bg-surface lg:p-5 lg:shadow-sm">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={20} color="var(--ink)" />
                      <h2 className="text-base font-medium text-ink">
                        Folders
                      </h2>
                    </div>
                    <span className="text-sm text-ink-2">
                      {totalFolderCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-y-5">
                    {foldersWithSavedPosts.map((folder) => (
                      <button
                        type="button"
                        key={folder.id}
                        className="flex flex-col items-center gap-2 text-center transition-opacity hover:opacity-70 active:opacity-40"
                        onClick={() =>
                          router.push(
                            `/saved/folder/${encodeURIComponent(folder.id)}`,
                          )
                        }
                      >
                        <Folder2 size={48} color="var(--ink-3)" variant="Bold" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink">
                            {folder.name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {rootSavedPosts.length > 0 && (
                <section className="space-y-3 lg:rounded-3xl lg:border lg:border-edge lg:bg-surface lg:p-5 lg:shadow-sm">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <DocumentText size={20} color="var(--ink)" />
                      <h2 className="text-base font-medium text-ink">
                        Files
                      </h2>
                    </div>
                    <span className="text-sm text-ink-2">
                      {totalFileCount}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {rootSavedPosts.map((savedPost) => (
                      <SavedFileCard
                        key={savedPost.id}
                        savedPost={savedPost}
                        onOpenFile={(selectedPost) =>
                          setActivePdfPost(selectedPost)
                        }
                        onOpenPost={(postId) =>
                          router.push(`/post/${encodeURIComponent(postId)}`)
                        }
                        onUseInHub={(selectedSavedPost) =>
                          router.push(
                            `/hub?postId=${encodeURIComponent(selectedSavedPost.postId)}`,
                          )
                        }
                        onRemove={(selectedSavedPost) =>
                          void handleRemoveSavedFile(selectedSavedPost)
                        }
                        isRemoving={Boolean(removingSavedPostIds[savedPost.id])}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}
