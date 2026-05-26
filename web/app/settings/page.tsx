"use client";

import React, { useState } from "react";
import {
  ArrowRight2,
  Brush2,
  Clock,
  Coin1,
  Logout,
  Notification,
  SecuritySafe,
  ShieldTick,
  UserSquare,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import ActionButton from "../components/ActionButton";
import Header from "../components/Header";
import { refreshAuth } from "@/app/lib/auth-client";
import Alert from "../components/Alert";

const settingPages = [
  {
    eyebrow: "Earn",
    title: "Tokens & Rewards",
    description: "Track tokens earned from views and redeem for perks or cash.",
    icon: Coin1,
    buttons: [
      {
        key: "tokens",
        text: "Tokens & Rewards",
        note: "Balance, earn rate, redeem for subscriptions or cash",
        href: "/tokens",
      },
    ],
  },
  {
    eyebrow: "Access",
    title: "Account",
    description: "See account details, plan info, and linked services.",
    icon: UserSquare,
    buttons: [
      {
        key: "account-info",
        text: "Account Information",
        note: "Email, password, subscription and connected accounts",
        href: "/settings/account",
      },
    ],
  },
  {
    eyebrow: "Control",
    title: "Privacy & Safety",
    description: "Manage who can see you and who can interact with you.",
    icon: SecuritySafe,
    buttons: [
      {
        key: "visibility",
        text: "Account Visibility",
        note: "Profile, posts, comments and status visibility",
        href: "/settings/privacy/visibility",
      },
      {
        key: "blocked-users",
        text: "Blocked Users",
        note: "Review or remove blocked accounts",
        href: "/settings/privacy/blocked-users",
      },
    ],
  },
  {
    eyebrow: "History",
    title: "Your Activity",
    description: "Review and manage things you've done on Material Crate.",
    icon: Clock,
    buttons: [
      {
        key: "recently-deleted",
        text: "Recently Deleted",
        note: "Posts removed in the last 30 days",
        href: "/settings/activity/recently-deleted",
      },
    ],
  },
  {
    eyebrow: "Alerts",
    title: "Notifications",
    description: "Choose the updates that should reach you.",
    icon: Notification,
    buttons: [
      {
        key: "email-notifications",
        text: "Email Notifications",
        note: "Inbox updates and summaries",
        href: "/settings/notifications/email",
      },
      {
        key: "push-notifications",
        text: "Push Notifications",
        note: "Realtime alerts on your device",
        href: "/settings/notifications/push",
      },
    ],
  },
  {
    eyebrow: "Look & Feel",
    title: "Appearance",
    description: "Personalize the way Material Crate feels to use.",
    icon: Brush2,
    buttons: [
      {
        key: "theme",
        text: "Theme",
        note: "System, light, dark or sepia",
        href: "/settings/appearance/theme",
      },
    ],
  },
  {
    eyebrow: "Policies",
    title: "Support & Legal",
    description: "Get help, review policies, and understand the rules.",
    icon: ShieldTick,
    buttons: [
      {
        key: "help-support",
        text: "Help & Support",
        note: "Report issues, get help and review guidelines",
        href: "/settings/support/help",
      },
      {
        key: "privacy-policy",
        text: "Privacy Policy",
        note: "How data is collected and handled",
        href: "/settings/legal/privacy-policy",
      },
      {
        key: "terms-of-service",
        text: "Terms of Service",
        note: "Rules, limits and account responsibilities",
        href: "/settings/legal/terms-of-service",
      },
    ],
  },
];

export default function Settings() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to logout");
      }

      await refreshAuth();
      router.replace("/login");
      router.refresh();
    } catch (error: unknown) {
      setError("An unknown error occurred");
      console.error("Failed to logout:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <Header title="Settings" isLoading={isLoggingOut} />
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-20 sm:px-6">
        {error && <Alert message={error} type="error" className="mb-4" />}
        <div className="w-full space-y-3">
          {settingPages.map((section) => (
            <div
              key={section.title}
              className="overflow-hidden rounded-[20px] border border-edge bg-surface"
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="rounded-[14px] bg-[#F6EFE5] p-2.5">
                  <section.icon size={20} color="#A95A13" variant="Bulk" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink">
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {section.description}
                  </p>
                </div>
              </div>
              <div className="border-t border-edge">
                {section.buttons.map((button, index) => (
                  <button
                    type="button"
                    key={button.key}
                    onClick={() => router.push(button.href)}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-[#FBF7F2] ${
                      index < section.buttons.length - 1
                        ? "border-b border-edge"
                        : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {button.text}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-2">
                        {button.note}
                      </p>
                    </div>
                    <ArrowRight2 size={18} color="#444444" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <ActionButton
          className="mt-6 flex w-full items-center justify-center gap-2"
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <Logout size={20} color="#FFFFFF" />
          <p className="font-medium text-white">Logout</p>
        </ActionButton>
      </div>
    </div>
  );
}
