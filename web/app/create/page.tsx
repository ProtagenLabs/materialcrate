"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown2,
  CloseCircle,
  DocumentUpload,
  Trash,
  DocumentText,
} from "iconsax-reactjs";
import { createPdfThumbnailBase64 } from "@/app/lib/pdf-thumbnail";

const ACCEPTED_FILE_TYPES =
  ".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,application/msword";

function isWordFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword"
  );
}
import {
  POST_CATEGORIES,
  normalizeAllowedCategory,
} from "@/app/lib/post-categories";
import { useAuth } from "@/app/lib/auth-client";
import ActionButton from "@/app/components/ActionButton";
import Alert from "@/app/components/Alert";
import MentionInput from "@/app/components/MentionInput";
import Header from "@/app/components/Header";

const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024;

type EditPost = {
  id: string;
  title: string;
  categories: string[];
  year?: number | null;
  description?: string | null;
};

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");
  const isEditMode = Boolean(postId);

  const { user, isLoading: isLoadingAuth } = useAuth();
  const [editPost, setEditPost] = useState<EditPost | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState(isEditMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [categoryQuery, setCategoryQuery] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] =
    useState<boolean>(false);
  const [year, setYear] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const [alertMessage, setAlertMessage] = useState<string>("");
  const [alertType, setAlertType] = useState<"success" | "error" | "info">(
    "error",
  );
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [thumbnailBase64, setThumbnailBase64] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] =
    useState<boolean>(false);
  const thumbnailRequestIdRef = useRef(0);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 60 }, (_, index) =>
    String(currentYear - index),
  );

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!user) {
      router.push("/login");
    }
  }, [isLoadingAuth, router, user]);

  useEffect(() => {
    if (!postId) return;

    const controller = new AbortController();

    async function fetchPost() {
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to load post");
        const body = await response.json().catch(() => ({}));
        const post: EditPost = body?.post ?? body;
        setEditPost(post);
        setTitle(post.title ?? "");
        setSelectedCategories(
          Array.isArray(post.categories) ? post.categories : [],
        );
        setYear(post.year ? String(post.year) : "");
        setDescription(post.description ?? "");
      } catch {
        if (!controller.signal.aborted) {
          setAlertType("error");
          setAlertMessage("Failed to load post for editing.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPost(false);
        }
      }
    }

    void fetchPost();
    return () => controller.abort();
  }, [postId]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_UPLOAD_FILE_BYTES) {
      thumbnailRequestIdRef.current += 1;
      setAlertType("error");
      setAlertMessage("File size exceeds 20MB limit.");
      setSelectedFile(null);
      setThumbnailBase64(null);
      setIsGeneratingThumbnail(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setAlertMessage("");
    setSelectedFile(file);
    setThumbnailBase64(null);
    event.target.value = "";

    if (!file) {
      thumbnailRequestIdRef.current += 1;
      setIsGeneratingThumbnail(false);
      return;
    }

    // Word documents don't support client-side thumbnail generation.
    if (isWordFile(file)) return;

    const requestId = thumbnailRequestIdRef.current + 1;
    thumbnailRequestIdRef.current = requestId;
    setIsGeneratingThumbnail(true);

    void (async () => {
      try {
        const nextThumbnailBase64 = await createPdfThumbnailBase64(file);
        if (thumbnailRequestIdRef.current !== requestId) return;
        setThumbnailBase64(nextThumbnailBase64);
      } catch {
        if (thumbnailRequestIdRef.current !== requestId) return;
        setThumbnailBase64(null);
      } finally {
        if (thumbnailRequestIdRef.current === requestId) {
          setIsGeneratingThumbnail(false);
        }
      }
    })();
  }

  const disabled =
    title.length < 3 ||
    selectedCategories.length === 0 ||
    isPublishing ||
    isLoadingPost ||
    (!isEditMode && !selectedFile);

  const filteredCategoryOptions = POST_CATEGORIES.filter((categoryOption) => {
    if (selectedCategories.includes(categoryOption)) return false;
    const trimmedQuery = categoryQuery.trim().toLowerCase();
    if (!trimmedQuery) return true;
    return categoryOption.toLowerCase().includes(trimmedQuery);
  }).slice(0, 12);

  async function handlePublish() {
    if (disabled) return;

    setIsPublishing(true);
    setAlertMessage("");

    try {
      let response: Response;

      if (isEditMode && postId) {
        response = await fetch("/api/posts/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId,
            title: title.trim(),
            categories: selectedCategories,
            description: description.trim(),
            year: year || null,
          }),
        });
      } else {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (thumbnailBase64) {
          formData.append("thumbnailBase64", thumbnailBase64);
        }
        formData.append("title", title.trim());
        for (const cat of selectedCategories) {
          formData.append("categories", cat);
        }
        formData.append("description", description.trim());
        if (year) {
          formData.append("year", year);
        }
        response = await fetch("/api/posts/create", {
          method: "POST",
          body: formData,
        });
      }

      if (!response.ok) {
        throw new Error(
          isEditMode ? "Failed to update document" : "Failed to upload document",
        );
      }

      router.back();
    } catch (error: unknown) {
      setAlertType("error");
      setAlertMessage(
        isEditMode ? "Failed to update document" : "Failed to upload document",
      );
      console.error("Error details:", error);
      setIsPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface lg:bg-page">
      <Header
        title={isEditMode ? "Edit Material" : "Share a New Material"}
        isLoading={isPublishing || isLoadingPost}
      />
      <div className="mx-auto w-full max-w-140 2xl:max-w-120 pt-20 lg:pb-10 px-0 lg:px-6">
        <div className="px-6 pb-10 pt-6 space-y-3 lg:bg-surface lg:rounded-3xl lg:border lg:border-edge lg:shadow-sm lg:px-8 lg:py-8">
          {alertMessage && (
            <Alert
              key={`${alertType}-${alertMessage}`}
              message={alertMessage}
              type={alertType}
            />
          )}
          <div className="space-y-1">
            <p className="text-ink-2 text-sm">
              {isEditMode ? "Document" : "Select document to share"}
              {!isEditMode && <span className="text-red-500">*</span>}
            </p>
            {isEditMode ? (
              <div className="w-full rounded-xl border border-[#E4E4E4] bg-page px-4 py-4">
                <div className="flex items-center gap-3">
                  <DocumentText size={30} color="#E1761F" variant="Bold" />
                  <p className="text-xs font-medium text-ink">
                    {editPost?.title || "Current document"}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  id="material-upload"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={handleFileChange}
                  required
                />
                <label
                  htmlFor="material-upload"
                  className="w-full py-6 px-3 border border-[#B0B0B0] border-dashed rounded-xl flex flex-col items-center justify-center gap-5 cursor-pointer"
                >
                  {!selectedFile ? (
                    <>
                      <DocumentUpload size={40} color="#B0B0B0" />
                      <div>
                        <p className="text-xs font-medium text-ink-2">
                          Drag and drop or{" "}
                          <span className="underline text-ink-2 text-center">
                            click to upload
                          </span>
                        </p>
                        <p className="text-[10px] text-ink-2 font-medium text-center">
                          Max file size: 20MB (PDF, DOCX, DOC)
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center gap-2 w-full">
                      <div className="flex gap-2 items-center">
                        <DocumentText size={38} color="#E1761F" variant="Bold" />
                        <div className="flex flex-col justify-between">
                          <p className="text-xs text-ink font-medium truncate max-w-56">
                            {selectedFile.name}
                          </p>
                          <p className="text-ink-3 text-xs font-medium">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)}MB
                          </p>
                          {isGeneratingThumbnail && (
                            <p className="text-ink-3 text-[10px] font-medium">
                              Generating preview… you can still publish now.
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          thumbnailRequestIdRef.current += 1;
                          setSelectedFile(null);
                          setThumbnailBase64(null);
                          setIsGeneratingThumbnail(false);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <Trash size={22} color="#E00505" />
                      </button>
                    </div>
                  )}
                </label>
              </>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-ink-2 text-sm">
              Document title<span className="text-red-500">*</span>
            </p>
            <input
              placeholder="E.g. 'Stanford CS 101 Notes' (at least 3 characters)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={50}
              style={{ fontSize: "0.75rem" }}
              className="w-full rounded-lg px-3 py-3 bg-surface-high/50 shadow text-xs placeholder:text-ink-3 placeholder:text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <p className="text-ink-2 text-sm">
              Categories<span className="text-red-500">*</span>
              <span className="text-ink-3 text-xs ml-1">
                ({selectedCategories.length}/3)
              </span>
            </p>
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E7] px-3 py-1 text-xs font-medium text-[#E1761F]"
                  >
                    {cat}
                    <button
                      type="button"
                      aria-label={`Remove ${cat}`}
                      className="ml-0.5"
                      onClick={() =>
                        setSelectedCategories((prev) =>
                          prev.filter((c) => c !== cat),
                        )
                      }
                    >
                      <CloseCircle size={14} color="#E1761F" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {selectedCategories.length < 3 && (
              <div className="relative">
                <input
                  ref={categoryInputRef}
                  placeholder={
                    selectedCategories.length === 0
                      ? "Type to search categories"
                      : "Add another category"
                  }
                  value={categoryQuery}
                  onFocus={() => setIsCategoryDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setIsCategoryDropdownOpen(false);
                    }, 100);
                  }}
                  onChange={(e) => {
                    setCategoryQuery(e.target.value);
                    setIsCategoryDropdownOpen(true);
                  }}
                  maxLength={80}
                  autoComplete="off"
                  style={{ fontSize: "0.75rem" }}
                  className="w-full rounded-lg px-3 py-3 bg-surface-high/50 shadow text-xs placeholder:text-ink-3 placeholder:text-xs focus:outline-none"
                />
                {isCategoryDropdownOpen &&
                  filteredCategoryOptions.length > 0 && (
                    <div className="absolute z-20 mt-2 max-h-52 w-full overflow-y-auto rounded-lg border border-[#E4E4E4] bg-surface shadow-md">
                      {filteredCategoryOptions.map((categoryOption) => (
                        <button
                          key={categoryOption}
                          type="button"
                          className="w-full border-b border-[#F3F3F3] px-3 py-2 text-left text-xs text-ink last:border-b-0 hover:bg-page"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setSelectedCategories((prev) => [
                              ...prev,
                              categoryOption,
                            ]);
                            setCategoryQuery("");
                            setIsCategoryDropdownOpen(false);
                            categoryInputRef.current?.blur();
                          }}
                        >
                          {categoryOption}
                        </button>
                      ))}
                    </div>
                  )}
                {categoryQuery && !normalizeAllowedCategory(categoryQuery) && (
                  <p className="text-[10px] text-[#E00505] font-medium mt-1">
                    Please select a category from the suggestion list.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-ink-2 text-sm">Year</p>
            <div className="relative">
              <select
                title="Year picker"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ fontSize: "0.75rem" }}
                className={`w-full appearance-none rounded-lg px-3 py-3 pr-10 bg-surface-high/50 shadow focus:outline-none ${
                  year ? "text-black" : "text-ink-3"
                }`}
              >
                <option
                  value=""
                  className="text-ink-3"
                  style={{ fontSize: "0.75rem" }}
                >
                  Select year
                </option>
                {yearOptions.map((optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <ArrowDown2 size={16} color="#737373" />
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-ink-2 text-sm">Document description</p>
            <MentionInput
              multiline
              rows={4}
              placeholder="E.g. 'Notes for the first lecture'"
              value={description}
              onChange={(val) => setDescription(val)}
              maxLength={500}
              className="w-full rounded-lg px-3 pt-3 h-28 bg-surface-high/50 shadow text-xs placeholder:text-ink-3 placeholder:text-xs resize-none focus:outline-none"
            />
          </div>
          <ActionButton
            type="button"
            className="w-full"
            onClick={handlePublish}
            disabled={disabled}
          >
            {isPublishing
              ? isEditMode
                ? "Saving..."
                : "Publishing..."
              : isEditMode
                ? "Save changes"
                : "Publish"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
