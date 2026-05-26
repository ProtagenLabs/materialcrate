"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notification } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ToggleSwitch from "@/app/components/ToggleSwitch";
import { useAuth } from "@/app/lib/auth-client";

type PushNotificationSettings = {
  pushNotificationsLikes: boolean;
  pushNotificationsComments: boolean;
  pushNotificationsFollows: boolean;
  pushNotificationsMentions: boolean;
};

type PushOption = {
  key: keyof PushNotificationSettings;
  label: string;
  description: string;
};

const DEFAULT_PUSH_NOTIFICATION_SETTINGS: PushNotificationSettings = {
  pushNotificationsLikes: true,
  pushNotificationsComments: true,
  pushNotificationsFollows: true,
  pushNotificationsMentions: true,
};

const pushOptions: PushOption[] = [
  {
    key: "pushNotificationsLikes",
    label: "Likes and reactions",
    description: "When someone reacts to your post.",
  },
  {
    key: "pushNotificationsComments",
    label: "Comments",
    description: "When someone comments on your post.",
  },
  {
    key: "pushNotificationsFollows",
    label: "Follows",
    description: "When someone follows your account.",
  },
  {
    key: "pushNotificationsMentions",
    label: "Mentions",
    description: "When someone mentions you in content.",
  },
];

export default function Page() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [pushNotifications, setPushNotifications] =
    useState<PushNotificationSettings>(DEFAULT_PUSH_NOTIFICATION_SETTINGS);
  const [isSavingKey, setIsSavingKey] = useState<
    keyof PushNotificationSettings | null
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

    const loadPushNotifications = async () => {
      if (isLoadingAuth || !user) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/me", { method: "GET" });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.user) {
          throw new Error("Failed to load push notification settings");
        }

        if (!mounted) return;

        setPushNotifications({
          pushNotificationsLikes:
            typeof body.user.pushNotificationsLikes === "boolean"
              ? body.user.pushNotificationsLikes
              : DEFAULT_PUSH_NOTIFICATION_SETTINGS.pushNotificationsLikes,
          pushNotificationsComments:
            typeof body.user.pushNotificationsComments === "boolean"
              ? body.user.pushNotificationsComments
              : DEFAULT_PUSH_NOTIFICATION_SETTINGS.pushNotificationsComments,
          pushNotificationsFollows:
            typeof body.user.pushNotificationsFollows === "boolean"
              ? body.user.pushNotificationsFollows
              : DEFAULT_PUSH_NOTIFICATION_SETTINGS.pushNotificationsFollows,
          pushNotificationsMentions:
            typeof body.user.pushNotificationsMentions === "boolean"
              ? body.user.pushNotificationsMentions
              : DEFAULT_PUSH_NOTIFICATION_SETTINGS.pushNotificationsMentions,
        });
      } catch (caughtError: unknown) {
        if (!mounted) return;
        setError("Error loading push notification settings");
        console.error("Error loading push notification settings", {
          error:
            caughtError instanceof Error ? caughtError.message : caughtError,
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPushNotifications();

    return () => {
      mounted = false;
    };
  }, [isLoadingAuth, user]);

  const handleToggleChange = async (
    key: keyof PushNotificationSettings,
    nextState: boolean,
  ) => {
    if (isSavingKey) return;

    const previousPushNotifications = pushNotifications;
    const nextPushNotifications = {
      ...previousPushNotifications,
      [key]: nextState,
    };

    setPushNotifications(nextPushNotifications);
    setIsSavingKey(key);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings/notifications/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextPushNotifications),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          body?.error || "Failed to save push notification settings",
        );
      }

      setSuccess("Push notification settings updated.");
    } catch (caughtError: unknown) {
      setPushNotifications(previousPushNotifications);
      setError("Error saving push notification settings");
      console.error("Error saving push notification settings", {
        error: caughtError instanceof Error ? caughtError.message : caughtError,
      });
    } finally {
      setIsSavingKey(null);
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <Header
        title="Push Notifications"
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
          Realtime alerts on your device.
        </h2>
        <p className="mt-1 text-xs text-white/72">
          Choose which activity should trigger push notifications.
        </p>
      </div>
      <div className="space-y-3">
        {pushOptions.map((option) => (
          <div
            key={option.label}
            className="flex items-start justify-between gap-4 rounded-[20px] border border-edge bg-surface px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-[14px] bg-[#F6EFE5] p-2.5">
                <Notification size={18} color="#A95A13" variant="Bulk" />
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
                state={pushNotifications[option.key]}
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
