import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Home,
  Clipboard,
  Archive,
  Profile,
  Messages2,
} from "iconsax-react-nativejs";
import type { Icon as IconsaxIcon } from "iconsax-react-nativejs";

type NavItem = {
  label: string;
  href: string;
  Icon: IconsaxIcon;
};

const items: NavItem[] = [
  { label: "Home", href: "/", Icon: Home },
  {
    label: "AI Hub",
    href: "/hub",
    Icon: Clipboard,
  },
  {
    label: "Chat",
    href: "/chat",
    Icon: Messages2,
  },
  {
    label: "Saved",
    href: "/saved",
    Icon: Archive,
  },
  {
    label: "Profile",
    href: "/user",
    Icon: Profile,
  },
];

const ACTIVE = "#E1761F";
const INACTIVE = "#959595";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (pathname === "/hub") return null;

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}
    >
      {items.map(({ label, href, Icon }) => {
        const isActive =
          href === "/saved"
            ? pathname === href || pathname.startsWith("/saved/folder/")
            : pathname === href;
        const color = isActive ? ACTIVE : INACTIVE;

        return (
          <TouchableOpacity
            key={href}
            style={styles.item}
            onPress={() => router.push(href as never)}
            activeOpacity={0.7}
          >
            <Icon
              size={24}
              color={color}
              variant={isActive ? "Bold" : "Linear"}
            />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 36,
    paddingTop: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D1D5DB",
  },
  item: {
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
});
