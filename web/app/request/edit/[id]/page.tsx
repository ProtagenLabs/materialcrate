"use client";

import React, { use, useEffect, useRef, useState } from "react";
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

type RequestData = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  bounty?: number | null;
  canEditBounty: boolean;
  solved: boolean;
  closed: boolean;
};

export default function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();

  const [original, setOriginal] = useState<RequestData | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [bounty, setBounty] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"success" | "error" | "info">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!user) router.push("/login");
  }, [isLoadingAuth, router, user]);

  useEffect(() => {
    fetch(`/api/requests/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: RequestData) => {
        if (!data?.id) { router.push("/"); return; }
        setOriginal(data);
        setTitle(data.title);
        setDescription(data.description);
        setSelectedCategories(data.categories ?? []);
        setBounty(data.bounty ? String(data.bounty) : "");
      })
      .catch(() => router.push("/"))
      .finally(() => setIsLoadingRequest(false));
  }, [id, router]);

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
      setAlertMessage("Please enter a title");
      return;
    }
    if (!description.trim()) {
      setAlertType("error");
      setAlertMessage("Please describe what you need");
      return;
    }

    const parsedBounty = bounty ? parseInt(bounty, 10) : 0;
    const bountyNum = parsedBounty > 0 ? parsedBounty : null;

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        categories: selectedCategories,
      };
      if (original?.canEditBounty) body.bounty = bountyNum;

      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlertType("error");
        setAlertMessage(data?.error || "Failed to save changes");
        return;
      }
      router.push(`/request/${id}`);
    } catch {
      setAlertType("error");
      setAlertMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

  if (isLoadingRequest) {
    return (
      <div className="min-h-screen bg-page">
        <Header title="Edit Request" />
        <div className="mx-auto max-w-xl px-4 pt-22 space-y-4">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page">
      <Header title="Edit Request" />

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-xl px-4 pt-20 pb-32 lg:pt-22 lg:pb-12"
      >
        <Alert message={alertMessage || null} type={alertType} className="mb-4" />
        <div className="space-y-4 lg:bg-surface lg:rounded-2xl lg:border lg:border-edge lg:shadow-sm lg:p-6">
          <div>
            <label
              htmlFor="edit-title"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              What are you looking for?
              <span className="ml-1 text-red-400">*</span>
            </label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
            />
            <p className="mt-1.5 text-right text-xs text-ink-3">{title.length}/120</p>
          </div>

          <div>
            <label
              htmlFor="edit-description"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              Describe what you need
              <span className="ml-1 text-red-400">*</span>
            </label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={1000}
              className="w-full resize-none rounded-2xl border border-edge-mid bg-input px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
            />
            <p className="mt-1.5 text-right text-xs text-ink-3">{description.length}/1000</p>
          </div>

          <div className="relative">
            <label
              htmlFor="edit-categories"
              className="mb-2 block text-sm font-semibold text-ink"
            >
              Categories
              <span className="ml-1.5 text-xs font-normal text-ink-3">(optional, up to 5)</span>
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
                      aria-label="remove category"
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
                id="edit-categories"
                type="text"
                value={categoryQuery}
                onChange={(e) => {
                  setCategoryQuery(e.target.value);
                  setIsCategoryDropdownOpen(true);
                }}
                onFocus={() => setIsCategoryDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsCategoryDropdownOpen(false), 150)}
                placeholder="Search categories…"
                className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 pr-10 text-sm text-ink placeholder:text-ink-3 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-all duration-200"
              />
              <span
                className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 ${isCategoryDropdownOpen ? "rotate-180" : ""}`}
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

          {original?.canEditBounty ? (
            <div>
              <label
                htmlFor="edit-bounty"
                className="mb-2 block text-sm font-semibold text-ink"
              >
                Offer a reward
                <span className="ml-1.5 text-xs font-normal text-ink-3">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <Coin1 size={18} color="#E1761F" variant="Bold" />
                  <span className="text-sm font-semibold text-[#E1761F]">Tokens</span>
                </div>
                <input
                  id="edit-bounty"
                  type="text"
                  inputMode="numeric"
                  value={bounty}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    if (digits === "" || parseInt(digits, 10) <= 100000) setBounty(digits);
                  }}
                  placeholder="0"
                  className="w-full rounded-2xl border border-edge-mid bg-input px-4 py-3 pl-28 text-sm text-ink placeholder:text-ink-3 focus:border-[#E1761F] focus:outline-none focus:ring-2 focus:ring-[#E1761F]/20 transition-all duration-200"
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">
                Tokens will be held until the request is fulfilled.
              </p>
            </div>
          ) : (
            original?.bounty ? (
              <div className="flex items-center gap-2 rounded-2xl bg-surface-high px-4 py-3">
                <Coin1 size={16} color="#E1761F" variant="Bold" />
                <p className="text-sm text-ink-2">
                  <span className="font-semibold text-[#E1761F]">{original.bounty.toLocaleString()} token reward</span>
                  <span className="ml-1.5 text-ink-3">— bounty cannot be changed once responses have been submitted</span>
                </p>
              </div>
            ) : null
          )}

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="hidden lg:flex w-full cursor-pointer items-center justify-center rounded-2xl bg-[#1D4ED8] py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#1A44C2] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>

        <ActionButton
          type="submit"
          disabled={!canSubmit || isSubmitting}
          fixedBottom
          className="lg:hidden w-full"
        >
          {isSubmitting ? "Saving…" : "Save Changes"}
        </ActionButton>
      </form>
    </div>
  );
}
