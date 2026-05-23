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
import { ArrowLeft2, DocumentText } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

const CREATE_REPORT_MUTATION = `
  mutation CreateReport(
    $category: String!
    $title: String!
    $description: String!
    $deviceInfo: String
  ) {
    createReport(
      category: $category
      title: $title
      description: $description
      deviceInfo: $deviceInfo
    ) {
      id
    }
  }
`;

type ProblemCategory = "bug" | "crash" | "performance" | "account" | "content" | "other";

const CATEGORIES: { value: ProblemCategory; label: string }[] = [
  { value: "bug", label: "Something isn't working" },
  { value: "crash", label: "App crashes or freezes" },
  { value: "performance", label: "Slow or unresponsive" },
  { value: "account", label: "Account issue" },
  { value: "content", label: "Content problem" },
  { value: "other", label: "Other" },
];

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 1000;

function getDeviceInfo(): string {
  const parts: string[] = ["Platform: React Native", `OS: ${Platform.OS}`];
  if (Platform.Version) parts.push(`Version: ${String(Platform.Version)}`);
  return parts.join("; ");
}

export default function SupportReport() {
  const router = useRouter();
  const [category, setCategory] = useState<ProblemCategory | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = category !== "" && title.trim().length >= 5 && description.trim().length >= 20;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const { token } = getAuth();
    try {
      await gql(
        CREATE_REPORT_MUTATION,
        {
          category,
          title: title.trim(),
          description: description.trim(),
          deviceInfo: getDeviceInfo(),
        },
        token ?? undefined,
      );
      setCategory("");
      setTitle("");
      setDescription("");
      Alert.alert("Report submitted", "We'll look into it shortly.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit report.");
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
        <Text style={styles.headerTitle}>Report a Problem</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <Text style={styles.bannerEyebrow}>REPORT</Text>
            <Text style={styles.bannerTitle}>Something not right?</Text>
            <Text style={styles.bannerDesc}>
              Describe the issue and we'll work on a fix.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>What best describes the issue?</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.chip, category === cat.value && styles.chipActive]}
                  onPress={() => setCategory(cat.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, category === cat.value && styles.chipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE))}
              placeholder="Brief summary of the problem"
              placeholderTextColor="#9CA3AF"
              editable={!isSubmitting}
            />
            <Text style={styles.counter}>{title.length}/{MAX_TITLE}</Text>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION))}
              placeholder="What happened? What did you expect? Steps to reproduce the issue…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
            <Text style={styles.counter}>{description.length}/{MAX_DESCRIPTION}</Text>
          </View>

          <View style={styles.noteBox}>
            <DocumentText size={18} color="#A95A13" variant="Bold" />
            <Text style={styles.noteText}>
              We may collect basic device and app info (OS, app version) to help diagnose the issue.
              No personal data beyond your account is shared.
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
              <Text style={styles.submitBtnText}>Submit Report</Text>
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
