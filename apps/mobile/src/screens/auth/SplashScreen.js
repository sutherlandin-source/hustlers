import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme.js";

export default function SplashScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobBottom} />

        <View style={styles.brandMark}>
          <View style={styles.logoRing}>
            <View style={styles.logoCore}>
              <Ionicons name="briefcase-outline" size={34} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.brandName}>HUSTLERS</Text>
          <Text style={styles.brandTagline}>Work, approvals, and payments in one place.</Text>
        </View>

        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingTitle}>Preparing your workspace</Text>
          <Text style={styles.loadingText}>Checking your saved session and loading the right dashboard.</Text>
        </View>

        <View style={styles.stepRow}>
          <Step label="Session" />
          <Step label="Token" />
          <Step label="Role" />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Step({ label }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepDot} />
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    overflow: "hidden",
  },
  backgroundBlobTop: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#E2E8F0",
    opacity: 0.65,
  },
  backgroundBlobBottom: {
    position: "absolute",
    bottom: -70,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#DBEAFE",
    opacity: 0.7,
  },
  brandMark: {
    marginBottom: spacing(2),
  },
  logoRing: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoCore: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: 8,
  },
  brandName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: 2.5,
  },
  brandTagline: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
  },
  loadingCard: {
    marginTop: spacing(3),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2.25),
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: 10,
    boxShadow: "0px 8px 18px rgba(0, 0, 0, 0.04)",
    elevation: 2,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  stepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: spacing(2),
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  stepLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
});
