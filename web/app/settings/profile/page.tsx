"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Eye, EyeSlash } from "iconsax-reactjs";
import { IoMdCheckmarkCircle, IoMdCloseCircle } from "react-icons/io";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";
import ProfilePictureField from "@/app/components/profile/ProfilePictureField";
import {
  DEFAULT_PROFILE_BACKGROUND,
  getProfileBackgroundPresentation,
  isDefaultProfileBackground,
} from "@/app/lib/profile-background";
import { compressImageToWebp } from "@/app/lib/compress-image";
import { refreshAuth, useAuth } from "@/app/lib/auth-client";
import {
  getSubscriptionBadgeLabel,
  hasPaidSubscription,
} from "@/app/lib/subscription";

type ProfileFieldVisibility = "everyone" | "only_you";

type UserProfile = {
  username: string;
  displayName: string;
  profilePictureUrl?: string;
  profileBackground: string;
  institution: string;
  institutionVisibility: ProfileFieldVisibility;
  program: string;
  programVisibility: ProfileFieldVisibility;
};

type EditableTextInput = {
  label: string;
  value: string;
  onchange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  key: "displayName" | "institution" | "program";
  minLength: number;
  maxLength: number;
  optional?: boolean;
  visibilityKey?: "institutionVisibility" | "programVisibility";
};

const normalizeProfileFieldVisibility = (
  value: unknown,
): ProfileFieldVisibility => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return normalized === "everyone" ? "everyone" : "only_you";
};

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_PROFILE_BACKGROUND_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_BACKGROUND_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export default function Page() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [profile, setProfile] = useState<UserProfile>({
    username: "",
    displayName: "",
    institution: "",
    institutionVisibility: "everyone",
    program: "",
    programVisibility: "everyone",
    profilePictureUrl: "",
    profileBackground: DEFAULT_PROFILE_BACKGROUND,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [usernameMessage, setUsernameMessage] = useState<string>("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<
    boolean | null
  >(null);
  const [isLiveChecking, setIsLiveChecking] = useState<boolean>(false);
  const [isSubmitChecking, setIsSubmitChecking] = useState<boolean>(false);
  const lastLiveCheckedUsernameRef = useRef<string>("");
  const isChecking = isLiveChecking || isSubmitChecking;
  const [fetchedUsername, setFetchedUsername] = useState<string>("");
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(
    null,
  );
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] =
    useState<string>("");
  const [profileBackgroundFile, setProfileBackgroundFile] =
    useState<File | null>(null);
  const [profileBackgroundPreviewUrl, setProfileBackgroundPreviewUrl] =
    useState<string>("");
  const [isRemovingProfilePicture, setIsRemovingProfilePicture] =
    useState<boolean>(false);
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(
    null,
  );
  const profileBackgroundInputRef = useRef<HTMLInputElement | null>(null);

  const router = useRouter();
  const isPaidUser = hasPaidSubscription(user?.subscriptionPlan);
  const planLabel = getSubscriptionBadgeLabel(user?.subscriptionPlan);

  const profilePictureToRender =
    profilePicturePreviewUrl || profile.profilePictureUrl || "";
  const profileBackgroundPresentation = getProfileBackgroundPresentation(
    profileBackgroundPreviewUrl || profile.profileBackground,
  );

  useEffect(() => {
    if (isLoadingAuth) {
      return;
    }

    if (!user) {
      router.replace("/login");
    }
  }, [isLoadingAuth, router, user]);

  const getValidationError = useCallback((value: string) => {
    if (!USERNAME_REGEX.test(value)) {
      return "Username may only contain letters, numbers, and underscores.";
    }
    return "";
  }, []);

  const checkUsernameAvailability = useCallback(
    async (candidate: string, signal?: AbortSignal) => {
      const response = await fetch(
        `/api/auth/username-available?username=${encodeURIComponent(candidate)}`,
        { signal },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false,
          available: false,
          error:
            body?.error ||
            "Error connecting to server. Please try again later.",
        };
      }

      return {
        ok: true,
        available: Boolean(body?.available),
        error: "",
      };
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (isLoadingAuth || !user) {
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const response = await fetch("/api/auth/me", { method: "GET" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.user) {
          throw new Error("Failed to load profile");
        }

        if (!mounted) return;
        setProfile({
          username: body.user.username ?? "",
          displayName: body.user.displayName ?? "",
          institution: body.user.institution ?? "",
          institutionVisibility: normalizeProfileFieldVisibility(
            body.user.institutionVisibility,
          ),
          program: body.user.program ?? "",
          programVisibility: normalizeProfileFieldVisibility(
            body.user.programVisibility,
          ),
          profilePictureUrl:
            body.user.profilePicture ?? body.user.profilePictureUrl ?? "",
          profileBackground:
            body.user.profileBackground ?? DEFAULT_PROFILE_BACKGROUND,
        });
        setInitialProfile({
          username: body.user.username ?? "",
          displayName: body.user.displayName ?? "",
          institution: body.user.institution ?? "",
          institutionVisibility: normalizeProfileFieldVisibility(
            body.user.institutionVisibility,
          ),
          program: body.user.program ?? "",
          programVisibility: normalizeProfileFieldVisibility(
            body.user.programVisibility,
          ),
          profilePictureUrl:
            body.user.profilePicture ?? body.user.profilePictureUrl ?? "",
          profileBackground:
            body.user.profileBackground ?? DEFAULT_PROFILE_BACKGROUND,
        });
        setFetchedUsername(body.user.username ?? "");
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [isLoadingAuth, user]);

  useEffect(() => {
    return () => {
      if (profilePicturePreviewUrl) {
        URL.revokeObjectURL(profilePicturePreviewUrl);
      }
    };
  }, [profilePicturePreviewUrl]);

  useEffect(() => {
    return () => {
      if (profileBackgroundPreviewUrl) {
        URL.revokeObjectURL(profileBackgroundPreviewUrl);
      }
    };
  }, [profileBackgroundPreviewUrl]);

  useEffect(() => {
    const trimmedUsername = profile.username.trim();

    if (!trimmedUsername) {
      setUsernameMessage("");
      setIsLiveChecking(false);
      return;
    }

    const validationError = getValidationError(trimmedUsername);
    if (validationError) {
      setUsernameMessage(validationError);
      setIsLiveChecking(false);
      return;
    }

    if (trimmedUsername === lastLiveCheckedUsernameRef.current) {
      setIsLiveChecking(false);
      return;
    }

    setIsLiveChecking(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(
          trimmedUsername,
          controller.signal,
        );

        if (!result.ok) {
          setUsernameMessage(result.error);
          return;
        }

        lastLiveCheckedUsernameRef.current = trimmedUsername;
        setIsUsernameAvailable(result.available ? true : false);
        setUsernameMessage("");
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setUsernameMessage(
          "Error connecting to server. Please try again later.",
        );
      } finally {
        setIsLiveChecking(false);
      }
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [checkUsernameAvailability, getValidationError, profile.username]);

  const textInputs: EditableTextInput[] = [
    {
      label: "Display Name",
      value: profile.displayName,
      onchange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setProfile({ ...profile, displayName: e.target.value }),
      key: "displayName",
      minLength: 2,
      maxLength: 30,
    },
    {
      label: "Institution",
      value: profile.institution,
      onchange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setProfile({ ...profile, institution: e.target.value }),
      key: "institution",
      minLength: 3,
      maxLength: 50,
      optional: true,
      visibilityKey: "institutionVisibility",
    },
    {
      label: "Program/Main Option",
      value: profile.program,
      onchange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setProfile({ ...profile, program: e.target.value }),
      key: "program",
      minLength: 3,
      maxLength: 50,
      optional: true,
      visibilityKey: "programVisibility",
    },
  ];

  const hasTextChanges = initialProfile
    ? profile.username.trim() !== initialProfile.username.trim() ||
      profile.displayName.trim() !== initialProfile.displayName.trim() ||
      profile.institution.trim() !== initialProfile.institution.trim() ||
      profile.institutionVisibility !== initialProfile.institutionVisibility ||
      profile.program.trim() !== initialProfile.program.trim() ||
      profile.programVisibility !== initialProfile.programVisibility ||
      profile.profileBackground !== initialProfile.profileBackground
    : false;
  const hasProfilePictureChange = Boolean(profilePictureFile);
  const hasProfileBackgroundChange = Boolean(profileBackgroundFile);
  const hasPendingChanges =
    hasTextChanges || hasProfilePictureChange || hasProfileBackgroundChange;

  const isSaveDisabled =
    !hasPendingChanges ||
    !profile.username.trim() ||
    profile.username.length < MIN_USERNAME_LENGTH ||
    getValidationError(profile.username.trim()) !== "" ||
    (isUsernameAvailable === false && profile.username !== fetchedUsername) ||
    textInputs.some((input) => {
      const trimmed = input.value.trim();
      if (input.optional && trimmed.length === 0) return false;
      return trimmed.length < input.minLength;
    }) ||
    isLoading ||
    isSaving ||
    isSubmitChecking;

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaveDisabled) return;

    setIsSaving(true);
    setSuccessMessage("");
    setError("");

    try {
      setIsSubmitChecking(true);
      const trimmedUsername = profile.username.trim();

      const validationError = getValidationError(trimmedUsername);
      if (validationError) {
        setUsernameMessage(validationError);
        return;
      }

      if (trimmedUsername !== fetchedUsername) {
        const usernameResult = await checkUsernameAvailability(trimmedUsername);
        if (!usernameResult.ok) {
          setUsernameMessage(usernameResult.error);
          return;
        }

        if (!usernameResult.available) {
          setIsUsernameAvailable(false);
          return;
        }
      }

      lastLiveCheckedUsernameRef.current = trimmedUsername;
      setUsernameMessage("");

      const formData = new FormData();
      formData.append("username", trimmedUsername);
      formData.append("displayName", profile.displayName.trim());
      formData.append("institution", profile.institution.trim());
      formData.append("institutionVisibility", profile.institutionVisibility);
      const trimmedProgram = profile.program.trim();
      if (trimmedProgram) {
        formData.append("program", trimmedProgram);
      }
      formData.append("programVisibility", profile.programVisibility);
      if (
        !profileBackgroundFile &&
        initialProfile &&
        profile.profileBackground !== initialProfile.profileBackground
      ) {
        formData.append(
          "profileBackground",
          profile.profileBackground || DEFAULT_PROFILE_BACKGROUND,
        );
      }
      if (profilePictureFile) {
        formData.append("profilePictureFile", profilePictureFile);
      }
      if (profileBackgroundFile) {
        formData.append("profileBackgroundFile", profileBackgroundFile);
      }

      const response = await fetch("/api/graphql/complete-profile", {
        method: "POST",
        body: formData,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Failed to save profile");
      }

      await refreshAuth();

      const updatedUser = body?.user;
      if (updatedUser) {
        const nextProfile = {
          username: updatedUser.username ?? profile.username,
          displayName: updatedUser.displayName ?? profile.displayName,
          institution: updatedUser.institution ?? profile.institution,
          institutionVisibility: normalizeProfileFieldVisibility(
            updatedUser.institutionVisibility ?? profile.institutionVisibility,
          ),
          program: updatedUser.program ?? profile.program,
          programVisibility: normalizeProfileFieldVisibility(
            updatedUser.programVisibility ?? profile.programVisibility,
          ),
          profilePictureUrl:
            updatedUser.profilePicture ??
            updatedUser.profilePictureUrl ??
            profile.profilePictureUrl,
          profileBackground:
            updatedUser.profileBackground ?? profile.profileBackground,
        };
        setProfile(nextProfile);
        setInitialProfile(nextProfile);
        setFetchedUsername(updatedUser.username ?? trimmedUsername);
      } else {
        setInitialProfile((previous) =>
          previous
            ? {
                ...previous,
                username: profile.username,
                displayName: profile.displayName,
                institution: profile.institution,
                institutionVisibility: profile.institutionVisibility,
                program: profile.program,
                programVisibility: profile.programVisibility,
                profileBackground: profile.profileBackground,
              }
            : previous,
        );
        setFetchedUsername(trimmedUsername);
      }

      setProfilePictureFile(null);
      setProfilePicturePreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return "";
      });
      setProfileBackgroundFile(null);
      setProfileBackgroundPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return "";
      });
      setSuccessMessage("Profile updated successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      console.error("Failed to save profile", err);
    } finally {
      setIsSubmitChecking(false);
      setIsSaving(false);
    }
  };

  const handleProfileBackgroundButtonClick = () => {
    if (!isPaidUser) {
      setError("Custom profile backgrounds are available on Pro and Premium");
      return;
    }

    profileBackgroundInputRef.current?.click();
  };

  const handleProfileBackgroundChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!isPaidUser) {
      setError("Custom profile backgrounds are available on Pro and Premium");
      return;
    }

    const normalizedType = file.type.toLowerCase();
    if (!ALLOWED_PROFILE_BACKGROUND_MIME_TYPES.has(normalizedType)) {
      setError("Unsupported image used");
      return;
    }

    if (file.size > MAX_PROFILE_BACKGROUND_BYTES) {
      setError("Profile background too large");
      return;
    }

    setError("");
    setSuccessMessage("");

    const previewUrl = URL.createObjectURL(file);
    setProfileBackgroundPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return previewUrl;
    });

    void (async () => {
      try {
        const compressed = await compressImageToWebp(file, {
          maxDimension: 1920,
          quality: 0.82,
        });
        setProfileBackgroundFile(compressed);
      } catch {
        setProfileBackgroundFile(file);
      }
    })();
  };

  const handleResetProfileBackground = () => {
    setError("");
    setSuccessMessage("");
    setProfileBackgroundFile(null);
    setProfileBackgroundPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return "";
    });
    setProfile((current) => ({
      ...current,
      profileBackground: DEFAULT_PROFILE_BACKGROUND,
    }));
  };

  const handleRemoveProfilePicture = async () => {
    setIsRemovingProfilePicture(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/graphql/remove-profile-picture", {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Failed to remove profile picture");
      }

      await refreshAuth();

      setProfilePictureFile(null);
      setProfilePicturePreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return "";
      });
      setProfile((current) => ({
        ...current,
        profilePictureUrl: "",
      }));
      setInitialProfile((previous) =>
        previous ? { ...previous, profilePictureUrl: "" } : previous,
      );
      setSuccessMessage("Profile picture removed.");
    } catch (err: unknown) {
      setError("Failed to remove profile picture");
      console.error("Failed to remove profile picture", err);
    } finally {
      setIsRemovingProfilePicture(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-page">
      {successMessage && <Alert type="success" message={successMessage} />}
      {error && <Alert type="error" message={error} />}
      <Header
        title="Profile"
        isLoading={isLoadingAuth || isLoading || isSubmitChecking}
        rightSlot={
          <button
            type="submit"
            form="profile-form"
            disabled={isSaveDisabled}
            className="text-sm font-semibold text-[#E1761F] disabled:text-ink-3"
          >
            Save
          </button>
        }
      />
      {isLoadingAuth ? null : !user ? null : (
        <form
          id="profile-form"
          className="relative z-0 mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 pb-8 pt-24 sm:px-6"
          onSubmit={handleSave}
        >
          <div className="w-full rounded-[20px] bg-[#1D1D1D] px-4 py-4 text-white">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
              Profile
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Update how your account appears.
            </h2>
            <p className="mt-1 text-xs text-white/72">
              Keep your photo, username, and academic details current.
            </p>
          </div>
          <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
            <div
              className={`relative overflow-hidden rounded-[22px] ${profileBackgroundPresentation.className} px-4 py-6`}
              style={profileBackgroundPresentation.style}
            >
              <button
                type="button"
                aria-label="Edit profile background"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm"
                onClick={() => {
                  setError("");
                  setSuccessMessage("");
                  handleProfileBackgroundButtonClick();
                }}
              >
                <Edit2 size={18} color="#555555" />
              </button>
              <input
                ref={profileBackgroundInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleProfileBackgroundChange}
                aria-hidden="true"
              />
              <div className="flex justify-center">
                <ProfilePictureField
                  imageUrl={profilePictureToRender}
                  isRemoving={isRemovingProfilePicture}
                  onError={setError}
                  onClearStatus={() => {
                    setError("");
                    setSuccessMessage("");
                  }}
                  onImageReady={(file, previewUrl) => {
                    setProfilePictureFile(file);
                    setProfilePicturePreviewUrl((previous) => {
                      if (previous) {
                        URL.revokeObjectURL(previous);
                      }
                      return previewUrl;
                    });
                  }}
                  onRemove={() => void handleRemoveProfilePicture()}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  Profile background
                </p>
                <p className="mt-0.5 text-xs text-ink-2">
                  {isPaidUser
                    ? "Tap the pen to upload an image or GIF under 5MB."
                    : "Default background is active. Upgrade to Pro or Premium to upload images or GIFs."}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                  isPaidUser
                    ? "bg-[#FFF1DE] text-[#A95A13]"
                    : "bg-surface-high text-ink-2"
                }`}
              >
                {isPaidUser ? planLabel : "Free"}
              </span>
            </div>
            {isPaidUser &&
              (!isDefaultProfileBackground(profile.profileBackground) ||
                Boolean(profileBackgroundFile)) && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleResetProfileBackground}
                    className="text-sm font-medium text-[#A95A13]"
                  >
                    Use default background
                  </button>
                </div>
              )}
          </div>
          <div className="w-full rounded-[20px] border border-edge bg-surface px-4 py-4">
            <h2 className="text-base font-semibold text-ink">
              Personal Information
            </h2>
            <div className="mt-4 space-y-1">
              <p className="text-ink-2 text-sm font-medium">Username</p>
              <div className="relative">
                <input
                  placeholder={profile.username}
                  value={profile.username}
                  onChange={(e) => {
                    setProfile({ ...profile, username: e.target.value });
                    lastLiveCheckedUsernameRef.current = "";
                  }}
                  disabled={isLoading || isSaving}
                  required
                  minLength={MIN_USERNAME_LENGTH}
                  maxLength={15}
                  className="w-full rounded-2xl border border-edge bg-surface-high px-3 py-3 pr-12 text-sm placeholder:text-ink-3 focus:outline-none"
                />
                {isChecking &&
                profile.username.length >= MIN_USERNAME_LENGTH &&
                profile.username !== initialProfile?.username ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-[#E1761F] border-t-transparent animate-spin"
                  />
                ) : (
                  profile.username.length >= MIN_USERNAME_LENGTH &&
                  !usernameMessage &&
                  profile.username !== fetchedUsername && (
                    <p
                      className={`absolute right-4 top-1/2 -translate-y-1/2 font-bold ${isUsernameAvailable ? "text-green-500" : "text-red-500"}`}
                    >
                      {isUsernameAvailable ? (
                        <IoMdCheckmarkCircle size={24} />
                      ) : (
                        <IoMdCloseCircle size={24} />
                      )}
                    </p>
                  )
                )}
              </div>
              <p className="text-[12px] text-red-500">{usernameMessage}</p>
            </div>
            {textInputs.map((input) => {
              const visibilityKey = input.visibilityKey;
              const visibilityValue = visibilityKey && profile[visibilityKey];

              return (
                <div className="space-y-1 mt-4" key={input.key}>
                  <p className="text-ink-2 text-sm font-medium">
                    {input.label}
                  </p>
                  <div className="relative">
                    <input
                      placeholder={input.value}
                      value={input.value}
                      onChange={input.onchange}
                      disabled={isLoading || isSaving}
                      required={!input.optional}
                      minLength={
                        input.optional && input.value.trim().length === 0
                          ? undefined
                          : input.minLength
                      }
                      maxLength={input.maxLength}
                      className={`w-full rounded-2xl border border-edge bg-surface-high px-3 py-3 text-sm placeholder:text-ink-3 focus:outline-none ${visibilityKey ? "pr-12" : ""}`}
                    />
                    {visibilityKey && (
                      <button
                        type="button"
                        aria-label={`${input.label} visibility: ${visibilityValue === "everyone" ? "Everyone" : "Only you"}`}
                        title={
                          visibilityValue === "everyone"
                            ? `Hide ${input.label.toLowerCase()} from your profile`
                            : `Show ${input.label.toLowerCase()} to everyone`
                        }
                        onClick={() =>
                          setProfile((current) => ({
                            ...current,
                            [visibilityKey]:
                              current[visibilityKey] === "everyone"
                                ? "only_you"
                                : "everyone",
                          }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#A95A13] transition hover:bg-black/5"
                      >
                        {visibilityValue === "everyone" ? (
                          <Eye size={18} color="#A95A13" variant="Bulk" />
                        ) : (
                          <EyeSlash size={18} color="#A95A13" variant="Bulk" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </form>
      )}
    </div>
  );
}
