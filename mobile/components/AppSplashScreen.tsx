import { View, StyleSheet } from "react-native";
import Logo from "../assets/images/logo.svg";
import ProtagenLogo from "../assets/images/protagenlabs-logo-text.svg";

export default function AppSplashScreen() {
  return (
    <View style={styles.container}>
      <Logo width={132} height={132} />
      <View style={styles.bottomLogo}>
        <ProtagenLogo width={160} height={80} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomLogo: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
});
