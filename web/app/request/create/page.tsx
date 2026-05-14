"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown2, CloseCircle, Coin1 } from "iconsax-reactjs";
import {
  POST_CATEGORIES,
  normalizeAllowedCategory,
} from "@/app/lib/post-categories";
import { useAuth } from "@/app/lib/auth-client";
import ActionButton from "@/app/components/ActionButton";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";

export default function CreateRequestPage() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [bounty, setBounty] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"success" | "error" | "info">(
    "error",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!user) router.push("/login");
  }, [isLoadingAuth, router, user]);

  const filteredCategories = POST_CATEGORIES.filter(
    (cat) =>
      !selectedCategories.includes(cat) &&
      cat.toLowerCase().includes(categoryQuery.toLowerCase()),
  ).slice(0, 8);

  const handleAddCategory = (cat: string) => {
    const normalized = normalizeAllowedCategory(cat);
    if (!normalized || selectedCategories.includes(normalized)) return;
    if (selectedCategories.length >= 5) {
      setAlertType("info");
      setAlertMessage("You can add up to 5 categories");
      return;
    }
    setSelectedCategories((prev) => [...prev, normalized]);
    setCategoryQuery("");
    setIsCategoryDropdownOpen(false);
  };

  const handleRemoveCategory = (cat: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== cat));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setAlertType("error");
      setAlertMessage("Please enter a title for your request");
      return;
    }
    if (!description.trim()) {
      setAlertType("error");
      setAlertMessage("Please describe what you're looking for");
      return;
    }

    const parsedBounty = bounty ? parseInt(bounty, 10) : 0;
    const bountyNum = parsedBounty > 0 ? parsedBounty : null;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          categories: selectedCategories,
          bounty: bountyNum,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlertType("error");
        setAlertMessage(data?.error || "Failed to post request");
        return;
      }
      router.push(`/request/${data.id}`);
    } catch {
      setAlertType("error");
      setAlertMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="min-h-screen bg-page">
      <Header title="New Request" />
      <Alert message={alertMessage || null} type={alertType} />

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-150 px-4 pt-20 pb-32 space-y-5"
      >
        <div className="space-y-1">
          <div>
            <label
              htmlFor="request-title"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              What are you looking for?
              <span className="ml-1 text-red-400">*</span>
            </label>
            <input
              id="request-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grade 12 Physics Notes – ZSCE"
              maxLength={120}
              className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
            />
            <p className="mt-1.5 text-right text-xs text-ink-3">
              {title.length}/120
            </p>
          </div>

          <div>
            <label
              htmlFor="request-description"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              Describe what you need
              <span className="ml-1 text-red-400">*</span>
            </label>
            <textarea
              id="request-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about the document — edition, year, specific chapters, format preferences, etc."
              rows={5}
              maxLength={1000}
              className="w-full resize-none rounded-2xl border border-edge-mid bg-input px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
            />
            <p className="mt-1.5 text-right text-xs text-ink-3">
              {description.length}/1000
            </p>
          </div>

          <div className="relative">
            <label
              htmlFor="request-categories"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              Categories
              <span className="ml-1.5 text-xs font-normal text-ink-3">
                (optional, up to 5)
              </span>
            </label>

            {selectedCategories.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] py-1 pl-3 pr-2 text-xs font-semibold text-[#1D4ED8]"
                  >
                    {cat}
                    <button
                      aria-label="remove catergory"
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[#DBEAFE]"
                    >
                      <CloseCircle size={14} color="#1D4ED8" variant="Bold" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                ref={categoryInputRef}
                id="request-categories"
                type="text"
                value={categoryQuery}
                onChange={(e) => {
                  setCategoryQuery(e.target.value);
                  setIsCategoryDropdownOpen(true);
                }}
                onFocus={() => setIsCategoryDropdownOpen(true)}
                onBlur={() =>
                  setTimeout(() => setIsCategoryDropdownOpen(false), 150)
                }
                placeholder="Search categories…"
                className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 pr-10 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
              />
              <span
                className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${isCategoryDropdownOpen && "rotate-180"}`}
              >
                <ArrowDown2 size={16} color="var(--ink-3)" />
              </span>
            </div>

            {isCategoryDropdownOpen && filteredCategories.length > 0 && (
              <div className="absolute mt-1 w-full rounded-2xl border border-edge-mid bg-surface shadow-lg overflow-hidden z-50">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onMouseDown={() => handleAddCategory(cat)}
                    className="cursor-pointer w-full px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-surface-high"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3">
            <label
              htmlFor="request-bounty"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              Offer a reward
              <span className="ml-1.5 text-xs font-normal text-ink-3">
                (optional)
              </span>
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <Coin1 size={18} color="#E1761F" variant="Bold" />
                <span className="text-sm font-semibold text-[#E1761F]">
                  Tokens
                </span>
              </div>
              <input
                id="request-bounty"
                type="text"
                inputMode="numeric"
                value={bounty}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  if (digits === "" || parseInt(digits, 10) <= 100000) {
                    setBounty(digits);
                  }
                }}
                placeholder="0"
                className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 pl-28 text-sm text-ink placeholder:text-ink-3 focus:border-[#E1761F] focus:outline-none focus:ring-2 focus:ring-[#E1761F]/20 transition-all duration-200"
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              Tokens will be held until the request is fulfilled and released to
              the contributor you choose.
            </p>
          </div>
        </div>

        <ActionButton
          type="submit"
          disabled={!canSubmit || isSubmitting}
          fixedBottom
          className="w-full mt-6"
        >
          {isSubmitting ? "Posting…" : "Post Request"}
        </ActionButton>
      </form>
    </div>
  );
}
