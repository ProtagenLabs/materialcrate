import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { gql, GRAPHQL_URL } from "@/lib/api";

const BRAND = "#E1761F";
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const RESERVED_USERNAMES = new Set(["deleted", "disabled"]);

const Q_EMAIL_AVAILABLE = `query EmailAvailable($email: String!) { emailAvailable(email: $email) }`;
const Q_USERNAME_AVAILABLE = `query UsernameAvailable($username: String!) { usernameAvailable(username: $username) }`;
const M_SIGNUP = `
  mutation Signup(
    $email: String! $password: String! $username: String!
    $displayName: String!
  ) {
    signup(email: $email, password: $password, username: $username,
           displayName: $displayName) {
      token
    }
  }
`;
const M_VERIFY_EMAIL = `
  mutation VerifyEmailCode($email: String!, $code: String!) {
    verifyEmailCode(email: $email, code: $code)
  }
`;
const M_RESEND_VERIFICATION = `
  mutation ResendVerificationEmail($email: String!) {
    resendVerificationEmail(email: $email)
  }
`;

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ color: ok ? "#22c55e" : "#999", fontSize: 12 }}>
        {ok ? "✔" : "•"}
      </Text>
      <Text style={{ color: ok ? "#22c55e" : "#999", fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

const TITLES: Record<number, string> = {
  1: "Let's get started",
  2: "Create Password",
  3: "Create your username",
  4: "Enter your display name",
};

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    verify?: string;
    verificationDeadline?: string;
  }>();

  const isVerifyOnly = params.verify === "1";

  const [step, setStep] = useState(() => (isVerifyOnly ? 7 : 1));
  const [email, setEmail] = useState(() =>
    isVerifyOnly ? (params.email ?? "") : "",
  );
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [usernameMsg, setUsernameMsg] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [checkingUsername, setCheckingUsername] = useState(false);
  const lastCheckedRef = useRef("");

  const [code, setCode] = useState(["", "", "", ""]);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);
  const codeRefs = useRef<(TextInput | null)[]>([null, null, null, null]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const isValidPassword = hasMinLength && hasNumber && hasUppercase;

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameMsg("");
      setUsernameAvailable(null);
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameMsg(
        "Username may only contain letters, numbers, and underscores.",
      );
      setUsernameAvailable(null);
      return;
    }
    if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
      setUsernameMsg("This username is reserved.");
      setUsernameAvailable(null);
      return;
    }
    if (trimmed === lastCheckedRef.current) {
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await gql<{ usernameAvailable: boolean }>(
          Q_USERNAME_AVAILABLE,
          { username: trimmed },
          undefined,
          ctrl.signal,
        );
        lastCheckedRef.current = trimmed;
        setUsernameAvailable(data.usernameAvailable);
        setUsernameMsg("");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [username]);

  const handleGoogleAuth = async () => {
    await WebBrowser.openBrowserAsync(
      `${GRAPHQL_URL.replace("/graphql", "")}/api/auth/social/google?mode=register`,
    );
  };

  const handleEmailNext = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await gql<{ emailAvailable: boolean }>(Q_EMAIL_AVAILABLE, {
        email: email.trim(),
      });
      if (!data.emailAvailable) {
        setError("Account already exists with this email.");
        return;
      }
      setStep(2);
    } catch {
      setError("Could not verify this email");
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameNext = async () => {
    const trimmed = username.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameMsg(
        "Username may only contain letters, numbers, and underscores.",
      );
      return;
    }
    setCheckingUsername(true);
    try {
      const data = await gql<{ usernameAvailable: boolean }>(
        Q_USERNAME_AVAILABLE,
        { username: trimmed },
      );
      if (!data.usernameAvailable) {
        setUsernameAvailable(false);
        return;
      }
      lastCheckedRef.current = trimmed;
      setUsername(trimmed);
      setStep(4);
    } catch {
      setUsernameMsg("Could not check username availability.");
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await gql(M_SIGNUP, { email, password, username, displayName });
      setStep(7);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Oops, something went wrong :-(",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 3) codeRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 4) return;
    setLoading(true);
    setError(null);
    setVerifyStatus(null);
    try {
      await gql(M_VERIFY_EMAIL, { email, code: fullCode });
      router.replace("/(auth)/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setVerifyStatus(null);
    try {
      await gql(M_RESEND_VERIFICATION, { email });
      setCode(["", "", "", ""]);
      codeRefs.current[0]?.focus();
      setVerifyStatus("A new verification code was sent.");
    } catch {
      setError("Failed to resend verification code");
    } finally {
      setLoading(false);
    }
  };

  const canGoBack = !isVerifyOnly && step > 1 && step !== 7;

  const isUsernameNextDisabled =
    !username.trim() ||
    checkingUsername ||
    username.length < 3 ||
    usernameMsg !== "" ||
    usernameAvailable === false;

  const deadlineLabel = params.verificationDeadline
    ? new Date(params.verificationDeadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          {canGoBack && (
            <TouchableOpacity
              onPress={() => setStep(step - 1)}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={24} color="#111" />
            </TouchableOpacity>
          )}
        </View>

        {isVerifyOnly && deadlineLabel && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Your account will be permanently deleted on{" "}
              <Text style={{ fontWeight: "700" }}>{deadlineLabel}</Text> if you
              don't verify your email.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          {step !== 7 && (
            <View style={styles.header}>
              <Image
                source={require("@/assets/images/logo.png")}
                style={styles.logo}
              />
              <Text style={styles.title}>{TITLES[step]}</Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === 1 && (
            <View style={styles.content}>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={handleGoogleAuth}
              >
                <Text style={styles.socialBtnText}>Continue with Google</Text>
                <Ionicons name="logo-google" size={20} color="#111" />
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH EMAIL</Text>
                <View style={styles.dividerLine} />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.switchText}>
                {"Already have an account? "}
                <Text
                  style={styles.switchLink}
                  onPress={() => router.replace("/(auth)/login")}
                >
                  Sign in
                </Text>
              </Text>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (!isValidEmail || loading) && styles.actionBtnDisabled,
                ]}
                onPress={handleEmailNext}
                disabled={!isValidEmail || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      !isValidEmail && styles.actionBtnTextDisabled,
                    ]}
                  >
                    NEXT
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={styles.content}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#aaa"
              />
              <View style={styles.rules}>
                <Rule ok={hasMinLength} text="At least 8 characters" />
                <Rule ok={hasNumber} text="At least one number" />
                <Rule ok={hasUppercase} text="At least one uppercase letter" />
              </View>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  !isValidPassword && styles.actionBtnDisabled,
                ]}
                onPress={() => setStep(3)}
                disabled={!isValidPassword}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    !isValidPassword && styles.actionBtnTextDisabled,
                  ]}
                >
                  NEXT
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View style={styles.content}>
              <Text style={styles.label}>USERNAME</Text>
              <View>
                <TextInput
                  style={[styles.input, { paddingRight: 48 }]}
                  placeholder="e.g. bookworm"
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    lastCheckedRef.current = "";
                    setUsernameAvailable(null);
                    setUsernameMsg("");
                  }}
                  autoCapitalize="none"
                  placeholderTextColor="#aaa"
                />
                <View style={styles.inputIconWrapper}>
                  {checkingUsername && username.length >= 3 ? (
                    <ActivityIndicator color={BRAND} size="small" />
                  ) : username.length >= 3 && !usernameMsg ? (
                    <Ionicons
                      name={
                        usernameAvailable ? "checkmark-circle" : "close-circle"
                      }
                      size={22}
                      color={usernameAvailable ? "#22c55e" : "#ef4444"}
                    />
                  ) : null}
                </View>
              </View>
              {usernameMsg ? (
                <Text style={styles.fieldError}>{usernameMsg}</Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  isUsernameNextDisabled && styles.actionBtnDisabled,
                ]}
                onPress={handleUsernameNext}
                disabled={isUsernameNextDisabled}
              >
                {checkingUsername ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      isUsernameNextDisabled && styles.actionBtnTextDisabled,
                    ]}
                  >
                    NEXT
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 4 && (
            <View style={styles.content}>
              <Text style={styles.label}>DISPLAY NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Doe"
                value={displayName}
                onChangeText={setDisplayName}
                placeholderTextColor="#aaa"
                maxLength={30}
              />
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (displayName.trim().length < 2 || loading) &&
                    styles.actionBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={displayName.trim().length < 2 || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      displayName.trim().length < 2 &&
                        styles.actionBtnTextDisabled,
                    ]}
                  >
                    SUBMIT
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 7 && (
            <View style={styles.verifyContainer}>
              <Text style={styles.verifyOverline}>VERIFICATION</Text>
              <Text style={styles.verifyTitle}>Verify email</Text>
              <Text style={styles.verifyDesc}>
                {"We've sent a verification code to "}
                <Text style={{ fontWeight: "700", color: "#111" }}>
                  {email}
                </Text>
                {". Enter it below to continue."}
              </Text>

              <View style={styles.codeRow}>
                {code.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => {
                      codeRefs.current[i] = el;
                    }}
                    style={styles.codeInput}
                    value={digit}
                    onChangeText={(v) => handleCodeChange(v, i)}
                    onKeyPress={({ nativeEvent }) =>
                      handleCodeKeyPress(nativeEvent.key, i)
                    }
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    placeholderTextColor="#ccc"
                  />
                ))}
              </View>

              {verifyStatus ? (
                <Text style={styles.verifySuccess}>{verifyStatus}</Text>
              ) : null}
              {error ? <Text style={styles.fieldError}>{error}</Text> : null}

              <Text style={styles.resendText}>
                {"Didn't receive it? "}
                <Text style={styles.resendLink} onPress={handleResend}>
                  Resend code
                </Text>
              </Text>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (code.some((d) => d === "") || loading) &&
                    styles.actionBtnDisabled,
                ]}
                onPress={handleVerify}
                disabled={code.some((d) => d === "") || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>VERIFY</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F1EE" },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 16 },
  topBar: { height: 40, justifyContent: "center", marginBottom: 4 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  warningBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningText: { color: "#92400E", fontSize: 13, lineHeight: 19 },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  header: { alignItems: "center", gap: 16, marginTop: 8, marginBottom: 28 },
  logo: { width: 50, height: 50, borderRadius: 12 },
  title: {
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    color: "#111",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#B91C1C", fontSize: 14 },
  content: { flex: 1 },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  socialBtnText: { fontSize: 15, fontWeight: "500", color: "#111" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#D5D5D5" },
  dividerText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#999",
    letterSpacing: 1.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: "#F8F8F6",
    color: "#111",
  },
  inputIconWrapper: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 8 },
  rules: { marginTop: 12, gap: 6 },
  switchText: { fontSize: 14, color: "#555", marginTop: 10 },
  switchLink: { fontWeight: "700", color: "#111" },
  fieldError: { color: "#ef4444", fontSize: 12, marginTop: 6 },
  actionBtn: {
    backgroundColor: BRAND,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  actionBtnDisabled: { backgroundColor: "#EBEBEB" },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: 1,
  },
  actionBtnTextDisabled: { color: "#aaa" },
  verifyContainer: { flex: 1, alignItems: "center", paddingTop: 24 },
  verifyOverline: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
    letterSpacing: 3,
    marginBottom: 12,
  },
  verifyTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
  },
  verifyDesc: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  codeRow: { flexDirection: "row", gap: 12 },
  codeInput: {
    width: 56,
    height: 64,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 16,
    fontSize: 24,
    fontWeight: "600",
    color: "#111",
    backgroundColor: "#F8F8F6",
  },
  verifySuccess: { color: "#16a34a", fontSize: 13, marginTop: 12 },
  resendText: { fontSize: 14, color: "#666", marginTop: 20 },
  resendLink: {
    color: "#A15D16",
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});
