import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import NotificationBell from "../../components/NotificationBell.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatStatusLabel } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function nav(navigation, screen, params) {
  const parent = navigation?.getParent?.();
  (parent ?? navigation).navigate(screen, params);
}

// ─── Menu Row ─────────────────────────────────────────────────────────────────

function MenuRow({ icon, label, hint, onPress, badge, danger = false }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.text} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
        {hint ? <Text style={styles.menuHint}>{hint}</Text> : null}
      </View>
      {badge != null ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      )}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MoreScreen({ navigation }) {
  const { user, role, logout } = useAuth();
  const isHustler = lower(role) === "hustler";
  const isManager = lower(role) === "manager";
  const isAdmin   = lower(role) === "admin";

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || "—";
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const verStatus = lower(user?.verificationStatus || (user?.isEmailVerified ? "verified" : "pending"));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header bar with bell */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <View style={styles.content}>
        {/* User identity card — taps to Profile */}
        <Pressable
          style={({ pressed }) => [styles.userCard, pressed && { opacity: 0.85 }]}
          onPress={() => nav(navigation, "Profile")}
          accessibilityRole="button"
          accessibilityLabel="Open my profile"
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{fullName}</Text>
            <Text style={styles.userEmail}>{user?.email || "—"}</Text>
            <View style={styles.userBadgeRow}>
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>{formatStatusLabel(role)}</Text>
              </View>
              {verStatus === "verified" ? (
                <View style={styles.verPill}>
                  <Ionicons name="shield-checkmark-outline" size={11} color={colors.success} />
                  <Text style={styles.verPillText}>Verified</Text>
                </View>
              ) : (
                <View style={[styles.verPill, styles.verPillPending]}>
                  <Ionicons name="time-outline" size={11} color={colors.warning} />
                  <Text style={[styles.verPillText, { color: colors.warning }]}>Pending</Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {/* Main menu */}
        <View style={styles.menuCard}>

          <MenuRow
            icon="wallet-outline"
            label="Wallet"
            hint={isManager ? "Escrow balance and funding" : "Your balance and earnings"}
            onPress={() => nav(navigation, "Wallet")}
          />

          <Divider />

          <MenuRow
            icon="notifications-outline"
            label="Notifications"
            hint="Contracts, payments, approvals"
            onPress={() => nav(navigation, "Notifications")}
          />

          <Divider />

          <MenuRow
            icon="document-text-outline"
            label="My Applications"
            hint={isManager ? "Applications from hustlers" : "Jobs you applied to"}
            onPress={() => nav(navigation, "Applications")}
          />

          {isHustler ? (
            <>
              <Divider />
              <MenuRow
                icon="briefcase-outline"
                label="Browse Contracts"
                hint="Find new open jobs posted by managers"
                onPress={() => nav(navigation, "Contracts", { browseOnly: true })}
              />
              <Divider />
              <MenuRow
                icon="layers-outline"
                label="Work Stages"
                hint="View your assigned stages and submission status"
                onPress={() => nav(navigation, "Milestones")}
              />
            </>
          ) : null}

          {isManager ? (
            <>
              <Divider />
              <MenuRow
                icon="add-circle-outline"
                label="Add Work Stage"
                hint="Add a milestone to an existing contract"
                onPress={() => nav(navigation, "CreateMilestone")}
              />
              <Divider />
              <MenuRow
                icon="checkmark-circle-outline"
                label="Task Approvals"
                hint="Review and approve submitted work"
                onPress={() => nav(navigation, "TaskApprovals")}
              />
            </>
          ) : null}

          <Divider />

          <MenuRow
            icon="person-outline"
            label="Edit Profile"
            hint="Update your info, KYC, and skills"
            onPress={() => nav(navigation, "Profile")}
          />

          <Divider />

          <MenuRow
            icon="help-circle-outline"
            label="Support"
            hint="Open a ticket or get help"
            onPress={() => nav(navigation, "Support")}
          />

          {/* Admin-only section */}
          {isAdmin ? (
            <>
              <Divider />
              <MenuRow
                icon="people-outline"
                label="Users"
                hint="Manage users, KYC, and verification"
                onPress={() => nav(navigation, "AdminUsers")}
              />
              <Divider />
              <MenuRow
                icon="document-text-outline"
                label="All Contracts"
                hint="Platform-wide contracts overview"
                onPress={() => nav(navigation, "AdminContracts")}
              />
              <Divider />
              <MenuRow
                icon="cash-outline"
                label="Commission Wallet"
                hint="Platform earnings and transactions"
                onPress={() => nav(navigation, "AdminWallet")}
              />
              <Divider />
              <MenuRow
                icon="warning-outline"
                label="Disputes"
                hint="Review and resolve active disputes"
                onPress={() => nav(navigation, "AdminDisputes")}
              />
            </>
          ) : null}
        </View>

        {/* Sign out */}
        <View style={styles.menuCard}>
          <MenuRow
            icon="log-out-outline"
            label="Sign out"
            hint={`Signed in as ${user?.email || "unknown"}`}
            onPress={logout}
            danger
          />
        </View>

        <Text style={styles.footer}>HUSTLERS Platform · Mobile</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // Header bar
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },

  // Scrollable content area
  content: {
    flex: 1,
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(4),
    gap: spacing(1.5),
  },

  // User identity card
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userAvatarText: { color: "#fff", fontWeight: "800", fontSize: 18, letterSpacing: 1 },
  userInfo: { flex: 1, gap: 3 },
  userName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  userEmail: { color: colors.muted, fontSize: 13 },
  userBadgeRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  rolePill: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rolePillText: { color: "#fff", fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  verPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verPillPending: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  verPillText: { color: colors.success, fontSize: 11, fontWeight: "700" },

  // Menu card
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },

  // Menu row
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.5),
    gap: 14,
  },
  menuRowPressed: { backgroundColor: colors.background },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuIconDanger: { backgroundColor: "#FEF2F2" },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  menuLabelDanger: { color: colors.danger },
  menuHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  menuBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // Divider
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing(1.75) + 36 + 14 },

  // Footer
  footer: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 4 },
});
