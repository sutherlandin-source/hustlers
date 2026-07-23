import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme.js";
import BackButton from "./BackButton.js";

export default function ScreenShell({
  title,
  subtitle,
  children,
  showBack = false,
  onBackPress,
  rightAction = null,
  scrollProps = {},
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} {...scrollProps}>
        <View style={styles.header}>
          {showBack || rightAction ? (
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                {showBack ? (
                  <BackButton onPress={onBackPress} />
                ) : null}
              </View>
              {rightAction ? <View style={styles.headerAction}>{rightAction}</View> : null}
            </View>
          ) : null}

          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
    gap: spacing(2),
  },
  header: {
    gap: spacing(1),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing(2),
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(1),
  },
  headerText: {
    gap: 6,
  },
  headerAction: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
});
