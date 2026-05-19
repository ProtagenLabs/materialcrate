import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";
import ProfileScreen from "@/components/profile/ProfileScreen";

export default function OwnProfileTab() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ProfileScreen />
    </View>
  );
}
