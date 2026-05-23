import { useState, useEffect } from "react";
import {
  View,
  Text,
  Switch,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2 } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";

const ME_QUERY = `
  query NotificationsSettingsMe {
    me {
      id
      pushNotificationsLikes
      pushNotificationsComments
      pushNotificationsFollows
      pushNotificationsMentions
      emailNotificationsAccountActivity
      emailNotificationsWeeklySummary
      emailNotificationsProductUpdates
      emailNotificationsMarketing
      emailNotificationsUploadReminder
    }
  }
`;

const UPDATE_PUSH_MUTATION = `
  mutation UpdatePushNotificationSettings(
    $pushNotificationsLikes: Boolean!
    $pushNotificationsComments: Boolean!
    $pushNotificationsFollows: Boolean!
    $pushNotificationsMentions: Boolean!
  ) {
    updatePushNotificationSettings(
      pushNotificationsLikes: $pushNotificationsLikes
      pushNotificationsComments: $pushNotificationsComments
      pushNotificationsFollows: $pushNotificationsFollows
      pushNotificationsMentions: $pushNotificationsMentions
    ) {
      id
    }
  }
`;

const UPDATE_EMAIL_MUTATION = `
  mutation UpdateEmailNotificationSettings(
    $emailNotificationsAccountActivity: Boolean!
    $emailNotificationsWeeklySummary: Boolean!
    $emailNotificationsProductUpdates: Boolean!
    $emailNotificationsMarketing: Boolean!
    $emailNotificationsUploadReminder: Boolean!
  ) {
    updateEmailNotificationSettings(
      emailNotificationsAccountActivity: $emailNotificationsAccountActivity
      emailNotificationsWeeklySummary: $emailNotificationsWeeklySummary
      emailNotificationsProductUpdates: $emailNotificationsProductUpdates
      emailNotificationsMarketing: $emailNotificationsMarketing
      emailNotificationsUploadReminder: $emailNotificationsUploadReminder
    ) {
      id
    }
  }
`;

type PushSettings = {
  pushNotificationsLikes: boolean;
  pushNotificationsComments: boolean;
  pushNotificationsFollows: boolean;
  pushNotificationsMentions: boolean;
};

type EmailSettings = {
  emailNotificationsAccountActivity: boolean;
  emailNotificationsWeeklySummary: boolean;
  emailNotificationsProductUpdates: boolean;
  emailNotificationsMarketing: boolean;
  emailNotificationsUploadReminder: boolean;
};

const DEFAULT_PUSH: PushSettings = {
  pushNotificationsLikes: true,
  pushNotificationsComments: true,
  pushNotificationsFollows: true,
  pushNotificationsMentions: true,
};

const DEFAULT_EMAIL: EmailSettings = {
  emailNotificationsAccountActivity: true,
  emailNotificationsWeeklySummary: true,
  emailNotificationsProductUpdates: true,
  emailNotificationsMarketing: true,
  emailNotificationsUploadReminder: true,
};

const PUSH_OPTIONS: { key: keyof PushSettings; label: string; description: string }[] = [
  { key: "pushNotificationsLikes", label: "Likes and reactions", description: "When someone reacts to your post." },
  { key: "pushNotificationsComments", label: "Comments", description: "When someone comments on your post." },
  { key: "pushNotificationsFollows", label: "Follows", description: "When someone follows your account." },
  { key: "pushNotificationsMentions", label: "Mentions", description: "When someone mentions you in content." },
];

const EMAIL_OPTIONS: { key: keyof EmailSettings; label: string; description: string }[] = [
  { key: "emailNotificationsAccountActivity", label: "Account activity", description: "Important updates about your account and sign-ins." },
  { key: "emailNotificationsWeeklySummary", label: "Weekly summary", description: "A recap of views, engagement, and activity." },
  { key: "emailNotificationsProductUpdates", label: "Product updates", description: "New features, improvements, and app announcements." },
  { key: "emailNotificationsMarketing", label: "Marketing emails", description: "Occasional tips, promos, and campaigns." },
  { key: "emailNotificationsUploadReminder", label: "Upload reminders", description: "Weekly nudge to share materials when you haven't uploaded recently." },
];

export default function NotificationsSettings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [push, setPush] = useState<PushSettings>(DEFAULT_PUSH);
  const [email, setEmail] = useState<EmailSettings>(DEFAULT_EMAIL);
  const [savingPushKey, setSavingPushKey] = useState<keyof PushSettings | null>(null);
  const [savingEmailKey, setSavingEmailKey] = useState<keyof EmailSettings | null>(null);

  useEffect(() => {
    const { token } = getAuth();
    gql<{ me: PushSettings & EmailSettings & { id: string } }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => {
        const m = d.me;
        setPush({
          pushNotificationsLikes: m.pushNotificationsLikes,
          pushNotificationsComments: m.pushNotificationsComments,
          pushNotificationsFollows: m.pushNotificationsFollows,
          pushNotificationsMentions: m.pushNotificationsMentions,
        });
        setEmail({
          emailNotificationsAccountActivity: m.emailNotificationsAccountActivity,
          emailNotificationsWeeklySummary: m.emailNotificationsWeeklySummary,
          emailNotificationsProductUpdates: m.emailNotificationsProductUpdates,
          emailNotificationsMarketing: m.emailNotificationsMarketing,
          emailNotificationsUploadReminder: m.emailNotificationsUploadReminder,
        });
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, []);

  const handlePushToggle = async (key: keyof PushSettings, value: boolean) => {
    if (savingPushKey || savingEmailKey) return;
    const prev = push;
    const next = { ...push, [key]: value };
    setPush(next);
    setSavingPushKey(key);
    const { token } = getAuth();
    try {
      await gql(UPDATE_PUSH_MUTATION, next, token ?? undefined);
    } catch {
      setPush(prev);
    } finally {
      setSavingPushKey(null);
    }
  };

  const handleEmailToggle = async (key: keyof EmailSettings, value: boolean) => {
    if (savingPushKey || savingEmailKey) return;
    const prev = email;
    const next = { ...email, [key]: value };
    setEmail(next);
    setSavingEmailKey(key);
    const { token } = getAuth();
    try {
      await gql(UPDATE_EMAIL_MUTATION, next, token ?? undefined);
    } catch {
      setEmail(prev);
    } finally {
      setSavingEmailKey(null);
    }
  };

  const isSaving = savingPushKey !== null || savingEmailKey !== null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1761F" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>
          <View style={styles.card}>
            {PUSH_OPTIONS.map((opt, idx) => (
              <View key={opt.key}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{opt.label}</Text>
                    <Text style={styles.rowDesc}>{opt.description}</Text>
                  </View>
                  <Switch
                    value={push[opt.key]}
                    onValueChange={(v) => void handlePushToggle(opt.key, v)}
                    disabled={isSaving}
                    trackColor={{ false: "#D1D5DB", true: "#E1761F" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>EMAIL NOTIFICATIONS</Text>
          <View style={styles.card}>
            {EMAIL_OPTIONS.map((opt, idx) => (
              <View key={opt.key}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{opt.label}</Text>
                    <Text style={styles.rowDesc}>{opt.description}</Text>
                  </View>
                  <Switch
                    value={email[opt.key]}
                    onValueChange={(v) => void handleEmailToggle(opt.key, v)}
                    disabled={isSaving}
                    trackColor={{ false: "#D1D5DB", true: "#E1761F" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500", color: "#111111" },
  rowDesc: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
});
