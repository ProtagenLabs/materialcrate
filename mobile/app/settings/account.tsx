import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2, Eye, EyeSlash } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth, clearAuth } from "@/lib/auth-store";

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
    }
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

type Me = {
  id: string;
  email: string;
  pendingEmail?: string | null;
  createdAt: string;
  subscriptionPlan: string;
  subscriptionStartedAt?: string | null;
  subscriptionEndsAt?: string | null;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const planLabel = (plan: string) => {
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return "Free";
};

export default function AccountSettings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    const { token } = getAuth();
    gql<{ me: Me }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => setMe(d.me))
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, []);

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
      setPasswordError(e instanceof Error ? e.message : "Failed to change password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

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
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete account.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1761F" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Account Details */}
          <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>
          <View style={styles.card}>
            <InfoRow label="Email" value={me?.email ?? "—"} />
            {me?.pendingEmail ? (
              <>
                <View style={styles.divider} />
                <InfoRow label="Pending email" value={me.pendingEmail} accent />
              </>
            ) : null}
            <View style={styles.divider} />
            <InfoRow label="Date joined" value={me?.createdAt ? formatDate(me.createdAt) : "—"} />
          </View>

          {/* Plan */}
          <Text style={styles.sectionLabel}>PLAN</Text>
          <View style={styles.card}>
            <InfoRow label="Subscription" value={planLabel(me?.subscriptionPlan ?? "free")} />
            {me?.subscriptionStartedAt ? (
              <>
                <View style={styles.divider} />
                <InfoRow label="Started" value={formatDate(me.subscriptionStartedAt)} />
              </>
            ) : null}
            {me?.subscriptionEndsAt ? (
              <>
                <View style={styles.divider} />
                <InfoRow label="Renews" value={formatDate(me.subscriptionEndsAt)} />
              </>
            ) : null}
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
                  <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} hitSlop={8}>
                    {showCurrent ? (
                      <EyeSlash size={18} color="#6B7280" variant="Linear" />
                    ) : (
                      <Eye size={18} color="#6B7280" variant="Linear" />
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={[styles.formLabel, { marginTop: 12 }]}>New password</Text>
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
                  <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                    {showNew ? (
                      <EyeSlash size={18} color="#6B7280" variant="Linear" />
                    ) : (
                      <Eye size={18} color="#6B7280" variant="Linear" />
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={[styles.formLabel, { marginTop: 12 }]}>Confirm new password</Text>
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
                  <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                    {showConfirm ? (
                      <EyeSlash size={18} color="#6B7280" variant="Liberal" />
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
                    style={[styles.saveBtn, isSavingPassword && styles.saveBtnDisabled]}
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
              <Text style={[styles.actionRowText, { color: "#DC2626" }]}>Delete account</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dangerNote}>
            Deleting your account schedules it for removal. You have 30 days to restore it before
            all data is permanently deleted.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, accent && infoStyles.accent]} numberOfLines={1}>
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
  value: { fontSize: 14, fontWeight: "500", color: "#111111", flex: 1, textAlign: "right" },
  accent: { color: "#E1761F" },
});

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

  actionRow: { paddingHorizontal: 16, paddingVertical: 16 },
  actionRowText: { fontSize: 15, fontWeight: "500", color: "#E1761F" },

  passwordForm: { padding: 16, gap: 4 },
  formLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 6 },
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
});
