"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SmsNotification } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ToggleSwitch from "@/app/components/ToggleSwitch";
import { useAuth } from "@/app/lib/auth-client";

type EmailNotificationSettings = {
  emailNotificationsAccountActivity: boolean;
  emailNotificationsWeeklySummary: boolean;
  emailNotificationsProductUpdates: boolean;
  emailNotificationsMarketing: boolean;
  emailNotificationsUploadReminder: boolean;
};

type EmailOption = {
  key: keyof EmailNotificationSettings;
  label: string;
  description: string;
};

const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: EmailNotificationSettings = {
  emailNotificationsAccountActivity: true,
  emailNotificationsWeeklySummary: true,
  emailNotificationsProductUpdates: true,
  emailNotificationsMarketing: true,
  emailNotificationsUploadReminder: true,
};

const emailOptions: EmailOption[] = [
  {
    key: "emailNotificationsAccountActivity",
    label: "Account activity",
    description: "Important updates about your account and sign-ins.",
  },
  {
    key: "emailNotificationsWeeklySummary",
    label: "Weekly summary",
    description: "A recap of views, engagement, and activity.",
  },
  {
    key: "emailNotificationsProductUpdates",
    label: "Product updates",
    description: "New features, improvements, and app announcements.",
  },
  {
    key: "emailNotificationsMarketing",
    label: "Marketing emails",
    description: "Occasional tips, promos, and campaigns.",
  },
  {
    key: "emailNotificationsUploadReminder",
    label: "Upload reminders",
    description: "Weekly nudge to share materials and earn tokens when you haven't uploaded recently.",
  },
];

export default function Page() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [emailNotifications, setEmailNotifications] =
    useState<EmailNotificationSettings>(DEFAULT_EMAIL_NOTIFICATION_SETTINGS);
  const [isSavingKey, setIsSavingKey] = useState<
    keyof EmailNotificationSettings | null
  >(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoadingAuth && !user) {
      router.replace("/login");
    }
  }, [isLoadingAuth, router, user]);

  useEffect(() => {
    let mounted = true;

    const loadEmailNotifications = async () => {
      if (isLoadingAuth || !user) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/me", { method: "GET" });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.user) {
          throw new Error("Failed to load email notification settings");
        }

        if (!mounted) return;

        setEmailNotifications({
          emailNotificationsAccountActivity:
            typeof body.user.emailNotificationsAccountActivity === "boolean"
              ? body.user.emailNotificationsAccountActivity
              : DEFAULT_EMAIL_NOTIFICATION_SETTINGS.emailNotificationsAccountActivity,
          emailNotificationsWeeklySummary:
            typeof body.user.emailNotificationsWeeklySummary === "boolean"
              ? body.user.emailNotificationsWeeklySummary
              : DEFAULT_EMAIL_NOTIFICATION_SETTINGS.emailNotificationsWeeklySummary,
          emailNotificationsProductUpdates:
            typeof body.user.emailNotificationsProductUpdates === "boolean"
              ? body.user.emailNotificationsProductUpdates
              : DEFAULT_EMAIL_NOTIFICATION_SETTINGS.emailNotificationsProductUpdates,
          emailNotificationsMarketing:
            typeof body.user.emailNotificationsMarketing === "boolean"
              ? body.user.emailNotificationsMarketing
              : DEFAULT_EMAIL_NOTIFICATION_SETTINGS.emailNotificationsMarketing,
          emailNotificationsUploadReminder:
            typeof body.user.emailNotificationsUploadReminder === "boolean"
              ? body.user.emailNotificationsUploadReminder
              : DEFAULT_EMAIL_NOTIFICATION_SETTINGS.emailNotificationsUploadReminder,
        });
      } catch (caughtError: unknown) {
        if (!mounted) return;
        setError("Error loading email notification settings");
        console.error("Error loading email notification settings", {
          error:
            caughtError instanceof Error ? caughtError.message : caughtError,
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadEmailNotifications();

    return () => {
      mounted = false;
    };
  }, [isLoadingAuth, user]);

  const handleToggleChange = async (
    key: keyof EmailNotificationSettings,
    nextState: boolean,
  ) => {
    if (isSavingKey) return;

    const previousEmailNotifications = emailNotifications;
    const nextEmailNotifications = {
      ...previousEmailNotifications,
      [key]: nextState,
    };

    setEmailNotifications(nextEmailNotifications);
    setIsSavingKey(key);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings/notifications/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextEmailNotifications),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          body?.error || "Failed to save email notification settings",
        );
      }

      setSuccess("Email notification settings updated.");
    } catch (caughtError: unknown) {
      setEmailNotifications(previousEmailNotifications);
      setError("Error saving email notification settings");
      console.error("Error saving email notification settings", {
        error: caughtError instanceof Error ? caughtError.message : caughtError,
      });
    } finally {
      setIsSavingKey(null);
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <Header
        title="Email Notifications"
        isLoading={isLoading || isSavingKey !== null}
      />
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-20 sm:px-6">
      <Alert message={success} type="success" className="mb-4" />
      <Alert message={error} type="error" className="mb-4" />
      <div className="mb-4 rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
          Notifications
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          Inbox updates, only when useful.
        </h2>
        <p className="mt-1 text-xs text-white/72">
          Pick the emails that should reach you outside the app.
        </p>
      </div>
      <div className="space-y-3">
        {emailOptions.map((option) => (
          <div
            key={option.label}
            className="flex items-start justify-between gap-4 rounded-[20px] border border-edge bg-surface px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-[14px] bg-[#F6EFE5] p-2.5">
                <SmsNotification size={18} color="#A95A13" variant="Bulk" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  {option.label}
                </p>
                <p className="text-xs text-ink-2">{option.description}</p>
              </div>
            </div>
            <div>
              <ToggleSwitch
                state={emailNotifications[option.key]}
                disabled={isSavingKey !== null}
                onChange={(newState) =>
                  void handleToggleChange(option.key, newState)
                }
              />
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
