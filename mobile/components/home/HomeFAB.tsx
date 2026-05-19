import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DocumentUpload, Notification, Add } from "iconsax-react-nativejs";
import { useAuth, getAuth } from "@/lib/auth-store";
import { gql } from "@/lib/api";

const UNREAD_QUERY = `
  query UnreadNotifications {
    notifications(limit: 100, unreadOnly: true) { id }
  }
`;

export default function HomeFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Animation values
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const notifAnim = useRef(new Animated.Value(0)).current;
  const uploadAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const mainScaleAnim = useRef(new Animated.Value(1)).current;

  const fetchUnread = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { token } = getAuth();
      const data = await gql<{ notifications: { id: string }[] }>(
        UNREAD_QUERY,
        {},
        token ?? undefined,
      );
      const count = data.notifications?.length ?? 0;
      setUnreadCount(count);
      Animated.spring(dotAnim, {
        toValue: count > 0 ? 1 : 0,
        damping: 14,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    } catch {}
  }, [isAuthenticated, dotAnim]);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread]);

  const open = useCallback(() => {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.stagger(55, [
        Animated.spring(notifAnim, {
          toValue: 1,
          damping: 16,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.spring(uploadAnim, {
          toValue: 1,
          damping: 16,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [rotateAnim, notifAnim, uploadAnim]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.timing(uploadAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(notifAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => setIsOpen(false));
  }, [rotateAnim, notifAnim, uploadAnim]);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  const handleUpload = useCallback(() => {
    close();
    setTimeout(() => {
      if (!isAuthenticated) {
        router.push("/(auth)/login" as never);
        return;
      }
      router.push("/create" as never);
    }, 80);
  }, [close, isAuthenticated, router]);

  const handleNotifications = useCallback(() => {
    close();
    setTimeout(() => {
      if (!isAuthenticated) {
        router.push("/(auth)/login" as never);
        return;
      }
      setUnreadCount(0);
      Animated.timing(dotAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      router.push("/notifications" as never);
    }, 80);
  }, [close, isAuthenticated, router, dotAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  const subItemAnimatedStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.88, 1],
        }),
      },
    ],
  });

  const bottom = insets.bottom + 24;

  return (
    <>
      {isOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={close}
        />
      )}

      <View style={[styles.column, { bottom, right: 24 }]}>
        {/* Upload sub-item */}
        <Animated.View
          style={subItemAnimatedStyle(uploadAnim)}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <TouchableOpacity
            style={styles.subButton}
            onPress={handleUpload}
            activeOpacity={0.7}
          >
            <DocumentUpload size={20} color="#111111" variant="Bold" />
            <Text style={styles.subLabel}>Upload</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Notifications sub-item */}
        <Animated.View
          style={subItemAnimatedStyle(notifAnim)}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <TouchableOpacity
            style={styles.subButton}
            onPress={handleNotifications}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Notification size={20} color="#111111" variant="Bold" />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.subLabel}>Notifications</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Main FAB */}
        <Animated.View style={{ transform: [{ scale: mainScaleAnim }] }}>
          <TouchableOpacity
            style={styles.mainButton}
            onPress={toggle}
            onPressIn={() =>
              Animated.spring(mainScaleAnim, {
                toValue: 0.88,
                damping: 14,
                stiffness: 500,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(mainScaleAnim, {
                toValue: 1,
                damping: 10,
                stiffness: 200,
                useNativeDriver: true,
              }).start()
            }
            activeOpacity={1}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Add size={26} color="#111111" variant="Linear" />
            </Animated.View>

            {/* Unread dot — hidden when menu is open */}
            {!isOpen && (
              <Animated.View
                style={[styles.redDot, { opacity: dotAnim, transform: [{ scale: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}
                pointerEvents="none"
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 49,
  },
  column: {
    position: "absolute",
    alignItems: "flex-end",
    gap: 10,
    zIndex: 50,
  },
  subButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    backgroundColor: "#EF4444",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  mainButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  redDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
