import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import McWordmark from "@/assets/images/mc-wordmark.svg";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchNormal1, Coin1 } from "iconsax-react-nativejs";

interface HomeHeaderProps {
  tokenBalance?: number | null;
  showLogin?: boolean;
}

export default function HomeHeader({
  tokenBalance,
  showLogin,
}: HomeHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.logo}>
        <McWordmark width={160} height={40} />
      </View>

      <View style={styles.actions}>
        {showLogin && (
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/login" as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.loginText}>Log in</Text>
          </TouchableOpacity>
        )}

        {tokenBalance != null && (
          <TouchableOpacity
            style={styles.tokenPill}
            onPress={() => router.push("/tokens" as never)}
            activeOpacity={0.8}
          >
            <Coin1 size={16} color="#E1761F" variant="Bold" />
            <Text style={styles.tokenText}>
              {new Intl.NumberFormat("en-US").format(tokenBalance)}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/search" as never)}
          activeOpacity={0.7}
        >
          <SearchNormal1 size={22} color="#959595" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D1D5DB",
  },
  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginButton: {
    backgroundColor: "#131212",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  loginText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF3E7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tokenText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E1761F",
  },
  iconButton: {
    padding: 8,
    borderRadius: 999,
  },
});
