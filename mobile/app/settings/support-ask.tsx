import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2, MessageQuestion } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

const SEND_SUPPORT_MESSAGE_MUTATION = `
  mutation SendSupportMessage($topic: String!, $subject: String!, $message: String!) {
    sendSupportMessage(topic: $topic, subject: $subject, message: $message) {
      success
    }
  }
`;

type HelpTopic = "general" | "account" | "billing" | "feature" | "other";

const TOPICS: { value: HelpTopic; label: string }[] = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & settings" },
  { value: "billing", label: "Billing & payments" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

const MAX_SUBJECT = 120;
const MAX_MESSAGE = 2000;

export default function SupportAsk() {
  const router = useRouter();
  const [topic, setTopic] = useState<HelpTopic | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = topic !== "" && subject.trim().length >= 5 && message.trim().length >= 20;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const { token } = getAuth();
    try {
      await gql(
        SEND_SUPPORT_MESSAGE_MUTATION,
        { topic, subject: subject.trim(), message: message.trim() },
        token ?? undefined,
      );
      setTopic("");
      setSubject("");
      setMessage("");
      Alert.alert("Message sent", "We'll get back to you via email as soon as possible.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ask for Help</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <Text style={styles.bannerEyebrow}>SUPPORT</Text>
            <Text style={styles.bannerTitle}>Need a hand?</Text>
            <Text style={styles.bannerDesc}>
              Send us a message and we'll get back to you via email as soon as possible.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>TOPIC</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>What do you need help with?</Text>
            <View style={styles.chipRow}>
              {TOPICS.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.chip, topic === t.value && styles.chipActive]}
                  onPress={() => setTopic(t.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, topic === t.value && styles.chipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.sectionLabel}>YOUR MESSAGE</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={(v) => setSubject(v.slice(0, MAX_SUBJECT))}
              placeholder="What's this about?"
              placeholderTextColor="#9CA3AF"
              editable={!isSubmitting}
            />
            <Text style={styles.counter}>{subject.length}/{MAX_SUBJECT}</Text>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Message</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={message}
              onChangeText={(v) => setMessage(v.slice(0, MAX_MESSAGE))}
              placeholder="Describe what you need help with in detail…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
            <Text style={styles.counter}>{message.length}/{MAX_MESSAGE}</Text>
          </View>

          <View style={styles.noteBox}>
            <MessageQuestion size={18} color="#A95A13" variant="Bold" />
            <Text style={styles.noteText}>
              We'll respond to the email address associated with your account. Make sure it's up to
              date in your settings.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (!isValid || isSubmitting) && styles.submitBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={!isValid || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Send Message</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },

  banner: {
    backgroundColor: "#1D1D1D",
    borderRadius: 20,
    padding: 16,
    marginTop: 4,
  },
  bannerEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "rgba(255,255,255,0.55)" },
  bannerTitle: { fontSize: 18, fontWeight: "600", color: "#FFFFFF", marginTop: 4 },
  bannerDesc: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#9CA3AF",
    paddingHorizontal: 4,
    marginBottom: -6,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: { fontSize: 13, fontWeight: "600", color: "#111111", marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#F9FAFB",
  },
  chipActive: { borderColor: "#E1761F", backgroundColor: "#FFF4EA" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  chipTextActive: { color: "#B46B28" },

  fieldLabel: { fontSize: 13, fontWeight: "500", color: "#6B7280", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#111111",
    backgroundColor: "#FAFAF8",
  },
  textarea: { minHeight: 120, paddingTop: 11 },
  counter: { fontSize: 11, color: "#AAAAAA", textAlign: "right", marginTop: 4 },

  noteBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFF4EA",
    borderRadius: 16,
    padding: 14,
  },
  noteText: { flex: 1, fontSize: 12, color: "#8B6234", lineHeight: 18 },

  submitBtn: {
    backgroundColor: "#111111",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitBtnDisabled: { backgroundColor: "#D1D5DB" },
  submitBtnText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
});
