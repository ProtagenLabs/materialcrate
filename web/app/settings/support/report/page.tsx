"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, CloseCircle, DocumentText } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ActionButton from "@/app/components/ActionButton";

function getDeviceInfo(): string {
  const parts: string[] = [];

  const { platform, maxTouchPoints } = navigator;
  parts.push(`Platform: ${platform}`);

  const width = window.screen.width;
  const height = window.screen.height;
  const dpr = window.devicePixelRatio ?? 1;
  parts.push(`Screen: ${width}x${height} @${dpr}x`);

  if (maxTouchPoints > 0) {
    parts.push(`Touch: ${maxTouchPoints} points`);
  }

  const lang = navigator.language;
  if (lang) parts.push(`Lang: ${lang}`);

  return parts.join("; ");
}

type ProblemCategory =
  | "bug"
  | "crash"
  | "performance"
  | "account"
  | "content"
  | "other";

const CATEGORIES: { value: ProblemCategory; label: string }[] = [
  { value: "bug", label: "Something isn't working" },
  { value: "crash", label: "App crashes or freezes" },
  { value: "performance", label: "Slow or unresponsive" },
  { value: "account", label: "Account issue" },
  { value: "content", label: "Content problem" },
  { value: "other", label: "Other" },
];

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AttachedImage = {
  file: File;
  previewUrl: string;
};

export default function Page() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestImagesRef = useRef<AttachedImage[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProblemCategory | "">("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    latestImagesRef.current = images;
  }, [images]);

  const isFormValid =
    title.trim().length >= 5 &&
    description.trim().length >= 20 &&
    category !== "";

  const handleOpenImagePicker = useCallback(() => {
    const input = fileInputRef.current;
    console.log("[SupportReport] Add button clicked", {
      hasInputRef: Boolean(input),
      disabled: images.length >= MAX_IMAGES || isSubmitting,
      attachedCount: images.length,
    });

    if (!input || input.disabled) {
      return;
    }

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch (err) {
      console.error("[SupportReport] showPicker() failed, falling back to click()", err);
    }

    input.click();
  }, [images.length, isSubmitting]);

  const handleImageAdd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      console.log("[SupportReport] onChange fired", {
        hasFiles: Boolean(files),
        fileCount: files?.length ?? 0,
      });

      if (!files || files.length === 0) return;

      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) {
        setError(`You can attach up to ${MAX_IMAGES} images.`);
        return;
      }

      const newImages: AttachedImage[] = [];

      for (let i = 0; i < Math.min(files.length, remaining); i++) {
        const file = files[i];

        if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
          setError("Only JPEG, PNG, and WebP images are supported.");
          return;
        }

        if (file.size > MAX_IMAGE_BYTES) {
          setError("Each image must be under 5 MB.");
          return;
        }

        newImages.push({
          file,
          previewUrl: URL.createObjectURL(file),
        });

        console.log("[SupportReport] Added image", {
          name: file.name,
          type: file.type,
          sizeBytes: file.size,
        });
      }

      setImages((prev) => {
        const next = [...prev, ...newImages];
        console.log("[SupportReport] Total attached images", {
          total: next.length,
          names: next.map((img) => img.file.name),
        });
        return next;
      });

      e.target.value = "";
      setError("");
    },
    [images.length],
  );

  const handleImageRemove = useCallback((index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const image of latestImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("category", category);
      formData.append("userAgent", navigator.userAgent);
      formData.append("deviceInfo", getDeviceInfo());

      for (const img of images) {
        formData.append("images", img.file);
      }

      const response = await fetch("/api/support/report", {
        method: "POST",
        body: formData,
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to submit report.");
      }

      for (const img of images) {
        URL.revokeObjectURL(img.previewUrl);
      }

      setTitle("");
      setDescription("");
      setCategory("");
      setImages([]);
      setSuccessMessage("Report submitted. We'll look into it shortly.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-[linear-gradient(180deg,#F7F7F7_0%,#F2EEE7_100%)]">
      <Header title="Report a Problem" isLoading={isSubmitting} />

      <form
        id="report-form"
        className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-20 sm:px-6"
        onSubmit={handleSubmit}
      >
        {successMessage && <Alert type="success" message={successMessage} />}
        {error && <Alert type="error" message={error} />}
        <div className="w-full rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Report
          </p>
          <h2 className="mt-1 text-lg font-semibold">Something not right?</h2>
          <p className="mt-1 text-xs text-white/72">
            Describe the issue and we&apos;ll work on a fix. Screenshots help us
            resolve problems faster.
          </p>
        </div>

        <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">Category</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            What best describes the issue?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  category === cat.value
                    ? "border-[#E1761F] bg-[#FFF4EA] text-[#B46B28]"
                    : "border-edge-mid bg-surface-high text-ink-2 hover:bg-[#F0ECE6]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">Details</h3>

          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-ink-2">Title</p>
            <input
              type="text"
              placeholder="Brief summary of the problem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_TITLE_LENGTH}
              className="w-full rounded-2xl border border-edge bg-surface-high px-3 py-3 text-sm placeholder:text-ink-3 focus:outline-none"
            />
            <p className="text-right text-[11px] text-[#AAAAAA]">
              {title.length}/{MAX_TITLE_LENGTH}
            </p>
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-ink-2">Description</p>
            <textarea
              placeholder="What happened? What did you expect? Steps to reproduce the issue…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={5}
              className="w-full resize-none rounded-2xl border border-edge bg-surface-high px-3 py-3 text-sm leading-relaxed placeholder:text-ink-3 focus:outline-none"
            />
            <p className="text-right text-[11px] text-[#AAAAAA]">
              {description.length}/{MAX_DESCRIPTION_LENGTH}
            </p>
          </div>
        </div>

        <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Screenshots
              </h3>
              <p className="mt-0.5 text-xs text-ink-3">
                Attach up to {MAX_IMAGES} images (optional)
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenImagePicker}
              disabled={images.length >= MAX_IMAGES || isSubmitting}
              className={`flex items-center gap-1.5 rounded-full border border-edge-mid bg-surface-high px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors ${
                images.length >= MAX_IMAGES || isSubmitting
                  ? "opacity-40"
                  : "hover:bg-[#F0ECE6]"
              }`}
            >
              <Camera size={14} color="#5B5B5B" variant="Bulk" />
              Add
            </button>
          </div>
          <input
            ref={fileInputRef}
            id="support-report-images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={handleImageAdd}
            aria-label="Attach screenshots"
            disabled={images.length >= MAX_IMAGES || isSubmitting}
          />

          {images.length > 0 && (
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {images.map((img, index) => (
                <div
                  key={img.previewUrl}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-edge"
                >
                  <Image
                    src={img.previewUrl}
                    alt={`Screenshot ${index + 1}`}
                    fill
                    unoptimized
                    sizes="96px"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove screenshot ${index + 1}`}
                    onClick={() => handleImageRemove(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/50"
                  >
                    <CloseCircle size={20} color="#FFFFFF" variant="Bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-[20px] bg-[#FFF4EA] px-4 py-3.5">
          <DocumentText
            size={18}
            color="#A95A13"
            variant="Bulk"
            className="mt-0.5 shrink-0"
          />
          <p className="text-xs leading-relaxed text-[#8B6234]">
            We may collect basic device and app info (OS, app version, screen
            size) to help diagnose the issue. No personal data beyond your
            account is shared.
          </p>
        </div>

        <ActionButton
          type="submit"
          form="report-form"
          label="Submit Report"
          disabled={!isFormValid || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Submitting…" : "Submit Report"}
        </ActionButton>
      </form>
    </div>
  );
}
