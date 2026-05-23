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
  query PrivacySettingsMe {
    me {
      id
      visibilityPublicProfile
      visibilityPublicPosts
      visibilityPublicComments
      visibilityOnlineStatus
    }
  }
`;

const UPDATE_VISIBILITY_MUTATION = `
  mutation UpdateVisibilitySettings(
    $visibilityPublicProfile: Boolean!
    $visibilityPublicPosts: Boolean!
    $visibilityPublicComments: Boolean!
    $visibilityOnlineStatus: Boolean!
  ) {
    updateVisibilitySettings(
      visibilityPublicProfile: $visibilityPublicProfile
      visibilityPublicPosts: $visibilityPublicPosts
      visibilityPublicComments: $visibilityPublicComments
      visibilityOnlineStatus: $visibilityOnlineStatus
    ) {
      id
    }
  }
`;

type VisibilitySettings = {
  visibilityPublicProfile: boolean;
  visibilityPublicPosts: boolean;
  visibilityPublicComments: boolean;
  visibilityOnlineStatus: boolean;
};

const OPTIONS: { key: keyof VisibilitySettings; label: string; description: string }[] = [
  { key: "visibilityPublicProfile", label: "Public profile", description: "Allow other people to discover and view your profile." },
  { key: "visibilityPublicPosts", label: "Public posts", description: "Show your posts outside your direct audience." },
  { key: "visibilityPublicComments", label: "Public comments", description: "Let your comment activity be visible to others." },
  { key: "visibilityOnlineStatus", label: "Online status", description: "Show when you are active in the app." },
];

function normalize(v: VisibilitySettings): VisibilitySettings {
  if (!v.visibilityPublicProfile && v.visibilityPublicPosts) {
    return { ...v, visibilityPublicPosts: false };
  }
  return v;
}

export default function PrivacySettings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [visibility, setVisibility] = useState<VisibilitySettings>({
    visibilityPublicProfile: true,
    visibilityPublicPosts: true,
    visibilityPublicComments: true,
    visibilityOnlineStatus: true,
  });
  const [savingKey, setSavingKey] = useState<keyof VisibilitySettings | null>(null);

  useEffect(() => {
    const { token } = getAuth();
    gql<{ me: VisibilitySettings & { id: string } }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => {
        const m = d.me;
        setVisibility(normalize({
          visibilityPublicProfile: m.visibilityPublicProfile,
          visibilityPublicPosts: m.visibilityPublicPosts,
          visibilityPublicComments: m.visibilityPublicComments,
          visibilityOnlineStatus: m.visibilityOnlineStatus,
        }));
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggle = async (key: keyof VisibilitySettings, value: boolean) => {
    if (savingKey) return;
    if (key === "visibilityPublicPosts" && !visibility.visibilityPublicProfile) return;

    const prev = visibility;
    const next = normalize({ ...prev, [key]: value });
    setVisibility(next);
    setSavingKey(key);
    const { token } = getAuth();
    try {
      await gql(UPDATE_VISIBILITY_MUTATION, next, token ?? undefined);
    } catch {
      setVisibility(prev);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Safety</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1761F" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>VISIBILITY</Text>
          <Text style={styles.sectionDesc}>
            Control what people can see. Visibility settings shape how discoverable your profile and
            activity are.
          </Text>
          <View style={styles.card}>
            {OPTIONS.map((opt, idx) => {
              const locked = opt.key === "visibilityPublicPosts" && !visibility.visibilityPublicProfile;
              return (
                <View key={opt.key}>
                  {idx > 0 && <View style={styles.divider} />}
                  <View style={[styles.row, locked && styles.rowLocked]}>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, locked && styles.rowLabelLocked]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.rowDesc, locked && styles.rowDescLocked]}>
                        {opt.description}
                      </Text>
                    </View>
                    <Switch
                      value={visibility[opt.key]}
                      onValueChange={(v) => void handleToggle(opt.key, v)}
                      disabled={locked || savingKey !== null}
                      trackColor={{ false: "#D1D5DB", true: "#E1761F" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              );
            })}
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
    marginBottom: 6,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    paddingHorizontal: 4,
    marginBottom: 10,
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
  rowLocked: { opacity: 0.5 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500", color: "#111111" },
  rowLabelLocked: { color: "#9CA3AF" },
  rowDesc: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  rowDescLocked: { color: "#D1D5DB" },
});
