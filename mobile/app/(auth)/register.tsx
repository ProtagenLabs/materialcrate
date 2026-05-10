import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { apiUrl } from '@/lib/api';

const BRAND = '#E1761F';
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const RESERVED_USERNAMES = new Set(['deleted', 'disabled']);

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: ok ? '#22c55e' : '#999', fontSize: 12 }}>
        {ok ? '✔' : '•'}
      </Text>
      <Text style={{ color: ok ? '#22c55e' : '#999', fontSize: 12 }}>{text}</Text>
    </View>
  );
}

const TITLES: Record<number, string> = {
  1: "Let's get started",
  2: 'Create Password',
  3: 'Create your username',
  4: 'Enter your display name',
  5: "Enter your institution's name",
  6: 'Enter your program/main option',
};

export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [program, setProgram] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Username availability
  const [usernameMsg, setUsernameMsg] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const lastCheckedRef = useRef('');

  // Verification code
  const [code, setCode] = useState(['', '', '', '']);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);
  const codeRefs = useRef<(TextInput | null)[]>([null, null, null, null]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const isValidPassword = hasMinLength && hasNumber && hasUppercase;

  // Live username availability check
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameMsg('');
      setUsernameAvailable(null);
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameMsg('Username may only contain letters, numbers, and underscores.');
      setUsernameAvailable(null);
      return;
    }
    if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
      setUsernameMsg('This username is reserved.');
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
        const res = await fetch(
          apiUrl(`/api/auth/username-available?username=${encodeURIComponent(trimmed)}`),
          { signal: ctrl.signal },
        );
        const body = await res.json().catch(() => ({}));
        lastCheckedRef.current = trimmed;
        setUsernameAvailable(Boolean(body?.available));
        setUsernameMsg('');
      } catch {
        // aborted or network error — don't update state
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
    await WebBrowser.openBrowserAsync(apiUrl('/api/auth/social/google?mode=register'));
  };

  const handleEmailNext = async () => {
    setError(null);
    const trimmed = email.trim();
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/auth/email-available?email=${encodeURIComponent(trimmed)}`),
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not verify this email');
      if (!body?.available) {
        setError('Account already exists with this email.');
        return;
      }
      setStep(2);
    } catch {
      setError('Could not verify this email');
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameNext = async () => {
    const trimmed = username.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameMsg('Username may only contain letters, numbers, and underscores.');
      return;
    }
    setCheckingUsername(true);
    try {
      const res = await fetch(
        apiUrl(`/api/auth/username-available?username=${encodeURIComponent(trimmed)}`),
      );
      const body = await res.json().catch(() => ({}));
      if (!body?.available) {
        setUsernameAvailable(false);
        return;
      }
      lastCheckedRef.current = trimmed;
      setUsername(trimmed);
      setStep(4);
    } catch {
      setUsernameMsg('Could not check username availability.');
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username,
          displayName,
          institution,
          program,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || 'Oops, something went wrong');
      }
      setStep(7);
    } catch {
      setError('Oops, something went wrong :-(');
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
    if (key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 4) return;
    setLoading(true);
    setError(null);
    setVerifyStatus(null);
    try {
      const res = await fetch(apiUrl('/api/auth/verify-email-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'Verification failed');
      }
      router.replace('/(auth)/login');
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setVerifyStatus(null);
    try {
      const res = await fetch(apiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to resend');
      setCode(['', '', '', '']);
      codeRefs.current[0]?.focus();
      setVerifyStatus('A new verification code was sent.');
    } catch {
      setError('Failed to resend verification code');
    } finally {
      setLoading(false);
    }
  };

  const canGoBack = step > 1 && step !== 7;

  const isUsernameNextDisabled =
    !username.trim() ||
    checkingUsername ||
    username.length < 3 ||
    usernameMsg !== '' ||
    usernameAvailable === false;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar with back button */}
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

        {/* Card */}
        <View style={styles.card}>
          {/* Logo + title (hidden on verification step) */}
          {step !== 7 && (
            <View style={styles.header}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.logo}
              />
              <Text style={styles.title}>{TITLES[step]}</Text>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Step 1 — Email */}
          {step === 1 && (
            <View style={styles.content}>
              <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleAuth}>
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
                {'Already have an account? '}
                <Text
                  style={styles.switchLink}
                  onPress={() => router.replace('/(auth)/login')}
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

          {/* Step 2 — Password */}
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

          {/* Step 3 — Username */}
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
                    lastCheckedRef.current = '';
                    setUsernameAvailable(null);
                    setUsernameMsg('');
                  }}
                  autoCapitalize="none"
                  placeholderTextColor="#aaa"
                />
                <View style={styles.inputIconWrapper}>
                  {checkingUsername && username.length >= 3 ? (
                    <ActivityIndicator color={BRAND} size="small" />
                  ) : username.length >= 3 && !usernameMsg ? (
                    <Ionicons
                      name={usernameAvailable ? 'checkmark-circle' : 'close-circle'}
                      size={22}
                      color={usernameAvailable ? '#22c55e' : '#ef4444'}
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

          {/* Step 4 — Display Name */}
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
                  displayName.trim().length < 2 && styles.actionBtnDisabled,
                ]}
                onPress={() => setStep(5)}
                disabled={displayName.trim().length < 2}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    displayName.trim().length < 2 && styles.actionBtnTextDisabled,
                  ]}
                >
                  NEXT
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 5 — Institution */}
          {step === 5 && (
            <View style={styles.content}>
              <Text style={styles.label}>INSTITUTION NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Copperbelt University"
                value={institution}
                onChangeText={setInstitution}
                placeholderTextColor="#aaa"
              />
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  !institution && styles.actionBtnDisabled,
                ]}
                onPress={() => setStep(6)}
                disabled={!institution}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    !institution && styles.actionBtnTextDisabled,
                  ]}
                >
                  NEXT
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 6 — Program */}
          {step === 6 && (
            <View style={styles.content}>
              <Text style={styles.label}>PROGRAM/MAIN OPTION</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Computer science / ADDMA"
                value={program}
                onChangeText={setProgram}
                placeholderTextColor="#aaa"
              />
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (!program || loading) && styles.actionBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!program || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      !program && styles.actionBtnTextDisabled,
                    ]}
                  >
                    SUBMIT
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Step 7 — Email Verification */}
          {step === 7 && (
            <View style={styles.verifyContainer}>
              <Text style={styles.verifyOverline}>VERIFICATION</Text>
              <Text style={styles.verifyTitle}>Verify email</Text>
              <Text style={styles.verifyDesc}>
                {"We've sent a verification code to "}
                <Text style={{ fontWeight: '700', color: '#111' }}>{email}</Text>
                {'. Enter it below to continue.'}
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
              {error ? (
                <Text style={styles.fieldError}>{error}</Text>
              ) : null}

              <Text style={styles.resendText}>
                {"Didn't receive it? "}
                <Text style={styles.resendLink} onPress={handleResend}>
                  Resend code
                </Text>
              </Text>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (code.some((d) => d === '') || loading) &&
                    styles.actionBtnDisabled,
                ]}
                onPress={handleVerify}
                disabled={code.some((d) => d === '') || loading}
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
  container: {
    flex: 1,
    backgroundColor: '#F2F1EE',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  topBar: {
    height: 40,
    justifyContent: 'center',
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  header: {
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    marginBottom: 28,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D5D5D5',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#999',
    letterSpacing: 1.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#F8F8F6',
    color: '#111',
  },
  inputIconWrapper: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  rules: {
    marginTop: 12,
    gap: 6,
  },
  switchText: {
    fontSize: 14,
    color: '#555',
    marginTop: 10,
  },
  switchLink: {
    fontWeight: '700',
    color: '#111',
  },
  fieldError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 6,
  },
  actionBtn: {
    backgroundColor: BRAND,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  actionBtnDisabled: {
    backgroundColor: '#EBEBEB',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 1,
  },
  actionBtnTextDisabled: {
    color: '#aaa',
  },
  // Verification
  verifyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  verifyOverline: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
    letterSpacing: 3,
    marginBottom: 12,
  },
  verifyTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  verifyDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  codeInput: {
    width: 56,
    height: 64,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    fontSize: 24,
    fontWeight: '600',
    color: '#111',
    backgroundColor: '#F8F8F6',
  },
  verifySuccess: {
    color: '#16a34a',
    fontSize: 13,
    marginTop: 12,
  },
  resendText: {
    fontSize: 14,
    color: '#666',
    marginTop: 20,
  },
  resendLink: {
    color: '#A15D16',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
