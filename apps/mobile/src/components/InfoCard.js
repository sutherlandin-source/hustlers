import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme.js";

export default function InfoCard({ label, value, hint }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing(1.5),
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    flex: 1,
    minWidth: "48%",
    minHeight: 96,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 22,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
});
