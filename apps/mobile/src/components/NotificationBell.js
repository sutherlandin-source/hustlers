import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUnreadNotifications } from "../hooks/useUnreadNotifications.js";
import { colors } from "../theme.js";

/**
 * NotificationBell
 *
 * A bell icon button that shows a live unread-count badge.
 * Navigates to the Notifications screen on press.
 *
 * Props:
 *   navigation — React Navigation navigation prop (required)
 *   size       — icon size (default 24)
 *   color      — icon color (default colors.text)
 */
export default function NotificationBell({ navigation, size = 24, color = colors.text }) {
  const { count } = useUnreadNotifications();
  const displayCount = count > 99 ? "99+" : count > 0 ? String(count) : null;

  const handlePress = () => {
    // Navigate from inside a tab — need to go up to the root Stack
    const parent = navigation?.getParent?.();
    (parent ?? navigation).navigate("Notifications");
  };

  return (
    <Pressable
      style={styles.wrap}
      onPress={handlePress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? `Notifications, ${count} unread`
          : "Notifications"
      }
    >
      <Ionicons name={count > 0 ? "notifications" : "notifications-outline"} size={size} color={color} />
      {displayCount ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{displayCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
  },
});
