import React from "react";
import Image from "next/image";
import type { HomePost } from "@/app/components/home/Post";
import { ArrowRight, CloseCircle } from "iconsax-reactjs";
import PdfThumbnail from "../home/PdfThumbnail";

export type SavedFolder = {
  id: string;
  archiveId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveSavedPost = {
  id: string;
  archiveId: string;
  folderId?: string | null;
  postId: string;
  createdAt: string;
  post: HomePost;
  folder?: SavedFolder | null;
};

export type SavedPostRecord = ArchiveSavedPost;

export default function SavedFileCard({
  savedPost,
  onOpenFile,
  onOpenPost,
  onUseInHub,
  onRemove,
  isRemoving = false,
}: {
  savedPost: SavedPostRecord;
  onOpenFile: (post: HomePost) => void;
  onOpenPost: (postId: string) => void;
  onUseInHub?: (savedPost: SavedPostRecord) => void;
  onRemove: (savedPost: SavedPostRecord) => void;
  isRemoving?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-edge-mid bg-surface p-3">
      <div className="flex gap-2">
        <button
          aria-label="Saved document"
          type="button"
          className="text-left transition-opacity hover:opacity-80 active:opacity-50"
          onClick={() => onOpenFile(savedPost.post)}
        >
          {savedPost.post.thumbnailUrl ? (
            <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-sm bg-[#E8E8E8]">
              <Image
                key={savedPost.post.thumbnailUrl}
                src={savedPost.post.thumbnailUrl}
                alt={`${savedPost.post.title} preview`}
                className="block h-full w-full object-cover object-top"
                width={112}
                height={160}
                unoptimized
              />
            </div>
          ) : (
            <PdfThumbnail
              postId={savedPost.post.id}
              fileUrl={savedPost.post.fileUrl}
              thumbnailUrl={savedPost.post.thumbnailUrl}
              title={savedPost.post.title}
              fileType={savedPost.post.fileType}
            />
          )}
        </button>
        <div className="w-full flex flex-col justify-between">
          <div className="flex items-start justify-between gap-0.5">
            <div>
              <p className="line-clamp-2 text-sm font-medium text-ink">
                {savedPost.post.title}
              </p>
              <p className="mt-1 text-xs text-ink-2">
                {savedPost.post.categories.join(", ")}
                {savedPost.post.year && ` • ${savedPost.post.year}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="remove saved file"
              onClick={() => onRemove(savedPost)}
              disabled={isRemoving}
              className={`transition-opacity hover:opacity-70 active:opacity-40 ${isRemoving && "opacity-50"}`}
            >
              <CloseCircle size={24} color="var(--ink-3)" />
            </button>
          </div>
          <div className="w-full space-y-1">
            <div className="flex justify-end">
              <span className="text-xs text-ink-3">Attachment saved</span>
            </div>
            <div className="flex items-center justify-end gap-3">
              {onUseInHub ? (
                <button
                  type="button"
                  className="text-sm font-medium text-ink-2 transition-opacity hover:opacity-70 active:opacity-50"
                  onClick={() => onUseInHub(savedPost)}
                >
                  Use in Hub
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink transition-opacity hover:opacity-70 active:opacity-50"
                onClick={() => onOpenPost(savedPost.postId)}
              >
                View full post
                <ArrowRight size={16} color="var(--ink)" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
