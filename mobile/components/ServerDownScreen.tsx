import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useServerStatus } from "@/lib/server-status";

export default function ServerDownScreen() {
  const { retry } = useServerStatus();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await retry();
    setRetrying(false);
  };

  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={64} color="#9ca3af" />
      <Text style={styles.title}>Server Unavailable</Text>
      <Text style={styles.message}>
        We're having trouble connecting to our servers. Please check your
        internet connection and try again.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleRetry}
        disabled={retrying}
        activeOpacity={0.8}
      >
        {retrying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Try Again</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: "#E1761F",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    minWidth: 140,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
