import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2 } from "iconsax-react-nativejs";

const sections = [
  {
    heading: "Acceptable Use",
    body: "You may use MaterialCrate only for lawful, legitimate, and respectful purposes. Spam, impersonation, harassment, malware, abusive behavior, attempts to bypass platform controls, and any activity that harms other users or the service are prohibited.",
  },
  {
    heading: "Your Content And Rights",
    body: "You are solely responsible for the files, text, comments, images, and other material you upload or share. Anything you post must either be strictly yours, properly licensed to you, or shared with clear permission from the rights holder. Do not upload copyrighted, confidential, stolen, or unauthorized material.",
  },
  {
    heading: "Copyright And Platform Liability",
    body: "MaterialCrate is a hosting platform and does not pre-approve every user submission. We may remove or restrict content that appears to infringe intellectual property rights or violate policy, but responsibility for uploaded content remains with the user who posted it. To the extent permitted by law, MaterialCrate is not liable for user-submitted materials, ownership disputes, or losses caused by unauthorized uploads made by users.",
  },
  {
    heading: "Subscriptions And Paid Features",
    body: "If paid features are offered, subscription access, renewal timing, billing status, and included benefits are governed by the plan attached to your account. Access to premium features may be limited, changed, or suspended if payment fails, a charge is reversed, or the account is used in violation of these terms.",
  },
  {
    heading: "Moderation And Enforcement",
    body: "We may investigate reports, remove content, limit visibility, disable interactions, suspend accounts, or permanently restrict access when we believe it is necessary to protect the platform, respond to legal complaints, or enforce these terms. Serious or repeated violations may lead to immediate action without prior notice.",
  },
];

export default function TermsOfService() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.banner}>
          <Text style={styles.bannerEyebrow}>LEGAL</Text>
          <Text style={styles.bannerTitle}>How people use the app.</Text>
          <Text style={styles.bannerDesc}>
            These terms set the rules for using MaterialCrate, make users responsible for what they
            upload, and protect the platform when content is posted without proper rights or
            permission.
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section.heading} style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footerCard}>
          <Text style={styles.footerEyebrow}>IMPORTANT</Text>
          <Text style={styles.footerBody}>
            If you upload something you do not own or do not have permission to share, you accept
            the risk and responsibility for that decision. The platform may remove the content and
            take action on the account.
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
    backgroundColor: "#1D1D1D",
    borderRadius: 20,
    padding: 18,
    marginTop: 4,
  },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.55)",
  },
  bannerTitle: { fontSize: 18, fontWeight: "600", color: "#FFFFFF", marginTop: 6 },
  bannerDesc: { fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 6, lineHeight: 19 },

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
