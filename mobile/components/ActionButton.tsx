import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  size?: "sm" | "md";
};

export default function ActionButton({
  onPress,
  disabled = false,
  loading = false,
  children,
  size = "md",
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.82}
      style={[
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        isDisabled ? styles.disabled : styles.active,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  md: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  active: {
    backgroundColor: "#E1761F",
  },
  disabled: {
    backgroundColor: "#D1D5DB",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  labelDisabled: {
    color: "#9CA3AF",
  },
});