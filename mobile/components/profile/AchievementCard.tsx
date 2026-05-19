import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export type AchievementData = {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  unlockedAt: string | null;
  holderPercentage: number;
};

const RARITY: Record<
  AchievementData["rarity"],
  { ring: string; badgeBg: string; badgeText: string }
> = {
  common: { ring: "#E5E7EB", badgeBg: "#F3F4F6", badgeText: "#6B7280" },
  uncommon: { ring: "#6EE7B7", badgeBg: "#D1FAE5", badgeText: "#059669" },
  rare: { ring: "#93C5FD", badgeBg: "#DBEAFE", badgeText: "#2563EB" },
  legendary: { ring: "#FCD34D", badgeBg: "#FEF3C7", badgeText: "#D97706" },
};

type Props = { achievement: AchievementData; onPress?: () => void };

export default function AchievementCard({ achievement, onPress }: Props) {
  const isUnlocked = Boolean(achievement.unlockedAt);
  const c = RARITY[achievement.rarity];

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: c.ring }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.iconWrap,
          { borderColor: c.ring },
          !isUnlocked && styles.iconLocked,
        ]}
      >
        <Text style={styles.iconText}>{achievement.icon}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, !isUnlocked && styles.titleMuted]}
            numberOfLines={1}
          >
            {achievement.title}
          </Text>
          <View style={[styles.badge, { backgroundColor: c.badgeBg }]}>
            <Text style={[styles.badgeLabel, { color: c.badgeText }]}>
              {achievement.rarity.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {achievement.description}
        </Text>
        {isUnlocked && achievement.holderPercentage > 0 && (
          <Text style={styles.holders}>
            {achievement.holderPercentage}% of users
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  iconLocked: { opacity: 0.4 },
  iconText: { fontSize: 22 },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  title: { fontSize: 13, fontWeight: "600", color: "#111111", flex: 1 },
  titleMuted: { color: "#6B7280" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  description: { fontSize: 11, color: "#9CA3AF", lineHeight: 16, marginTop: 3 },
  holders: { fontSize: 10, color: "#9CA3AF", marginTop: 5 },
});
