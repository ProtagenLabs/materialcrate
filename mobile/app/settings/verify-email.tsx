import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft2 } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

const VERIFY_EMAIL_CHANGE = `
  mutation VerifyPendingEmailChange($code: String!) {
    verifyPendingEmailChange(code: $code) {
      id
      email
      pendingEmail
    }
  }
`;

const RESEND_EMAIL_CHANGE = `
  mutation ResendPendingEmailChange {
    resendPendingEmailChange
  }
`;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pendingEmail?: string }>();
  const pendingEmail = params.pendingEmail ?? "";

  const [code, setCode] = useState(["", "", "", ""]);
  const codeRefs = useRef<(TextInput | null)[]>([null, null, null, null]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => codeRefs.current[0]?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleCodeChange = (text: string, idx: number) => {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    setError("");

    if (digit && idx < 3) {
      codeRefs.current[idx + 1]?.focus();
    }

    if (digit && idx === 3) {
      const full = next.join("");
      if (full.length === 4) void handleVerify(full);
    }
  };

  const handleKeyPress = (
    e: { nativeEvent: { key: string } },
    idx: number,
  ) => {
    if (e.nativeEvent.key === "Backspace" && !code[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const codeStr = fullCode ?? code.join("");
    if (codeStr.length < 4) {
      setError("Enter the 4-digit code.");
      return;
    }
    const { token } = getAuth();
    setIsVerifying(true);
    setError("");
    try {
      await gql(VERIFY_EMAIL_CHANGE, { code: codeStr }, token ?? undefined);
      Alert.alert(
        "Email updated",
        "Your email address has been successfully updated.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Invalid code. Please try again.",
      );
      setCode(["", "", "", ""]);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    const { token } = getAuth();
    setIsResending(true);
    setResendSuccess(false);
    try {
      await gql(RESEND_EMAIL_CHANGE, {}, token ?? undefined);
      setResendSuccess(true);
    } catch {
      setError("Failed to resend. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Email</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Confirm your new email</Text>
          <Text style={styles.subtitle}>
            {"Enter the 4-digit code we sent to\n"}
            <Text style={styles.emailHighlight}>{pendingEmail}</Text>
          </Text>

          <View style={styles.codeRow}>
            {code.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(r) => {
                  codeRefs.current[idx] = r;
                }}
                style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
                value={digit}
                onChangeText={(t) => handleCodeChange(t, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                keyboardType="number-pad"
                maxLength={1}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.verifyBtn,
              (isVerifying || code.join("").length < 4) &&
                styles.verifyBtnDisabled,
            ]}
            onPress={() => void handleVerify()}
            disabled={isVerifying || code.join("").length < 4}
            activeOpacity={0.8}
          >
            {isVerifying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyBtnText}>Verify Email</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>{"Didn't receive the code? "}</Text>
            <TouchableOpacity
              onPress={() => void handleResend()}
              disabled={isResending}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.resendBtn,
                  isResending && styles.resendBtnDisabled,
                ]}
              >
                {isResending ? "Sending..." : "Resend"}
              </Text>
            </TouchableOpacity>
          </View>

          {resendSuccess ? (
            <Text style={styles.resendSuccess}>Code resent successfully.</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: { fontSize: 17, fontWeight: "600", color: "#111111" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111111",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  emailHighlight: { fontWeight: "600", color: "#111111" },
  codeRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  codeBox: {
    width: 56,
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    color: "#111111",
    textAlign: "center",
  },
  codeBoxFilled: { borderColor: "#E1761F" },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    textAlign: "center",
    marginBottom: 12,
  },
  verifyBtn: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#111111",
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  verifyBtnDisabled: { backgroundColor: "#9CA3AF" },
  verifyBtnText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  resendRow: { flexDirection: "row", alignItems: "center" },
  resendLabel: { fontSize: 13, color: "#6B7280" },
  resendBtn: { fontSize: 13, fontWeight: "600", color: "#E1761F" },
  resendBtnDisabled: { opacity: 0.5 },
  resendSuccess: {
    fontSize: 12,
    color: "#16A34A",
    marginTop: 8,
    textAlign: "center",
  },
});
