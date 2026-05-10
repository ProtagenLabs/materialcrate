"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "iconsax-reactjs";
import CommentDrawer from "@/app/components/home/CommentDrawer";
import Post, { type HomePost } from "@/app/components/home/Post";
import DocumentViewer from "@/app/components/home/DocumentViewer";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [post, setPost] = useState<HomePost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(false);
  const requestedCommentId = searchParams.get("commentId")?.trim() || "";
  const shouldOpenComments =
    searchParams.get("openComments") === "1" || Boolean(requestedCommentId);

  useEffect(() => {
    const postId = params?.id?.trim();
    if (!postId) {
      setError("Post not found.");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadPost = async () => {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch(
          `/api/posts/${encodeURIComponent(postId)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body?.error || "Failed to load post");
        }

        setPost(body?.post ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError("Failed to load post");
          setPost(null);
          console.error("Failed to load post: ", loadError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadPost();

    return () => controller.abort();
  }, [params?.id]);

  useEffect(() => {
    if (post && shouldOpenComments) {
      setIsCommentDrawerOpen(true);
    }
  }, [post, shouldOpenComments]);

  return (
    <div className="min-h-screen bg-page py-18">
      <CommentDrawer
        isOpen={isCommentDrawerOpen}
        onClose={() => {
          setIsCommentDrawerOpen(false);
          if (params?.id && shouldOpenComments) {
            router.replace(`/post/${encodeURIComponent(params.id)}`);
          }
        }}
        postId={post?.id ?? null}
        post={post}
      />
      <DocumentViewer
        isOpen={Boolean(activePdfPost)}
        post={activePdfPost}
        onClose={() => setActivePdfPost(null)}
      />

      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-edge bg-page px-6 pt-6 pb-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="transition-opacity hover:opacity-60 active:opacity-40"
        >
          <ArrowLeft size={24} color="var(--ink)" />
        </button>
        <h1 className="text-lg font-medium text-ink">Post</h1>
      </header>

      <main className="mx-auto max-w-2xl px-3">
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-2">Loading post...</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-[#8A3A25]">{error}</p>
        ) : post ? (
          <Post
            post={post}
            onCommentClick={() => setIsCommentDrawerOpen(true)}
            onFileClick={(selectedPost) => setActivePdfPost(selectedPost)}
          />
        ) : (
          <p className="px-6 py-8 text-sm text-ink-2">Post not found.</p>
        )}
      </main>
    </div>
  );
}
