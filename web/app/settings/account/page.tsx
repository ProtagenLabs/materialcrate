"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldSecurity, Trash } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import { useSystemPopup } from "@/app/components/SystemPopup";
import { refreshAuth, useAuth } from "@/app/lib/auth-client";
import {
  formatSubscriptionPlan,
  hasPaidSubscription,
  normalizeSubscriptionPlan,
} from "@/app/lib/subscription";

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatSeoProvider = (provider: string) =>
  provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const formatElapsedSince = (value?: string | null, now = Date.now()) => {
  if (!value) return "-";

  const parsed = new Date(value);
  const timestamp = parsed.getTime();

  if (Number.isNaN(timestamp)) return "-";

  return formatDuration(now - timestamp);
};

const formatCountdownUntil = (value?: string | null, now = Date.now()) => {
  if (!value) return "-";

  const parsed = new Date(value);
  const timestamp = parsed.getTime();

  if (Number.isNaN(timestamp)) return "-";

  return formatDuration(timestamp - now);
};

const getPendingSubscriptionCopy = ({
  currentPlan,
  pendingPlan,
  action,
  effectiveAt,
}: {
  currentPlan?: string | null;
  pendingPlan?: string | null;
  action?: string | null;
  effectiveAt?: string | null;
}) => {
  if (!effectiveAt && !action && !pendingPlan) {
    return null;
  }

  const normalizedCurrentPlan = normalizeSubscriptionPlan(currentPlan);
  const normalizedPendingPlan = pendingPlan
    ? normalizeSubscriptionPlan(pendingPlan)
    : null;
  const effectiveLabel = formatDate(effectiveAt);
  const when = effectiveLabel !== "-" ? ` on ${effectiveLabel}` : "";

  if (action === "cancel" || normalizedPendingPlan === "free") {
    return {
      summary: `Cancellation pending${when}`,
      note: `Your ${formatSubscriptionPlan(currentPlan)} access stays active until the scheduled end date.`,
    };
  }

  if (
    normalizedPendingPlan &&
    normalizedPendingPlan !== normalizedCurrentPlan
  ) {
    return {
      summary: `${formatSubscriptionPlan(normalizedPendingPlan)} pending${when}`,
      note: `Your plan stays on ${formatSubscriptionPlan(currentPlan)} until the change takes effect.`,
    };
  }

  if (action === "pause") {
    return {
      summary: `Pause pending${when}`,
      note: "Your current access remains unchanged until the scheduled date.",
    };
  }

  return {
    summary: `Plan change pending${when}`,
    note: "Your current access remains unchanged until the scheduled date.",
  };
};

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const popup = useSystemPopup();
  const [now, setNow] = useState(() => Date.now());
  const [showJoinedCountdown, setShowJoinedCountdown] = useState(false);
  const [showPlanStartedCountdown, setShowPlanStartedCountdown] =
    useState(false);
  const [showPlanRenewsCountdown, setShowPlanRenewsCountdown] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [hasCreatedPasswordSinceLoad, setHasCreatedPasswordSinceLoad] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (searchParams.get("emailChanged") === "1") {
      setSuccess("Email updated successfully.");
    }

    if (searchParams.get("billing") === "success") {
      setSuccess(
        "Checkout completed. Your subscription will refresh as soon as Gumroad confirms the payment.",
      );
      void refreshAuth();
    }

    if (searchParams.get("billing") === "cancelled") {
      setError("Checkout was cancelled.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (
      !showJoinedCountdown &&
      !showPlanStartedCountdown &&
      !showPlanRenewsCountdown
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [showJoinedCountdown, showPlanRenewsCountdown, showPlanStartedCountdown]);

  const canCreatePassword =
    Boolean(user?.linkedSEOs?.length) && !hasCreatedPasswordSinceLoad;

  const pendingSubscriptionCopy = useMemo(
    () =>
      getPendingSubscriptionCopy({
        currentPlan: user?.subscriptionPlan,
        pendingPlan: user?.pendingSubscriptionPlan,
        action: user?.pendingSubscriptionAction,
        effectiveAt: user?.pendingSubscriptionEffectiveAt,
      }),
    [
      user?.pendingSubscriptionAction,
      user?.pendingSubscriptionEffectiveAt,
      user?.pendingSubscriptionPlan,
      user?.subscriptionPlan,
    ],
  );

  const accountSections = useMemo(
    () => [
      {
        key: "account-details",
        title: "Account Details",
        items: [
          {
            label: "Current Email",
            value: user?.email ?? "-",
            key: "email",
          },
          ...(user?.pendingEmail
            ? [
                {
                  label: "Pending Email",
                  value: user.pendingEmail,
                  key: "pendingEmail",
                },
              ]
            : []),
          {
            label: "Password",
            value: canCreatePassword ? "Create password" : "Change password",
            key: "password",
          },
          {
            label: "Date Joined",
            value: showJoinedCountdown
              ? formatElapsedSince(user?.createdAt, now)
              : formatDate(user?.createdAt),
            key: "dateJoined",
          },
        ],
      },
      {
        key: "plan",
        title: "Plan",
        items: [
          {
            label: "Subscription Plan",
            value: formatSubscriptionPlan(user?.subscriptionPlan),
            key: "accountPlan",
          },
          ...(pendingSubscriptionCopy
            ? [
                {
                  label: "Pending change",
                  value: pendingSubscriptionCopy.summary,
                  key: "pendingSubscriptionChange",
                },
              ]
            : []),
          ...(hasPaidSubscription(user?.subscriptionPlan)
            ? [
                {
                  label: "Started",
                  value: showPlanStartedCountdown
                    ? formatElapsedSince(user?.subscriptionStartedAt, now)
                    : formatDate(user?.subscriptionStartedAt),
                  key: "subscriptionStartedAt",
                },
                {
                  label: "Renews",
                  value: showPlanRenewsCountdown
                    ? formatCountdownUntil(user?.subscriptionEndsAt, now)
                    : formatDate(user?.subscriptionEndsAt),
                  key: "subscriptionEndsAt",
                },
              ]
            : []),
        ],
      },
      {
        key: "connected-accounts",
        title: "Connected Accounts",
        items: [
          {
            label: "Linked Accounts",
            value: Array.isArray(user?.linkedSEOs)
              ? user.linkedSEOs.map(formatSeoProvider).join(", ") ||
                "None linked"
              : "None linked",
            key: "linkedAccounts",
          },
        ],
      },
    ],
    [
      canCreatePassword,
      now,
      pendingSubscriptionCopy,
      showJoinedCountdown,
      showPlanRenewsCountdown,
      showPlanStartedCountdown,
      user,
    ],
  );

  const pendingEmailMatchesCurrent =
    normalizeEmail(user?.pendingEmail ?? "") ===
    normalizeEmail(user?.email ?? "");

  const handleEmailChangeRequest = async () => {
    const initialValue = user?.pendingEmail ?? user?.email ?? "";
    const promptedEmail = await popup.prompt({
      title: "Change Email",
      message: "Enter your new email address.",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
      placeholder: "name@example.com",
      defaultValue: initialValue,
      inputType: "email",
    });
    if (promptedEmail === null) {
      return;
    }

    const nextEmail = normalizeEmail(promptedEmail);
    if (!nextEmail) {
      setError("Email is required.");
      return;
    }

    if (!EMAIL_REGEX.test(nextEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (nextEmail === normalizeEmail(user?.email ?? "")) {
      setError("Enter a different email address.");
      return;
    }

    setIsSubmittingEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/email-change/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to start email change");
      }

      await refreshAuth();
      router.push("/settings/account/verify");
    } catch (caughtError: unknown) {
      setError("Failed to start email change");
      console.error("Failed to start email change: ", caughtError);
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handlePasswordChangeRequest = async () => {
    let currentPassword = "";

    if (!canCreatePassword) {
      const promptedCurrentPassword = await popup.prompt({
        title: "Current Password",
        message: "Enter your current password to continue.",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        placeholder: "Current password",
        defaultValue: "",
        inputType: "password",
      });
      if (promptedCurrentPassword === null) {
        return;
      }

      if (!promptedCurrentPassword) {
        setError("Current password is required.");
        return;
      }

      currentPassword = promptedCurrentPassword;
    }

    const newPassword = await popup.prompt({
      title: canCreatePassword ? "Create Password" : "New Password",
      message: canCreatePassword
        ? "Create a password for email sign-in in addition to your social account."
        : "Enter the new password you want to use.",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
      placeholder: "New password",
      defaultValue: "",
      inputType: "password",
    });
    if (newPassword === null) {
      return;
    }

    if (!newPassword) {
      setError("New password is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password too weak");
      return;
    }

    if (!canCreatePassword && currentPassword === newPassword) {
      setError("New password must differ from current password");
      return;
    }

    const confirmPassword = await popup.prompt({
      title: canCreatePassword ? "Confirm Password" : "Confirm New Password",
      message: "Enter the password again to confirm.",
      confirmLabel: canCreatePassword ? "Create Password" : "Save Password",
      cancelLabel: "Cancel",
      placeholder: "Confirm password",
      defaultValue: "",
      inputType: "password",
    });
    if (confirmPassword === null) {
      return;
    }

    if (confirmPassword !== newPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmittingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to save password");
      }

      setHasCreatedPasswordSinceLoad(true);
      setSuccess(
        canCreatePassword
          ? "Password created successfully"
          : "Password updated successfully",
      );
    } catch (caughtError: unknown) {
      setError(
        canCreatePassword
          ? "Failed to create password"
          : "Failed to change password",
      );
      console.error("Failed to save password: ", caughtError);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleManageBilling = () => {
    window.open(
      "https://app.gumroad.com/subscriptions",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleDeleteAccount = async () => {
    const confirmed = await popup.confirm({
      title: "Delete account?",
      message:
        "Your account will be softly deleted immediately. For the next 30 days you can restore it by logging back in and confirming the restore prompt. Your posts will show Deleted / @deleted during that period.",
      confirmLabel: "Delete account",
      cancelLabel: "Cancel",
      isDestructive: true,
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingAccount(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to delete account");
      }

      await refreshAuth();
      const nextUrl = new URL("/login", window.location.origin);
      nextUrl.searchParams.set("deleted", "1");
      if (typeof body?.restoreDeadline === "string") {
        nextUrl.searchParams.set("restoreDeadline", body.restoreDeadline);
      }
      router.replace(`${nextUrl.pathname}${nextUrl.search}`);
    } catch (caughtError: unknown) {
      setError("Failed to delete account");
      console.error("Failed to delete account:", caughtError);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      <div className="min-h-dvh bg-page">
      <div className="mx-auto max-w-2xl px-4 pt-20 pb-10 sm:px-6">
        <Alert type="success" message={success} className="mb-4" />
        <Alert type="error" message={error} className="mb-4" />
        <Header
          title="Account Information"
          isLoading={
            isSubmittingEmail ||
            isSubmittingPassword ||
            isDeletingAccount
          }
        />
        <div className="mb-4 rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Account
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Your account at a glance.
          </h2>
          <p className="mt-1 text-xs text-white/72">
            Review sign-in details, plan status, and connected services.
          </p>
        </div>
        {isLoading ? (
          <div className="mb-4 w-full rounded-[18px] bg-surface px-4 py-3 text-sm text-ink">
            Loading account information...
          </div>
        ) : null}
        {!isLoading && user && (
          <div className="mb-4">
            {user.pendingEmail && !pendingEmailMatchesCurrent && (
              <div className="rounded-2xl bg-[#FFF7ED] px-4 py-3">
                <p className="text-sm font-medium text-[#A15D16]">
                  Verification pending for {user.pendingEmail}
                </p>
                <p className="mt-1 text-xs text-[#8A6A44]">
                  Your sign-in email will not change until the code is
                  confirmed.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/settings/account/verify")}
                  className="mt-3 text-sm font-medium text-[#A15D16] transition-opacity hover:opacity-70 active:opacity-50"
                >
                  Continue verification
                </button>
              </div>
            )}
          </div>
        )}
        {accountSections.map((section) => (
          <Fragment key={section.key}>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
              {section.title}
            </h2>
            <div className="mb-4 w-full overflow-hidden rounded-[20px] border border-edge bg-surface">
              {section.items.map((item, index) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={
                    item.key === "email"
                      ? handleEmailChangeRequest
                      : item.key === "password"
                        ? handlePasswordChangeRequest
                        : item.key === "dateJoined"
                          ? () =>
                              setShowJoinedCountdown(
                                (previousValue) => !previousValue,
                              )
                          : item.key === "subscriptionStartedAt"
                            ? () =>
                                setShowPlanStartedCountdown(
                                  (previousValue) => !previousValue,
                                )
                            : item.key === "subscriptionEndsAt"
                              ? () =>
                                  setShowPlanRenewsCountdown(
                                    (previousValue) => !previousValue,
                                  )
                              : undefined
                  }
                  disabled={
                    item.key === "email"
                      ? isSubmittingEmail
                      : item.key === "password"
                        ? isSubmittingPassword
                        : false
                  }
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-ink transition-colors hover:bg-[#F7F3EE] active:opacity-60 ${
                    index < section.items.length - 1 &&
                    "border-b border-edge"
                  }`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-right text-xs text-ink-2 truncate">
                    {item.value || "-"}
                  </div>
                </button>
              ))}
            </div>
          </Fragment>
        ))}
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
          Billing
        </h2>
        <div className="mb-4 w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
          <p className="text-sm font-medium text-ink">
            {hasPaidSubscription(user?.subscriptionPlan)
              ? "Manage subscription"
              : "Upgrade your plan"}
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Billing, invoices, payment methods, and cancellations are handled
            securely through Gumroad.
          </p>
          {pendingSubscriptionCopy ? (
            <div className="mt-3 rounded-2xl bg-[#FFF7ED] px-3 py-3">
              <p className="text-sm font-medium text-[#A15D16]">
                {pendingSubscriptionCopy.summary}
              </p>
              <p className="mt-1 text-xs text-[#8A6A44]">
                {pendingSubscriptionCopy.note}
              </p>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {hasPaidSubscription(user?.subscriptionPlan) ? (
              <button
                type="button"
                onClick={handleManageBilling}
                className="rounded-full bg-[#1D1D1D] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:opacity-70"
              >
                Manage Billing
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push("/plans")}
              className="rounded-full border border-edge-mid px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-high active:opacity-70"
            >
              {hasPaidSubscription(user?.subscriptionPlan)
                ? "Change plan"
                : "View plans"}
            </button>
          </div>
        </div>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#B45C5C]">
          Danger Zone
        </h2>
        <div className="mb-4 w-full rounded-[20px] border border-[#F3D2D2] bg-[#FFF5F5] px-4 py-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="rounded-[14px] bg-[#FDE4E4] p-2.5">
              <ShieldSecurity size={18} color="#C04A4A" variant="Bulk" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                Delete Account
              </p>
              <p className="mt-1 text-xs text-[#7A6A6A]">
                Delete your account now. You can restore it for 30 days by
                logging back in.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={isDeletingAccount}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 disabled:opacity-60"
            aria-label="Delete Account"
          >
            <Trash size={16} color="#DC2626" />
            {isDeletingAccount ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
