"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash } from "iconsax-reactjs";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ToggleSwitch from "@/app/components/ToggleSwitch";
import { useAuth } from "@/app/lib/auth-client";

type VisibilitySettings = {
  visibilityPublicProfile: boolean;
  visibilityPublicPosts: boolean;
  visibilityPublicComments: boolean;
  visibilityOnlineStatus: boolean;
};

type VisibilityOption = {
  key: keyof VisibilitySettings;
  label: string;
  description: string;
};

const normalizeVisibilitySettings = (
  value: VisibilitySettings,
): VisibilitySettings => {
  if (!value.visibilityPublicProfile && value.visibilityPublicPosts) {
    return {
      ...value,
      visibilityPublicPosts: false,
    };
  }

  return value;
};

const DEFAULT_VISIBILITY_SETTINGS: VisibilitySettings = {
  visibilityPublicProfile: true,
  visibilityPublicPosts: true,
  visibilityPublicComments: true,
  visibilityOnlineStatus: true,
};

const visibilityOptions: VisibilityOption[] = [
  {
    key: "visibilityPublicProfile",
    label: "Public profile",
    description: "Allow other people to discover and view your profile.",
  },
  {
    key: "visibilityPublicPosts",
    label: "Public posts",
    description: "Show your posts outside your direct audience.",
  },
  {
    key: "visibilityPublicComments",
    label: "Public comments",
    description: "Let your comment activity be visible to others.",
  },
  {
    key: "visibilityOnlineStatus",
    label: "Online status",
    description: "Show when you are active in the app.",
  },
];

export default function Page() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [visibility, setVisibility] = useState<VisibilitySettings>(
    DEFAULT_VISIBILITY_SETTINGS,
  );
  const [isSavingKey, setIsSavingKey] = useState<
    keyof VisibilitySettings | null
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

    const loadVisibility = async () => {
      if (isLoadingAuth || !user) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/me", { method: "GET" });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.user) {
          throw new Error("Failed to load visibility settings");
        }

        if (!mounted) return;

        const loadedVisibility = normalizeVisibilitySettings({
          visibilityPublicProfile:
            typeof body.user.visibilityPublicProfile === "boolean"
              ? body.user.visibilityPublicProfile
              : DEFAULT_VISIBILITY_SETTINGS.visibilityPublicProfile,
          visibilityPublicPosts:
            typeof body.user.visibilityPublicPosts === "boolean"
              ? body.user.visibilityPublicPosts
              : DEFAULT_VISIBILITY_SETTINGS.visibilityPublicPosts,
          visibilityPublicComments:
            typeof body.user.visibilityPublicComments === "boolean"
              ? body.user.visibilityPublicComments
              : DEFAULT_VISIBILITY_SETTINGS.visibilityPublicComments,
          visibilityOnlineStatus:
            typeof body.user.visibilityOnlineStatus === "boolean"
              ? body.user.visibilityOnlineStatus
              : DEFAULT_VISIBILITY_SETTINGS.visibilityOnlineStatus,
        });

        setVisibility(loadedVisibility);
      } catch (caughtError: unknown) {
        if (!mounted) return;
        setError("Error loading visibility settings");
        console.error("Error loading visibility settings", {
          error:
            caughtError instanceof Error ? caughtError.message : caughtError,
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadVisibility();

    return () => {
      mounted = false;
    };
  }, [isLoadingAuth, user]);

  const handleToggleChange = async (
    key: keyof VisibilitySettings,
    nextState: boolean,
  ) => {
    if (isSavingKey) return;
    if (
      key === "visibilityPublicPosts" &&
      !visibility.visibilityPublicProfile
    ) {
      return;
    }

    const previousVisibility = visibility;
    const nextVisibility = normalizeVisibilitySettings({
      ...previousVisibility,
      [key]: nextState,
    });

    setVisibility(nextVisibility);
    setIsSavingKey(key);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings/privacy/visibility", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextVisibility),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to save visibility settings");
      }

      setSuccess("Visibility settings updated.");
    } catch (caughtError: unknown) {
      setVisibility(previousVisibility);
      setError("Error saving visibility settings");
      console.error("Error saving visibility settings", {
        error: caughtError instanceof Error ? caughtError.message : caughtError,
      });
    } finally {
      setIsSavingKey(null);
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <Header
        title="Account Visibility"
        isLoading={isLoading || isSavingKey !== null}
      />
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-20 sm:px-6">
      <Alert message={success} type="success" className="mb-4" />
      <Alert message={error} type="error" className="mb-4" />
      <div className="mb-4 rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
          Privacy
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          Control what people can see.
        </h2>
        <p className="mt-1 text-xs text-white/72">
          Visibility settings shape how discoverable your profile and activity
          are.
        </p>
      </div>
      <div className="space-y-3">
        {visibilityOptions.map((option) => {
          const isPublicPostsLocked =
            option.key === "visibilityPublicPosts" &&
            !visibility.visibilityPublicProfile;

          return (
            <div
              key={option.label}
              className={`flex items-start justify-between gap-4 rounded-[20px] border border-edge px-4 py-3 ${
                isPublicPostsLocked ? "bg-surface-high" : "bg-surface"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-[14px] bg-[#F6EFE5] p-2.5">
                  {visibility[option.key] ? (
                    <Eye size={18} color="#A95A13" variant="Bulk" />
                  ) : (
                    <EyeSlash size={18} color="#A95A13" variant="Bulk" />
                  )}
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      isPublicPostsLocked ? "text-ink-3" : "text-ink"
                    }`}
                  >
                    {option.label}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      isPublicPostsLocked ? "text-ink-3" : "text-ink-2"
                    }`}
                  >
                    {option.description}
                  </p>
                </div>
              </div>
              <div>
                <ToggleSwitch
                  state={visibility[option.key]}
                  disabled={isPublicPostsLocked || isSavingKey !== null}
                  onChange={(newState) =>
                    void handleToggleChange(option.key, newState)
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
