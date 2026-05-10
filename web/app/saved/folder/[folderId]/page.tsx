"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SavedFileCard from "@/app/components/saved/SavedFileCard";
import { ArrowLeft, DocumentText, Trash } from "iconsax-reactjs";
import DocumentViewer from "@/app/components/home/DocumentViewer";
import type { HomePost } from "@/app/components/home/Post";
import type {
  SavedFolder,
  SavedPostRecord,
} from "@/app/components/saved/SavedFileCard";
import LoadingBar from "@/app/components/LoadingBar";
import Alert from "@/app/components/Alert";
import { useSystemPopup } from "@/app/components/SystemPopup";

type SavedData = {
  id: string;
  name: string;
  folders: SavedFolder[];
  savedPosts: SavedPostRecord[];
};

export default function SavedFolderPage() {
  const router = useRouter();
  const params = useParams<{ folderId: string }>();
  const folderId = typeof params?.folderId === "string" ? params.folderId : "";

  const [saved, setSaved] = useState<SavedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const popup = useSystemPopup();
  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removingSavedPostIds, setRemovingSavedPostIds] = useState<
    Record<string, boolean>
  >({});
  const titleInputRef = useRef<HTMLInputElement | null>(null);

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

  const folder = useMemo(
    () => saved?.folders.find((item) => item.id === folderId) ?? null,
    [saved, folderId],
  );

  useEffect(() => {
    if (!folder) {
      return;
    }

    setFolderNameDraft(folder.name);
  }, [folder]);

  useEffect(() => {
    if (!isEditingTitle) {
      return;
    }

    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  const folderSavedPosts = useMemo(
    () => saved?.savedPosts.filter((item) => item.folderId === folderId) ?? [],
    [saved, folderId],
  );

  const submitFolderRename = async () => {
    if (!folder || isRenaming) {
      return;
    }

    const trimmedName = folderNameDraft.trim();
    if (!trimmedName) {
      setFolderNameDraft(folder.name);
      setIsEditingTitle(false);
      setError("Folder name is required");
      return;
    }

    if (trimmedName === folder.name) {
      setIsEditingTitle(false);
      return;
    }

    try {
      setIsRenaming(true);
      setError("");

      const response = await fetch("/api/archive/folders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folderId: folder.id,
          name: trimmedName,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to rename saved folder");
      }

      setSaved((currentSaved) => {
        if (!currentSaved) {
          return currentSaved;
        }

        return {
          ...currentSaved,
          folders: currentSaved.folders.map((item) =>
            item.id === folder.id ? { ...item, name: trimmedName } : item,
          ),
        };
      });
      setFolderNameDraft(trimmedName);
      setIsEditingTitle(false);
    } catch (renameError) {
      setError("Failed to rename saved folder");
      console.error("Error renaming saved folder:", renameError);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!folder || isDeleting) {
      return;
    }

    if (folderSavedPosts.length > 0) {
      const confirmed = await popup.confirm({
        title: "Delete Folder?",
        message: "Deleting this folder will remove all files from it.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        isDestructive: true,
      });

      if (!confirmed) {
        return;
      }
    }

    try {
      setIsDeleting(true);
      setError("");

      const response = await fetch("/api/archive/folders", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folderId: folder.id,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to delete saved folder");
      }

      router.push("/saved");
    } catch (deleteError) {
      setError("Failed to delete saved folder");
      console.error("Error deleting saved folder:", deleteError);
    } finally {
      setIsDeleting(false);
    }
  };

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
    <div className="min-h-screen bg-surface pb-32 pt-22">
      <DocumentViewer
        isOpen={Boolean(activePdfPost)}
        post={activePdfPost}
        onClose={() => setActivePdfPost(null)}
      />

      {error && <Alert type="error" message={error} />}

      <div className="fixed top-0 left-0 right-0 z-40">
        <header className="bg-page px-6 pt-6 pb-3">
          <div className="relative flex items-center justify-center min-h-10">
            <button
              type="button"
              aria-label="Back to saved files"
              onClick={() => router.push("/saved")}
              className="absolute left-0 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60 active:opacity-40"
            >
              <ArrowLeft size={22} color="var(--ink)" />
            </button>
            <div className="flex w-full justify-center px-12">
              {folder && isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={folderNameDraft}
                  onChange={(event) => setFolderNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitFolderRename();
                    }

                    if (event.key === "Escape") {
                      setFolderNameDraft(folder.name);
                      setIsEditingTitle(false);
                      setError("");
                    }
                  }}
                  disabled={isRenaming}
                  maxLength={30}
                  aria-label="Rename saved folder"
                  className="w-full max-w-55 bg-transparent text-center text-xl font-medium outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!folder) {
                      return;
                    }

                    setError("");
                    setFolderNameDraft(folder.name);
                    setIsEditingTitle(true);
                  }}
                  className="max-w-55 truncate text-center text-lg font-medium"
                >
                  {folder?.name || "Saved Folder"}
                </button>
              )}
            </div>
            <button
              aria-label="Delete folder"
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60 active:opacity-40 disabled:opacity-30"
              onClick={() => void handleDeleteFolder()}
              disabled={isDeleting}
            >
              <Trash size={22} color="var(--ink)" />
            </button>
          </div>
        </header>
        {isLoading && <LoadingBar />}
      </div>

      {!isLoading && (
        <main className="mx-auto max-w-2xl space-y-6 px-4 sm:px-6">
          {!folder ? (
            <div className="rounded-[28px] bg-surface px-5 py-6 shadow-sm lg:rounded-3xl lg:border lg:border-edge">
              <p className="text-base font-medium text-ink">
                Folder not found.
              </p>
              <p className="mt-2 text-sm text-ink-2">
                This saved folder may have been removed.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-6 lg:rounded-3xl lg:border lg:border-edge lg:bg-surface lg:p-5 lg:shadow-sm">
              <section className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <DocumentText size={20} color="var(--ink)" />
                  <h2 className="text-base font-medium text-ink">
                    Files
                  </h2>
                </div>
                <span className="text-sm text-ink-2">
                  {folderSavedPosts.length}
                </span>
              </section>

              <section className="space-y-3">
                {folderSavedPosts.length === 0 ? (
                  <p className="text-sm text-ink-2">
                    No files saved in this folder yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {folderSavedPosts.map((savedPost) => (
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
                )}
              </section>
              </div>
            </>
          )}
        </main>
      )}
    </div>
  );
}
