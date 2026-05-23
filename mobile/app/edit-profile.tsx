import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated,
  Image,
  ImageBackground,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft2,
  Eye,
  EyeSlash,
  Camera,
  Trash,
  Edit2,
} from "iconsax-react-nativejs";
import * as DocumentPicker from "expo-document-picker";
import { File as FSFile, Paths } from "expo-file-system";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";
import { hasPaidSubscription } from "@/lib/subscription";
import ActionButton from "@/components/ActionButton";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const MIN_USERNAME_LENGTH = 3;
const SECTION_COUNT = 5;
const DEFAULT_PROFILE_BACKGROUND = "bg-linear-to-br from-[#E1761F] via-[#ffecdc] to-stone-200";

function isDefaultBackground(v?: string | null) {
  return !v || v === DEFAULT_PROFILE_BACKGROUND;
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const ME_QUERY = `
  query EditProfileMe {
    me {
      id username displayName profilePicture profileBackground
      institution institutionVisibility program programVisibility
      subscriptionPlan
    }
  }
`;

const USERNAME_AVAILABLE_QUERY = `
  query UsernameAvailable($username: String!) {
    usernameAvailable(username: $username)
  }
`;

const COMPLETE_PROFILE_MUTATION = `
  mutation CompleteProfile(
    $username: String!
    $displayName: String!
    $institution: String!
    $institutionVisibility: String
    $program: String
    $programVisibility: String
    $profileBackground: String
    $profilePictureFileBase64: String
    $profilePictureFileName: String
    $profilePictureMimeType: String
    $profileBackgroundFileBase64: String
    $profileBackgroundFileName: String
    $profileBackgroundMimeType: String
  ) {
    completeProfile(
      username: $username
      displayName: $displayName
      institution: $institution
      institutionVisibility: $institutionVisibility
      program: $program
      programVisibility: $programVisibility
      profileBackground: $profileBackground
      profilePictureFileBase64: $profilePictureFileBase64
      profilePictureFileName: $profilePictureFileName
      profilePictureMimeType: $profilePictureMimeType
      profileBackgroundFileBase64: $profileBackgroundFileBase64
      profileBackgroundFileName: $profileBackgroundFileName
      profileBackgroundMimeType: $profileBackgroundMimeType
    ) {
      id username displayName profilePicture profileBackground
      institution institutionVisibility program programVisibility
    }
  }
`;

const REMOVE_PROFILE_PICTURE_MUTATION = `
  mutation RemoveProfilePicture {
    removeProfilePicture
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProfileFieldVisibility = "everyone" | "only_you";

type UserProfile = {
  username: string;
  displayName: string;
  profilePicture: string;
  profileBackground: string;
  institution: string;
  institutionVisibility: ProfileFieldVisibility;
  program: string;
  programVisibility: ProfileFieldVisibility;
  subscriptionPlan: string;
};

type PendingPicture = {
  uri: string;
  name: string;
  mimeType: string;
  base64: string;
};

function normalizeVisibility(value: unknown): ProfileFieldVisibility {
  return String(value || "").trim().toLowerCase() === "everyone"
    ? "everyone"
    : "only_you";
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile>({
    username: "",
    displayName: "",
    profilePicture: "",
    profileBackground: DEFAULT_PROFILE_BACKGROUND,
    institution: "",
    institutionVisibility: "everyone",
    program: "",
    programVisibility: "everyone",
    subscriptionPlan: "free",
  });
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const [fetchedUsername, setFetchedUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Username availability
  const [usernameMessage, setUsernameMessage] = useState("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [isSubmitChecking, setIsSubmitChecking] = useState(false);
  const lastCheckedUsernameRef = useRef("");

  // Profile picture
  const [pendingPicture, setPendingPicture] = useState<PendingPicture | null>(null);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const [isRemovingPicture, setIsRemovingPicture] = useState(false);

  // Profile background
  const [pendingBackground, setPendingBackground] = useState<PendingPicture | null>(null);

  // Alert banner
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertIsError, setAlertIsError] = useState(false);
  const alertAnim = useRef(new Animated.Value(0)).current;

  // Entrance animations
  const sectionAnims = useRef(
    Array.from({ length: SECTION_COUNT }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(24),
    })),
  ).current;

  // ---------------------------------------------------------------------------
  // Entrance animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    Animated.stagger(
      60,
      sectionAnims.map(({ opacity, translateY }) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]),
      ),
    ).start();
  }, []);

  // ---------------------------------------------------------------------------
  // Alert helper
  // ---------------------------------------------------------------------------
  const showAlert = useCallback((message: string, isErr: boolean) => {
    if (isErr) setError(message);
    else setSuccessMessage(message);
    setAlertIsError(isErr);
    setAlertVisible(true);
    alertAnim.setValue(0);
    Animated.timing(alertAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(alertAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setAlertVisible(false);
        if (isErr) setError("");
        else setSuccessMessage("");
      });
    }, 3500);
    return () => clearTimeout(t);
  }, [alertAnim]);

  // ---------------------------------------------------------------------------
  // Load profile
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const { token } = getAuth();
    let cancelled = false;
    setIsLoading(true);

    gql<{ me: UserProfile & { profilePicture?: string } }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => {
        if (cancelled) return;
        const me = d.me;
        const loaded: UserProfile = {
          username: me.username ?? "",
          displayName: me.displayName ?? "",
          profilePicture: me.profilePicture ?? "",
          profileBackground: me.profileBackground ?? DEFAULT_PROFILE_BACKGROUND,
          institution: me.institution ?? "",
          institutionVisibility: normalizeVisibility(me.institutionVisibility),
          program: me.program ?? "",
          programVisibility: normalizeVisibility(me.programVisibility),
          subscriptionPlan: me.subscriptionPlan ?? "free",
        };
        setProfile(loaded);
        setInitialProfile(loaded);
        setFetchedUsername(me.username ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        showAlert(err instanceof Error ? err.message : "Failed to load profile", true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Live username availability check (debounced 500ms)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const trimmed = profile.username.trim();

    if (!trimmed || trimmed.length < MIN_USERNAME_LENGTH) {
      setUsernameMessage("");
      setIsLiveChecking(false);
      return;
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameMessage("Username may only contain letters, numbers, and underscores.");
      setIsLiveChecking(false);
      return;
    }

    // Same as current saved username — no need to check
    if (trimmed === fetchedUsername) {
      setUsernameMessage("");
      setIsLiveChecking(false);
      setIsUsernameAvailable(null);
      return;
    }

    if (trimmed === lastCheckedUsernameRef.current) {
      setIsLiveChecking(false);
      return;
    }

    setIsLiveChecking(true);
    const { token } = getAuth();
    let cancelled = false;

    const timeout = setTimeout(() => {
      gql<{ usernameAvailable: boolean }>(
        USERNAME_AVAILABLE_QUERY,
        { username: trimmed },
        token ?? undefined,
      )
        .then((d) => {
          if (cancelled) return;
          lastCheckedUsernameRef.current = trimmed;
          setIsUsernameAvailable(d.usernameAvailable);
          setUsernameMessage(d.usernameAvailable ? "" : "Username is already taken.");
        })
        .catch(() => {
          if (!cancelled) setUsernameMessage("Could not check username availability.");
        })
        .finally(() => {
          if (!cancelled) setIsLiveChecking(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [profile.username, fetchedUsername]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const hasTextChanges = initialProfile
    ? profile.username.trim() !== initialProfile.username.trim() ||
      profile.displayName.trim() !== initialProfile.displayName.trim() ||
      profile.institution.trim() !== initialProfile.institution.trim() ||
      profile.institutionVisibility !== initialProfile.institutionVisibility ||
      profile.program.trim() !== initialProfile.program.trim() ||
      profile.programVisibility !== initialProfile.programVisibility ||
      profile.profileBackground !== initialProfile.profileBackground
    : false;

  const hasPendingChanges = hasTextChanges || Boolean(pendingPicture) || Boolean(pendingBackground);
  const isPaid = hasPaidSubscription(profile.subscriptionPlan);

  const validationError = (() => {
    const u = profile.username.trim();
    if (!u || u.length < MIN_USERNAME_LENGTH) return "Username too short";
    if (!USERNAME_REGEX.test(u)) return "Invalid username";
    if (isUsernameAvailable === false && u !== fetchedUsername) return "Username taken";
    const dn = profile.displayName.trim();
    if (dn.length < 2) return "Display name too short";
    return "";
  })();

  const isSaveDisabled =
    !hasPendingChanges ||
    Boolean(validationError) ||
    isLoading ||
    isSaving ||
    isSubmitChecking ||
    isLiveChecking;

  // ---------------------------------------------------------------------------
  // Pick profile picture
  // ---------------------------------------------------------------------------
  const handlePickPicture = async () => {
    setIsPhotoSheetOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let readFile = new FSFile(asset.uri);

      if (!asset.uri.startsWith("file://")) {
        const safeName = (asset.name ?? "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
        const dest = new FSFile(Paths.cache, `mc_pfp_${Date.now()}_${safeName}`);
        readFile.copy(dest);
        readFile = dest;
      }

      const base64 = await readFile.base64();
      setPendingPicture({
        uri: asset.uri,
        name: asset.name ?? "photo.jpg",
        mimeType: asset.mimeType ?? "image/jpeg",
        base64,
      });
    } catch (err) {
      showAlert("Could not read the image. Please try again.", true);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove profile picture
  // ---------------------------------------------------------------------------
  const handleRemovePicture = async () => {
    setIsPhotoSheetOpen(false);
    setIsRemovingPicture(true);
    const { token } = getAuth();
    try {
      await gql(REMOVE_PROFILE_PICTURE_MUTATION, {}, token ?? undefined);
      setProfile((c) => ({ ...c, profilePicture: "" }));
      setInitialProfile((c) => (c ? { ...c, profilePicture: "" } : c));
      setPendingPicture(null);
      showAlert("Profile picture removed.", false);
    } catch (err) {
      showAlert("Failed to remove profile picture.", true);
    } finally {
      setIsRemovingPicture(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Pick / reset profile background
  // ---------------------------------------------------------------------------
  const handlePickBackground = async () => {
    if (!isPaid) {
      showAlert("Custom backgrounds are available on Pro and Premium.", true);
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let readFile = new FSFile(asset.uri);

      if (!asset.uri.startsWith("file://")) {
        const safeName = (asset.name ?? "bg.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
        const dest = new FSFile(Paths.cache, `mc_bg_${Date.now()}_${safeName}`);
        readFile.copy(dest);
        readFile = dest;
      }

      const base64 = await readFile.base64();
      setPendingBackground({
        uri: asset.uri,
        name: asset.name ?? "bg.jpg",
        mimeType: asset.mimeType ?? "image/jpeg",
        base64,
      });
    } catch {
      showAlert("Could not read the image. Please try again.", true);
    }
  };

  const handleResetBackground = () => {
    setPendingBackground(null);
    setProfile((c) => ({ ...c, profileBackground: DEFAULT_PROFILE_BACKGROUND }));
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const handleSave = async () => {
    if (isSaveDisabled) return;
    const { token } = getAuth();
    const trimmedUsername = profile.username.trim();

    // Final username check if changed
    if (trimmedUsername !== fetchedUsername) {
      setIsSubmitChecking(true);
      try {
        const d = await gql<{ usernameAvailable: boolean }>(
          USERNAME_AVAILABLE_QUERY,
          { username: trimmedUsername },
          token ?? undefined,
        );
        if (!d.usernameAvailable) {
          setUsernameMessage("Username is already taken.");
          setIsUsernameAvailable(false);
          return;
        }
        lastCheckedUsernameRef.current = trimmedUsername;
        setUsernameMessage("");
      } catch {
        showAlert("Could not verify username. Please try again.", true);
        return;
      } finally {
        setIsSubmitChecking(false);
      }
    }

    setIsSaving(true);
    try {
      const variables: Record<string, string | undefined> = {
        username: trimmedUsername,
        displayName: profile.displayName.trim(),
        institution: profile.institution.trim(),
        institutionVisibility: profile.institutionVisibility,
        program: profile.program.trim() || undefined,
        programVisibility: profile.programVisibility,
      };

      if (pendingPicture) {
        variables.profilePictureFileBase64 = pendingPicture.base64;
        variables.profilePictureFileName = pendingPicture.name;
        variables.profilePictureMimeType = pendingPicture.mimeType;
      }

      if (pendingBackground) {
        variables.profileBackgroundFileBase64 = pendingBackground.base64;
        variables.profileBackgroundFileName = pendingBackground.name;
        variables.profileBackgroundMimeType = pendingBackground.mimeType;
      } else if (initialProfile && profile.profileBackground !== initialProfile.profileBackground) {
        variables.profileBackground = profile.profileBackground;
      }

      const d = await gql<{ completeProfile: UserProfile & { profilePicture?: string } }>(
        COMPLETE_PROFILE_MUTATION,
        variables,
        token ?? undefined,
      );

      const updated = d.completeProfile;
      const next: UserProfile = {
        username: updated.username ?? trimmedUsername,
        displayName: updated.displayName ?? profile.displayName,
        profilePicture: updated.profilePicture ?? profile.profilePicture,
        profileBackground: updated.profileBackground ?? profile.profileBackground,
        institution: updated.institution ?? profile.institution,
        institutionVisibility: normalizeVisibility(updated.institutionVisibility),
        program: updated.program ?? profile.program,
        programVisibility: normalizeVisibility(updated.programVisibility),
        subscriptionPlan: profile.subscriptionPlan,
      };
      setProfile(next);
      setInitialProfile(next);
      setFetchedUsername(next.username);
      setPendingPicture(null);
      setPendingBackground(null);
      showAlert("Profile updated successfully.", false);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : "Failed to save profile.", true);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived avatar source
  // ---------------------------------------------------------------------------
  const avatarUri = pendingPicture?.uri || profile.profilePicture || null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const animatedSection = (index: number, children: React.ReactNode) => (
    <Animated.View
      style={{
        opacity: sectionAnims[index].opacity,
        transform: [{ translateY: sectionAnims[index].translateY }],
      }}
    >
      {children}
    </Animated.View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Alert banner */}
      {alertVisible && (
        <Animated.View
          style={[
            styles.alertBanner,
            alertIsError ? styles.alertError : styles.alertSuccess,
            { opacity: alertAnim, transform: [{ translateY: alertAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.alertText}>{alertIsError ? error : successMessage}</Text>
        </Animated.View>
      )}

      {/* Header */}
      {animatedSection(
        0,
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft2 size={22} color="#111111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={isSaveDisabled}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.saveBtn,
                isSaveDisabled ? styles.saveBtnDisabled : styles.saveBtnActive,
              ]}
            >
              {isSaving || isSubmitChecking ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>,
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Banner + avatar card */}
          {animatedSection(
            1,
            <View style={styles.bannerCard}>
              {/* Banner */}
              {pendingBackground?.uri || !isDefaultBackground(profile.profileBackground) ? (
                <ImageBackground
                  source={{ uri: pendingBackground?.uri ?? profile.profileBackground }}
                  style={styles.banner}
                  resizeMode="cover"
                >
                  <View style={styles.bannerOverlay} pointerEvents="none" />
                  <TouchableOpacity
                    style={styles.bannerEditBtn}
                    onPress={() => void handlePickBackground()}
                    activeOpacity={0.8}
                  >
                    <Edit2 size={16} color="#555555" />
                  </TouchableOpacity>
                </ImageBackground>
              ) : (
                <View style={[styles.banner, styles.bannerDefault]}>
                  <TouchableOpacity
                    style={styles.bannerEditBtn}
                    onPress={() => void handlePickBackground()}
                    activeOpacity={0.8}
                  >
                    <Edit2 size={16} color="#555555" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Avatar overlapping banner */}
              <View style={styles.avatarOverlapRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setIsPhotoSheetOpen(true)}
                  style={styles.avatarWrapper}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>
                        {profile.displayName.charAt(0) || profile.username.charAt(0) || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cameraBadge}>
                    <Camera size={14} color="#ffffff" variant="Bold" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Background meta row */}
              <View style={styles.bannerMetaRow}>
                <View style={styles.flex}>
                  <Text style={styles.bannerMetaLabel}>Profile background</Text>
                  <Text style={styles.bannerMetaHint}>
                    {isPaid
                      ? "Tap the pencil to upload an image."
                      : "Upgrade to Pro or Premium to upload a custom background."}
                  </Text>
                </View>
                <View style={[styles.planPill, isPaid ? styles.planPillPaid : styles.planPillFree]}>
                  <Text style={[styles.planPillText, isPaid ? styles.planPillTextPaid : styles.planPillTextFree]}>
                    {isPaid ? "Pro" : "Free"}
                  </Text>
                </View>
              </View>

              {isPaid && (pendingBackground || !isDefaultBackground(profile.profileBackground)) && (
                <TouchableOpacity
                  style={styles.resetBgBtn}
                  onPress={handleResetBackground}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resetBgText}>Use default background</Text>
                </TouchableOpacity>
              )}
            </View>,
          )}

          {/* Personal Information card */}
          {animatedSection(
            2,
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personal Information</Text>

              {/* Username */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Username</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={profile.username}
                    onChangeText={(v) => {
                      setProfile((c) => ({ ...c, username: v }));
                      lastCheckedUsernameRef.current = "";
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={15}
                    placeholder="username"
                    placeholderTextColor="#9CA3AF"
                    editable={!isLoading && !isSaving}
                  />
                  {isLiveChecking && profile.username.trim() !== fetchedUsername ? (
                    <View style={styles.inputBadge}>
                      <Text style={styles.checkingDot}>•••</Text>
                    </View>
                  ) : isUsernameAvailable === true && profile.username.trim() !== fetchedUsername ? (
                    <View style={[styles.inputBadge, styles.inputBadgeGreen]}>
                      <Text style={styles.inputBadgeText}>✓</Text>
                    </View>
                  ) : isUsernameAvailable === false && profile.username.trim() !== fetchedUsername ? (
                    <View style={[styles.inputBadge, styles.inputBadgeRed]}>
                      <Text style={styles.inputBadgeText}>✕</Text>
                    </View>
                  ) : null}
                </View>
                {Boolean(usernameMessage) && (
                  <Text style={styles.fieldError}>{usernameMessage}</Text>
                )}
              </View>

              {/* Display Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Display Name</Text>
                <TextInput
                  style={styles.input}
                  value={profile.displayName}
                  onChangeText={(v) => setProfile((c) => ({ ...c, displayName: v }))}
                  maxLength={30}
                  placeholder="Your name"
                  placeholderTextColor="#9CA3AF"
                  editable={!isLoading && !isSaving}
                />
              </View>

              {/* Institution */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Institution{" "}
                  <Text style={styles.fieldOptional}>(optional)</Text>
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={profile.institution}
                    onChangeText={(v) => setProfile((c) => ({ ...c, institution: v }))}
                    maxLength={50}
                    placeholder="e.g. MIT"
                    placeholderTextColor="#9CA3AF"
                    editable={!isLoading && !isSaving}
                  />
                  <TouchableOpacity
                    style={styles.visibilityBtn}
                    onPress={() =>
                      setProfile((c) => ({
                        ...c,
                        institutionVisibility:
                          c.institutionVisibility === "everyone" ? "only_you" : "everyone",
                      }))
                    }
                    activeOpacity={0.7}
                  >
                    {profile.institutionVisibility === "everyone" ? (
                      <Eye size={20} color="#A95A13" variant="Bulk" />
                    ) : (
                      <EyeSlash size={20} color="#A95A13" variant="Bulk" />
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.fieldHint}>
                  {profile.institutionVisibility === "everyone"
                    ? "Visible to everyone"
                    : "Only visible to you"}
                </Text>
              </View>

              {/* Program */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Program / Major{" "}
                  <Text style={styles.fieldOptional}>(optional)</Text>
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={profile.program}
                    onChangeText={(v) => setProfile((c) => ({ ...c, program: v }))}
                    maxLength={50}
                    placeholder="e.g. Computer Science"
                    placeholderTextColor="#9CA3AF"
                    editable={!isLoading && !isSaving}
                  />
                  <TouchableOpacity
                    style={styles.visibilityBtn}
                    onPress={() =>
                      setProfile((c) => ({
                        ...c,
                        programVisibility:
                          c.programVisibility === "everyone" ? "only_you" : "everyone",
                      }))
                    }
                    activeOpacity={0.7}
                  >
                    {profile.programVisibility === "everyone" ? (
                      <Eye size={20} color="#A95A13" variant="Bulk" />
                    ) : (
                      <EyeSlash size={20} color="#A95A13" variant="Bulk" />
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.fieldHint}>
                  {profile.programVisibility === "everyone"
                    ? "Visible to everyone"
                    : "Only visible to you"}
                </Text>
              </View>
            </View>,
          )}

          {/* Save button (bottom) */}
          {animatedSection(
            3,
            <View style={styles.saveRow}>
              <ActionButton
                onPress={() => void handleSave()}
                disabled={isSaveDisabled}
                loading={isSaving || isSubmitChecking}
              >
                Save Changes
              </ActionButton>
            </View>,
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Photo action sheet */}
      <Modal
        visible={isPhotoSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPhotoSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setIsPhotoSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetRowDivider]}
              onPress={() => void handlePickPicture()}
              activeOpacity={0.7}
            >
              <Camera size={20} color="#111111" variant="Bold" />
              <Text style={styles.sheetRowLabel}>Choose photo</Text>
            </TouchableOpacity>
            {(profile.profilePicture || pendingPicture) && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => void handleRemovePicture()}
                disabled={isRemovingPicture}
                activeOpacity={0.7}
              >
                <Trash size={20} color="#D12F2F" variant="Bold" />
                <Text style={[styles.sheetRowLabel, styles.sheetRowLabelRed]}>Remove photo</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 48, gap: 16 },

  // Alert
  alertBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  alertError: { backgroundColor: "#D12F2F" },
  alertSuccess: { backgroundColor: "#16A34A" },
  alertText: { color: "#ffffff", fontSize: 14, fontWeight: "500" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#111111" },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  saveBtn: { fontSize: 15, fontWeight: "700" },
  saveBtnActive: { color: "#E1761F" },
  saveBtnDisabled: { color: "#9CA3AF" },

  // Banner card
  bannerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  banner: {
    height: 120,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 10,
  },
  bannerDefault: { backgroundColor: "#FFF0E4" },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  bannerEditBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatarOverlapRow: {
    paddingHorizontal: 16,
    marginTop: -36,
    marginBottom: 8,
  },
  avatarWrapper: { position: "relative", alignSelf: "flex-start" },
  avatar: { width: 80, height: 80, borderRadius: 20, backgroundColor: "#E5E7EB", borderWidth: 3, borderColor: "#ffffff" },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  avatarInitial: { fontSize: 28, fontWeight: "700", color: "#6B7280" },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E1761F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  bannerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bannerMetaLabel: { fontSize: 13, fontWeight: "500", color: "#111111" },
  bannerMetaHint: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  planPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  planPillPaid: { backgroundColor: "#FFF1DE" },
  planPillFree: { backgroundColor: "#F3F4F6" },
  planPillText: { fontSize: 11, fontWeight: "600" },
  planPillTextPaid: { color: "#A95A13" },
  planPillTextFree: { color: "#6B7280" },
  resetBgBtn: { paddingHorizontal: 16, paddingBottom: 14 },
  resetBgText: { fontSize: 13, fontWeight: "500", color: "#A95A13" },

  // Card
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    gap: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#111111", marginBottom: 16 },

  // Fields
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: "#6B7280", marginBottom: 6 },
  fieldOptional: { fontSize: 12, fontWeight: "400", color: "#9CA3AF" },
  fieldError: { fontSize: 12, color: "#D12F2F", marginTop: 4 },
  fieldHint: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: "#111111",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  inputFlex: { flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  // Username availability badge
  inputBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  inputBadgeGreen: { backgroundColor: "#D1FAE5" },
  inputBadgeRed: { backgroundColor: "#FEE2E2" },
  inputBadgeText: { fontSize: 13, fontWeight: "700" },
  checkingDot: { fontSize: 10, color: "#9CA3AF", letterSpacing: 2 },

  // Visibility toggle
  visibilityBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FCDCB0",
  },

  // Save row
  saveRow: { paddingTop: 4 },

  // Photo sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FAFAFA",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    gap: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
  },
  sheetRowDivider: { marginBottom: 4 },
  sheetRowLabel: { fontSize: 15, fontWeight: "500", color: "#111111" },
  sheetRowLabelRed: { color: "#D12F2F" },
});
