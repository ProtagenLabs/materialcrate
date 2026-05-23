import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft2, ArrowRight2, DocumentText, Shield } from "iconsax-react-nativejs";

export default function Legal() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/settings/legal-privacy" as never)}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <Shield size={18} color="#111111" variant="Linear" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
              <Text style={styles.rowSublabel}>How we collect and use your data</Text>
            </View>
            <ArrowRight2 size={16} color="#9CA3AF" variant="Linear" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/settings/legal-terms" as never)}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <DocumentText size={18} color="#111111" variant="Linear" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Terms of Service</Text>
              <Text style={styles.rowSublabel}>Rules for using MaterialCrate</Text>
            </View>
            <ArrowRight2 size={16} color="#9CA3AF" variant="Linear" />
          </TouchableOpacity>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 },
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
  rowSublabel: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
});
