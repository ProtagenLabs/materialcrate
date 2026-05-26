"use client";

import React, { useState } from "react";
import { MessageQuestion } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ActionButton from "@/app/components/ActionButton";

type HelpTopic = "general" | "account" | "billing" | "feature" | "other";

const TOPICS: { value: HelpTopic; label: string }[] = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & settings" },
  { value: "billing", label: "Billing & payments" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2000;

export default function Page() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState<HelpTopic | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  const isFormValid =
    subject.trim().length >= 5 && message.trim().length >= 20 && topic !== "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/support/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to send message.");
      }

      setSubject("");
      setMessage("");
      setTopic("");
      setSuccessMessage("Message sent! We'll get back to you.");
    } catch (err: unknown) {
      setError("Something went wrong.");
      console.error("Failed to send support message:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-[linear-gradient(180deg,#F7F7F7_0%,#F2EEE7_100%)]">
      <Header title="Ask for Help" isLoading={isSubmitting} />

      <form
        id="ask-form"
        className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-20 sm:px-6"
        onSubmit={handleSubmit}
      >
        {successMessage && <Alert type="success" message={successMessage} />}
        {error && <Alert type="error" message={error} />}
        <div className="w-full rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Support
          </p>
          <h2 className="mt-1 text-lg font-semibold">Need a hand?</h2>
          <p className="mt-1 text-xs text-white/72">
            Send us a message and we&apos;ll get back to you via email as soon
            as possible.
          </p>
        </div>

        <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">Topic</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            What do you need help with?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTopic(t.value)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  topic === t.value
                    ? "border-[#E1761F] bg-[#FFF4EA] text-[#B46B28]"
                    : "border-edge-mid bg-surface-high text-ink-2 hover:bg-[#F0ECE6]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">Your Message</h3>

          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-ink-2">Subject</p>
            <input
              type="text"
              placeholder="What's this about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_SUBJECT_LENGTH}
              className="w-full rounded-2xl border border-edge bg-surface-high px-3 py-3 text-sm placeholder:text-ink-3 focus:outline-none"
            />
            <p className="text-right text-[11px] text-[#AAAAAA]">
              {subject.length}/{MAX_SUBJECT_LENGTH}
            </p>
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-ink-2">Message</p>
            <textarea
              placeholder="Describe what you need help with in detail…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={6}
              className="w-full resize-none rounded-2xl border border-edge bg-surface-high px-3 py-3 text-sm leading-relaxed placeholder:text-ink-3 focus:outline-none"
            />
            <p className="text-right text-[11px] text-[#AAAAAA]">
              {message.length}/{MAX_MESSAGE_LENGTH}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[20px] bg-[#FFF4EA] px-4 py-3.5">
          <MessageQuestion
            size={18}
            color="#A95A13"
            variant="Bulk"
            className="mt-0.5 shrink-0"
          />
          <p className="text-xs leading-relaxed text-[#8B6234]">
            We&apos;ll respond to the email address associated with your
            account. Make sure it&apos;s up to date in your settings.
          </p>
        </div>

        <ActionButton
          type="submit"
          form="ask-form"
          label="Send Message"
          disabled={!isFormValid || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Sending…" : "Send Message"}
        </ActionButton>
      </form>
    </div>
  );
}
