import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2 } from "iconsax-react-nativejs";

const sections = [
  {
    heading: "Information We Collect",
    body: "We collect the information you provide when you create an account, complete your profile, upload materials, save posts, contact support, or connect social sign-in providers. This can include your email address, username, display name, institution, program, profile images, uploaded files, comments, follows, saved items, and support attachments.",
  },
  {
    heading: "How We Use Your Data",
    body: "We use your information to run MaterialCrate, authenticate your account, personalize your experience, organize your workspace and archive, surface notifications, process subscriptions, respond to support requests, and improve product performance and safety.",
  },
  {
    heading: "Visibility And Community Features",
    body: "Your profile, posts, comments, and activity may be visible to other users depending on your visibility settings and how you choose to participate. Features such as follows, comments, likes, notifications, and saved materials rely on storing and displaying certain account and content data inside the platform.",
  },
  {
    heading: "Moderation And Safety",
    body: "We may review reports, support requests, and related account activity to investigate abuse, fraud, policy violations, copyright concerns, or security issues. This can include report text, screenshots, user-agent details, and records connected to the content or account being reviewed.",
  },
  {
    heading: "Payments And Subscription Records",
    body: "If you use paid features, we keep subscription plan details and related billing status necessary to manage access, renewals, and account support. We do not state card-storage practices here unless separately documented by the payment provider handling checkout.",
  },
  {
    heading: "Your Controls",
    body: "You can update parts of your profile, manage visibility preferences, control notification settings, mute or block other users, and request account deletion where supported. Some information may remain in backups, legal records, fraud-prevention logs, or moderation records for a limited period where necessary.",
  },
];

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.banner}>
          <Text style={styles.bannerEyebrow}>PRIVACY</Text>
          <Text style={styles.bannerTitle}>How MaterialCrate handles your information.</Text>
          <Text style={styles.bannerDesc}>
            We collect only the information needed to operate accounts, support learning materials,
            enable community features, maintain safety, and improve the product.
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section.heading} style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footerCard}>
          <Text style={styles.footerEyebrow}>DATA CARE</Text>
          <Text style={styles.footerBody}>
            We aim to keep privacy notices clear and specific. If product features change, this
            policy should be updated to reflect new data uses, integrations, or retention practices.
          </Text>
        </View>
      </ScrollView>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },

  banner: {
    backgroundColor: "#FFF7EE",
    borderRadius: 20,
    padding: 18,
    marginTop: 4,
  },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#B46B28",
  },
  bannerTitle: { fontSize: 18, fontWeight: "600", color: "#111111", marginTop: 6, lineHeight: 24 },
  bannerDesc: { fontSize: 13, color: "#6A625A", marginTop: 6, lineHeight: 19 },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  sectionHeading: { fontSize: 14, fontWeight: "500", color: "#111111" },
  sectionBody: { fontSize: 13, color: "#6B7280", marginTop: 6, lineHeight: 19 },

  footerCard: {
    backgroundColor: "#FFF1E2",
    borderRadius: 16,
    padding: 16,
  },
  footerEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#B46B28",
    marginBottom: 6,
  },
  footerBody: { fontSize: 13, color: "#7A5B37", lineHeight: 19 },
});
