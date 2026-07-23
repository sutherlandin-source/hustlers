/**
 * BackButton — shared navigation back button.
 *
 * Consistent style across every screen:
 *  • 40 × 40 pill, slightly rounded (radius 14)
 *  • White surface with a subtle border
 *  • Chevron left icon, 20 px
 *  • Pressed state: slight scale-down + darker background
 *  • hitSlop so the tap target is comfortable
 *  • accessibilityRole and label for screen readers
 */
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme.js";

export default function BackButton({ onPress, color, style }) {
  const iconColor = color || colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={20} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    // subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  btnPressed: {
    backgroundColor: "#F1F5F9",
    transform: [{ scale: 0.93 }],
  },
});
