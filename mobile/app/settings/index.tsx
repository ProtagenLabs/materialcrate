import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft2,
  ArrowRight2,
  Profile,
  SecurityUser,
  Notification,
  Eye,
  Trash,
  MessageQuestion,
  DocumentText,
  Logout,
} from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth, clearAuth } from "@/lib/auth-store";

const ME_QUERY = `
  query SettingsIndexMe {
    me {
      id
      displayName
      username
      profilePicture
      subscriptionPlan
    }
  }
`;

type Me = {
  id: string;
  displayName: string;
  username: string;
  profilePicture?: string | null;
  subscriptionPlan: string;
};

type Section = {
  title: string;
  items: MenuItem[];
};

type MenuItem = {
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ReactNode;
  danger?: boolean;
};

export default function SettingsIndex() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const { token } = getAuth();
    gql<{ me: Me }>(ME_QUERY, {}, token ?? undefined)
      .then((d) => setMe(d.me))
      .catch(() => null);
  }, []);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          clearAuth();
          router.replace("/(auth)/login" as never);
        },
      },
    ]);
  };

  const sections: Section[] = [
    {
      title: "Profile",
      items: [
        {
          label: "Edit Profile",
          sublabel: "Name, username, photo, bio",
          href: "/settings/profile",
          icon: <Profile size={18} color="#111111" variant="Linear" />,
        },
      ],
    },
    {
      title: "Account",
      items: [
        {
          label: "Account",
          sublabel: "Email, password, plan",
          href: "/settings/account",
          icon: <SecurityUser size={18} color="#111111" variant="Linear" />,
        },
        {
          label: "Notifications",
          sublabel: "Push and email preferences",
          href: "/settings/notifications",
          icon: <Notification size={18} color="#111111" variant="Linear" />,
        },
        {
          label: "Privacy & Safety",
          sublabel: "Visibility and online status",
          href: "/settings/privacy",
          icon: <Eye size={18} color="#111111" variant="Linear" />,
        },
      ],
    },
    {
      title: "Activity",
      items: [
        {
          label: "Recently Deleted",
          sublabel: "Restore or permanently remove",
          href: "/settings/recently-deleted",
          icon: <Trash size={18} color="#111111" variant="Linear" />,
        },
      ],
    },
    {
      title: "Help",
      items: [
        {
          label: "Support",
          sublabel: "Report a problem or ask for help",
          href: "/settings/support",
          icon: <MessageQuestion size={18} color="#111111" variant="Linear" />,
        },
        {
          label: "Legal",
          sublabel: "Privacy policy and terms of service",
          href: "/settings/legal",
          icon: <DocumentText size={18} color="#111111" variant="Linear" />,
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Profile card */}
        {me && (
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => router.push("/settings/profile" as never)}
            activeOpacity={0.7}
          >
            {me.profilePicture ? (
              <Image source={{ uri: me.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{me.displayName.charAt(0)}</Text>
              </View>
            )}
            <View style={styles.profileCardText}>
              <Text style={styles.profileCardName}>{me.displayName}</Text>
              <Text style={styles.profileCardSub}>@{me.username}</Text>
            </View>
            <ArrowRight2 size={18} color="#9CA3AF" variant="Linear" />
          </TouchableOpacity>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.href}
                  style={[
                    styles.row,
                    idx < section.items.length - 1 && styles.rowBorder,
                  ]}
                  onPress={() => router.push(item.href as never)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIcon}>{item.icon}</View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}>
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={styles.rowSublabel}>{item.sublabel}</Text>
                    ) : null}
                  </View>
                  <ArrowRight2 size={16} color="#9CA3AF" variant="Linear" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.row} onPress={handleSignOut} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Logout size={18} color="#DC2626" variant="Linear" />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Sign out</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.version}>MaterialCrate</Text>
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

  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    marginTop: 8,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E1761F",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 22, fontWeight: "600", color: "#FFFFFF" },
  profileCardText: { flex: 1 },
  profileCardName: { fontSize: 16, fontWeight: "600", color: "#111111" },
  profileCardSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#9CA3AF",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500", color: "#111111" },
  rowLabelDanger: { color: "#DC2626" },
  rowSublabel: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },

  version: { textAlign: "center", fontSize: 12, color: "#D1D5DB", marginTop: 8 },
});
