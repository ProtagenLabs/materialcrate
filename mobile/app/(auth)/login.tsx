import React, { useState } from "react";
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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { GRAPHQL_URL, gql } from "@/lib/api";
import { setAuth } from "@/lib/auth-store";

const BRAND = "#E1761F";

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      restoreRequired
      restoreDeadline
    }
  }
`;

const RESTORE_MUTATION = `
  mutation RestoreDeletedAccount {
    restoreDeletedAccount { id }
  }
`;

function formatRestoreDeadline(value?: string | null) {
  if (!value) return "within 30 days";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "within 30 days";
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleGoogleAuth = async () => {
    await WebBrowser.openBrowserAsync(
      `${GRAPHQL_URL.replace("/graphql", "")}/api/auth/social/google?mode=login`,
    );
  };

  const handleRestore = (
    restoreToken: string,
    restoreDeadline?: string | null,
  ) => {
    Alert.alert(
      "Restore account?",
      `This account is currently deleted. If you continue, it will be restored and available again. You can restore it until ${formatRestoreDeadline(restoreDeadline)}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore account",
          onPress: async () => {
            setLoading(true);
            setError(null);
            try {
              await gql(RESTORE_MUTATION, {}, restoreToken);
              setAuth(restoreToken);
              router.replace("/(tabs)");
            } catch {
              setError("Failed to restore account");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: LOGIN_MUTATION,
          variables: { email, password },
        }),
      });
      const json = await res.json();

      if (json.errors?.length) {
        const firstError = json.errors[0];

        // Email not verified — send to verification step
        if (firstError?.extensions?.code === "EMAIL_NOT_VERIFIED") {
          router.push({
            pathname: "/(auth)/register",
            params: {
              email,
              verify: "1",
              verificationDeadline:
                firstError.extensions.verificationDeadline ?? "",
            },
          } as never);
          return;
        }

        const msg = firstError?.message ?? "Login failed";
        setError(
          msg === "Invalid credentials" ? "Incorrect email or password" : msg,
        );
        return;
      }

      const { token, restoreRequired, restoreDeadline } = json.data.login;

      if (restoreRequired) {
        handleRestore(token, restoreDeadline);
        return;
      }

      setAuth(token);
      router.replace("/(tabs)");
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

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
          {step !== 1 && (
            <TouchableOpacity
              onPress={() => setStep(step - 1)}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={24} color="#111" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.header}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.logo}
            />
            <Text style={styles.title}>
              {step === 1 ? "Welcome Back" : "Enter your password"}
            </Text>
          </View>

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
                {"Don't have an account? "}
                <Text
                  style={styles.switchLink}
                  onPress={() => router.replace("/(auth)/register")}
                >
                  Sign up
                </Text>
              </Text>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  !isValidEmail && styles.actionBtnDisabled,
                ]}
                onPress={() => setStep(2)}
                disabled={!isValidEmail}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    !isValidEmail && styles.actionBtnTextDisabled,
                  ]}
                >
                  NEXT
                </Text>
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

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (!password || loading) && styles.actionBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!password || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      !password && styles.actionBtnTextDisabled,
                    ]}
                  >
                    SIGN IN
                  </Text>
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
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 8 },
  switchText: { fontSize: 14, color: "#555", marginTop: 10 },
  switchLink: { fontWeight: "700", color: "#111" },
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
});
