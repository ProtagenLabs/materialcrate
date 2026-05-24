import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { ArrowLeft2, Eye, EyeSlash } from "iconsax-react-nativejs";
import { gql, WEB_URL, apiUrl } from "@/lib/api";
import { getAuth, clearAuth } from "@/lib/auth-store";
import { hasPaidSubscription } from "@/lib/subscription";

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const ME_QUERY = `
  query AccountSettingsMe {
    me {
      id
      email
      pendingEmail
      createdAt
      subscriptionPlan
      subscriptionStartedAt
      subscriptionEndsAt
      pendingSubscriptionPlan
      pendingSubscriptionAction
      pendingSubscriptionEffectiveAt
    }
  }
`;

const REQUEST_EMAIL_CHANGE_MUTATION = `
  mutation RequestEmailChange($newEmail: String!) {
    requestEmailChange(newEmail: $newEmail)
  }
`;

const CHANGE_PASSWORD_MUTATION = `
  mutation ChangePassword($currentPassword: String, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

const DELETE_ACCOUNT_MUTATION = `
  mutation DeleteMyAccount {
    deleteMyAccount
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Me = {
  id: string;
  email: string;
  pendingEmail?: string | null;
  createdAt: string;
  subscriptionPlan: string;
  subscriptionStartedAt?: string | null;
  subscriptionEndsAt?: string | null;
  pendingSubscriptionPlan?: string | null;
  pendingSubscriptionAction?: string | null;
  pendingSubscriptionEffectiveAt?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const planLabel = (plan: string) => {
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return "Free";
};

const getPendingSubscriptionSummary = (me: Me | null): string | null => {
  if (!me) return null;
  const { pendingSubscriptionAction, pendingSubscriptionPlan, pendingSubscriptionEffectiveAt } = me;
  if (!pendingSubscriptionAction && !pendingSubscriptionPlan) return null;

  const when = pendingSubscriptionEffectiveAt
    ? ` on ${formatDate(pendingSubscriptionEffectiveAt)}`
    : "";

  if (
    pendingSubscriptionAction === "cancel" ||
    pendingSubscriptionPlan === "free"
  ) {
    return `Cancellation pending${when}`;
  }
  if (pendingSubscriptionPlan) {
    return `${planLabel(pendingSubscriptionPlan)} plan pending${when}`;
  }
  return `Plan change pending${when}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AccountSettings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");

  // Email change modal
  const [emailModal, setEmailModal] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState("");

  // Password change form
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const fetchMe = useCallback(() => {
    const { token } = getAuth();
    gql<{ me: Me }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => setMe(d.me))
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMe();
    }, [fetchMe]),
  );

  // ---------------------------------------------------------------------------
  // Email change
  // ---------------------------------------------------------------------------
  const handleOpenEmailModal = () => {
    setNewEmailInput(me?.pendingEmail ?? me?.email ?? "");
    setEmailChangeError("");
    setEmailModal(true);
  };

  const handleRequestEmailChange = async () => {
    const next = newEmailInput.trim().toLowerCase();
    if (!next) {
      setEmailChangeError("Email is required.");
      return;
    }
    if (!EMAIL_REGEX.test(next)) {
      setEmailChangeError("Enter a valid email address.");
      return;
    }
    if (next === (me?.email ?? "").toLowerCase()) {
      setEmailChangeError("Enter a different email address.");
      return;
    }

    const { token } = getAuth();
    setIsRequestingEmailChange(true);
    setEmailChangeError("");
    try {
      await gql(
        REQUEST_EMAIL_CHANGE_MUTATION,
        { newEmail: next },
        token ?? undefined,
      );
      setMe((prev) => (prev ? { ...prev, pendingEmail: next } : prev));
      setEmailModal(false);
      setNewEmailInput("");
      router.push({
        pathname: "/settings/verify-email",
        params: { pendingEmail: next },
      } as never);
    } catch (e) {
      setEmailChangeError(
        e instanceof Error ? e.message : "Failed to start email change.",
      );
    } finally {
      setIsRequestingEmailChange(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Password change
  // ---------------------------------------------------------------------------
  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from current password.");
      return;
    }
    const { token } = getAuth();
    setIsSavingPassword(true);
    try {
      await gql(
        CHANGE_PASSWORD_MUTATION,
        { currentPassword: currentPassword || undefined, newPassword },
        token ?? undefined,
      );
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password changed", "Your password has been updated.");
    } catch (e) {
      setPasswordError(
        e instanceof Error ? e.message : "Failed to change password.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete account
  // ---------------------------------------------------------------------------
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "Your account will be scheduled for deletion. You have 30 days to restore it before it's permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { token } = getAuth();
            try {
              await gql(DELETE_ACCOUNT_MUTATION, {}, token ?? undefined);
              clearAuth();
              router.replace("/(auth)/login" as never);
            } catch (e) {
              Alert.alert(
                "Error",
                e instanceof Error
                  ? e.message
                  : "Failed to delete account.",
              );
            }
          },
        },
      ],
    );
  };

  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);

  const handleManageBilling = async () => {
    const { token } = getAuth();
    setIsOpeningBillingPortal(true);
    try {
      const res = await fetch(apiUrl("/billing/portal"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      const url = body?.url?.trim();
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Could not open billing portal. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Could not open billing portal. Please try again.");
    } finally {
      setIsOpeningBillingPortal(false);
    }
  };

  const pendingSubscriptionSummary = getPendingSubscriptionSummary(me);
  const isPaid = hasPaidSubscription(me?.subscriptionPlan);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Success banner */}
      {successMessage ? (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>{successMessage}</Text>
          <TouchableOpacity
            onPress={() => setSuccessMessage("")}
            hitSlop={8}
          >
            <Text style={styles.successBannerDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1761F" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Pending email verification banner */}
          {me?.pendingEmail ? (
            <View style={styles.pendingEmailBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingEmailTitle}>
                  Verification pending for {me.pendingEmail}
                </Text>
                <Text style={styles.pendingEmailNote}>
                  Your sign-in email won{"'"}t change until the code is confirmed.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/settings/verify-email",
                    params: { pendingEmail: me.pendingEmail ?? "" },
                  } as never)
                }
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={styles.pendingEmailAction}>Verify →</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Account Details */}
          <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>
          <View style={styles.card}>
            <TouchableOpacity
              onPress={handleOpenEmailModal}
              activeOpacity={0.7}
            >
              <InfoRow
                label="Email"
                value={me?.email ?? "—"}
                tappable
              />
            </TouchableOpacity>
            <View style={styles.divider} />
            <InfoRow
              label="Date joined"
              value={me?.createdAt ? formatDate(me.createdAt) : "—"}
            />
          </View>

          {/* Plan */}
          <Text style={styles.sectionLabel}>PLAN</Text>
          <View style={styles.card}>
            <InfoRow
              label="Subscription"
              value={planLabel(me?.subscriptionPlan ?? "free")}
            />
            {me?.subscriptionStartedAt ? (
              <>
                <View style={styles.divider} />
                <InfoRow
                  label="Started"
                  value={formatDate(me.subscriptionStartedAt)}
                />
              </>
            ) : null}
            {me?.subscriptionEndsAt ? (
              <>
                <View style={styles.divider} />
                <InfoRow
                  label="Renews"
                  value={formatDate(me.subscriptionEndsAt)}
                />
              </>
            ) : null}
          </View>

          {/* Billing */}
          <Text style={styles.sectionLabel}>BILLING</Text>
          <View style={styles.card}>
            <View style={styles.billingBody}>
              <Text style={styles.billingTitle}>
                {isPaid ? "Manage subscription" : "Upgrade your plan"}
              </Text>
              <Text style={styles.billingNote}>
                Billing, invoices, and cancellations are handled through Gumroad.
              </Text>

              {pendingSubscriptionSummary ? (
                <View style={styles.pendingPlanBox}>
                  <Text style={styles.pendingPlanText}>
                    {pendingSubscriptionSummary}
                  </Text>
                </View>
              ) : null}

              <View style={styles.billingBtns}>
                {isPaid ? (
                  <TouchableOpacity
                    style={[
                      styles.billingBtnPrimary,
                      isOpeningBillingPortal && { opacity: 0.6 },
                    ]}
                    onPress={() => void handleManageBilling()}
                    disabled={isOpeningBillingPortal}
                    activeOpacity={0.8}
                  >
                    {isOpeningBillingPortal ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.billingBtnPrimaryText}>
                        Manage Billing
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.billingBtnSecondary}
                  onPress={() =>
                    void Linking.openURL(`${WEB_URL}/plans`)
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.billingBtnSecondaryText}>
                    {isPaid ? "Change plan" : "View plans"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Password */}
          <Text style={styles.sectionLabel}>SECURITY</Text>
          <View style={styles.card}>
            {!showPasswordForm ? (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setShowPasswordForm(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.actionRowText}>Change password</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.passwordForm}>
                <Text style={styles.formLabel}>Current password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrent}
                    placeholder="Current password"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowCurrent((v) => !v)}
                    hitSlop={8}
                  >
                    {showCurrent ? (
                      <EyeSlash size={18} color="#6B7280" variant="Linear" />
                    ) : (
                      <Eye size={18} color="#6B7280" variant="Linear" />
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={[styles.formLabel, { marginTop: 12 }]}>
                  New password
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNew}
                    placeholder="New password (min 8 chars)"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNew((v) => !v)}
                    hitSlop={8}
                  >
                    {showNew ? (
                      <EyeSlash size={18} color="#6B7280" variant="Linear" />
                    ) : (
                      <Eye size={18} color="#6B7280" variant="Linear" />
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={[styles.formLabel, { marginTop: 12 }]}>
                  Confirm new password
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    placeholder="Confirm new password"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirm((v) => !v)}
                    hitSlop={8}
                  >
                    {showConfirm ? (
                      <EyeSlash size={18} color="#6B7280" variant="Linear" />
                    ) : (
                      <Eye size={18} color="#6B7280" variant="Linear" />
                    )}
                  </TouchableOpacity>
                </View>

                {passwordError ? (
                  <Text style={styles.errorText}>{passwordError}</Text>
                ) : null}

                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordError("");
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      isSavingPassword && styles.saveBtnDisabled,
                    ]}
                    onPress={() => void handleChangePassword()}
                    disabled={isSavingPassword}
                    activeOpacity={0.8}
                  >
                    {isSavingPassword ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Danger zone */}
          <Text style={styles.sectionLabel}>DANGER ZONE</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionRowText, { color: "#DC2626" }]}>
                Delete account
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dangerNote}>
            Deleting your account schedules it for removal. You have 30 days to
            restore it before all data is permanently deleted.
          </Text>
        </ScrollView>
      )}

      {/* Email change modal */}
      <Modal
        visible={emailModal}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEmailModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKav}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Change Email</Text>
              <Text style={styles.modalSubtitle}>
                Enter your new email address. We{"'"}ll send a verification code to
                confirm.
              </Text>

              <TextInput
                style={[
                  styles.modalInput,
                  emailChangeError ? styles.modalInputError : null,
                ]}
                value={newEmailInput}
                onChangeText={(t) => {
                  setNewEmailInput(t);
                  setEmailChangeError("");
                }}
                placeholder="name@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void handleRequestEmailChange()}
              />

              {emailChangeError ? (
                <Text style={styles.modalErrorText}>{emailChangeError}</Text>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setEmailModal(false);
                    setNewEmailInput("");
                    setEmailChangeError("");
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    isRequestingEmailChange && styles.modalConfirmBtnDisabled,
                  ]}
                  onPress={() => void handleRequestEmailChange()}
                  disabled={isRequestingEmailChange}
                  activeOpacity={0.8}
                >
                  {isRequestingEmailChange ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmBtnText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// InfoRow
// ---------------------------------------------------------------------------
function InfoRow({
  label,
  value,
  accent,
  tappable,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tappable?: boolean;
}) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text
        style={[
          infoStyles.value,
          accent && infoStyles.accent,
          tappable && infoStyles.tappable,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  label: { fontSize: 14, color: "#6B7280" },
  value: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111111",
    flex: 1,
    textAlign: "right",
  },
  accent: { color: "#E1761F" },
  tappable: { color: "#E1761F" },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: { fontSize: 17, fontWeight: "600", color: "#111111" },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  successBannerText: { fontSize: 13, color: "#16A34A", flex: 1 },
  successBannerDismiss: { fontSize: 14, color: "#6B7280" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#9CA3AF",
    marginBottom: 8,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 16,
  },

  pendingEmailBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF7ED",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  pendingEmailTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A15D16",
    marginBottom: 2,
  },
  pendingEmailNote: { fontSize: 12, color: "#8A6A44", lineHeight: 18 },
  pendingEmailAction: {
    fontSize: 13,
    fontWeight: "700",
    color: "#A15D16",
  },

  billingBody: { padding: 16 },
  billingTitle: { fontSize: 14, fontWeight: "600", color: "#111111" },
  billingNote: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
    marginTop: 4,
  },
  pendingPlanBox: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  pendingPlanText: { fontSize: 12, color: "#A15D16", fontWeight: "500" },
  billingBtns: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  billingBtnPrimary: {
    borderRadius: 20,
    backgroundColor: "#111111",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  billingBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  billingBtnSecondary: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  billingBtnSecondaryText: { fontSize: 13, fontWeight: "500", color: "#111111" },

  actionRow: { paddingHorizontal: 16, paddingVertical: 16 },
  actionRowText: { fontSize: 15, fontWeight: "500", color: "#E1761F" },

  passwordForm: { padding: 16, gap: 4 },
  formLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FAFAF8",
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#111111" },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 8 },
  formButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 11,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "500", color: "#6B7280" },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#111111",
    paddingVertical: 11,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#9CA3AF" },
  saveBtnText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },

  dangerNote: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    paddingHorizontal: 4,
    marginTop: 8,
  },

  // Email change modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalKav: { justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 0,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111111",
    backgroundColor: "#FAFAF8",
    marginBottom: 4,
  },
  modalInputError: { borderColor: "#FCA5A5" },
  modalErrorText: { fontSize: 12, color: "#DC2626", marginBottom: 8 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelBtnText: { fontSize: 14, fontWeight: "500", color: "#6B7280" },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#111111",
    paddingVertical: 13,
    alignItems: "center",
  },
  modalConfirmBtnDisabled: { backgroundColor: "#9CA3AF" },
  modalConfirmBtnText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
});
