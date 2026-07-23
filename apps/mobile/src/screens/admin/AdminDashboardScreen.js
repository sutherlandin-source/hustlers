import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatMoney, formatDate, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";
import NotificationBell from "../../components/NotificationBell.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function formatRelativeTime(value) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1)  return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24)  return `${hr}h ago`;
  if (day === 1) return "Yesterday";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildStats(users, contracts, disputes, transactions) {
  const totalUsers     = users.length;
  const hustlers       = users.filter((u) => lower(u.role) === "hustler").length;
  const managers       = users.filter((u) => lower(u.role) === "manager").length;
  const pendingKyc     = users.filter((u) => lower(u.verificationStatus) === "pending" && u.idNumber).length;
  const suspended      = users.filter((u) => !u.isActive || lower(u.accountStatus) === "suspended").length;

  const activeContracts    = contracts.filter((c) => ["assigned", "active", "in_progress", "pending"].includes(lower(c.status))).length;
  const completedContracts = contracts.filter((c) => lower(c.status) === "completed").length;
  const openDisputes       = disputes.filter((d) => ["open", "under_review", "waiting_for_evidence"].includes(lower(d.status))).length;

  const platformWallet = null; // resolved separately
  const txVolume = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const txCurrency = transactions[0]?.currency || "KSH";

  return {
    totalUsers, hustlers, managers, pendingKyc, suspended,
    activeContracts, completedContracts, openDisputes,
    txVolume, txCurrency,
  };
}

function buildActivity(users, contracts, disputes) {
  const items = [
    ...contracts.slice(0, 4).map((c) => ({
      key: `c-${c._id || c.id}`,
      icon: "briefcase-outline",
      title: c.title || "Contract updated",
      sub:   formatStatusLabel(c.status),
      time:  c.updatedAt || c.createdAt,
    })),
    ...disputes.slice(0, 3).map((d) => ({
      key: `d-${d._id || d.id}`,
      icon: "alert-circle-outline",
      title: d.reason || "Dispute opened",
      sub:   formatStatusLabel(d.status),
      time:  d.updatedAt || d.createdAt,
      danger: ["open", "under_review"].includes(lower(d.status)),
    })),
    ...users.slice(0, 3).map((u) => ({
      key: `u-${u._id || u.id}`,
      icon: "person-outline",
      title: getDisplayName(u) || u.email || "New user",
      sub:   `${formatStatusLabel(u.role)} · ${u.isActive ? "Active" : "Suspended"}`,
      time:  u.createdAt,
    })),
  ];
  return items
    .filter((i) => i.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, hint, accent = false, warn = false }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent, warn && styles.statCardWarn]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent, warn && styles.statValueWarn]}>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function ShortcutCard({ icon, label, hint, onPress, badge }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.75 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.shortcutIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        {badge > 0 ? (
          <View style={styles.shortcutBadge}>
            <Text style={styles.shortcutBadgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
      {hint ? <Text style={styles.shortcutHint}>{hint}</Text> : null}
    </Pressable>
  );
}

function ActivityItem({ item }) {
  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, item.danger && styles.activityIconDanger]}>
        <Ionicons name={item.icon} size={16} color={item.danger ? colors.danger : colors.muted} />
      </View>
      <View style={styles.activityBody}>
        <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.activitySub}>{item.sub}</Text>
      </View>
      {item.time ? (
        <Text style={styles.activityTime}>{formatRelativeTime(item.time)}</Text>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminDashboardScreen({ navigation }) {
  const { accessToken, user } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");

  const [users, setUsers]           = useState([]);
  const [contracts, setContracts]   = useState([]);
  const [disputes, setDisputes]     = useState([]);
  const [transactions, setTransactions] = useState([]);

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const [usersPayload, contractsPayload, disputesPayload, txPayload] = await Promise.all([
          apiRequest("/users",        { token: accessToken, query: { limit: 100 } }),
          apiRequest("/contracts",    { token: accessToken, query: { limit: 50  } }),
          apiRequest("/disputes",     { token: accessToken }),
          apiRequest("/transactions", { token: accessToken, query: { limit: 20 } }).catch(() => ({ transactions: [] })),
        ]);

        setUsers(       (usersPayload?.users        || usersPayload?.data?.users        || []).slice(0, 100));
        setContracts(   (contractsPayload?.contracts || contractsPayload?.data?.contracts || []).slice(0, 50));
        setDisputes(    (disputesPayload?.disputes   || disputesPayload?.data?.disputes   || []));
        setTransactions((txPayload?.transactions     || txPayload?.data?.transactions     || []).slice(0, 20));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load dashboard data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats    = buildStats(users, contracts, disputes, transactions);
  const activity = buildActivity(users, contracts, disputes);

  const nav = (screen, params) => navigation.navigate(screen, params);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerEyebrow}>Admin</Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        <NotificationBell navigation={navigation} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()} hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Stats grid */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Platform overview</Text>
          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading stats…</Text>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <StatCard label="Total users"      value={String(stats.totalUsers)}      hint="All accounts" />
              <StatCard label="Hustlers"          value={String(stats.hustlers)}         hint="Worker accounts" />
              <StatCard label="Managers"          value={String(stats.managers)}         hint="Employer accounts" />
              <StatCard label="Active contracts"  value={String(stats.activeContracts)}  hint="In progress" accent />
              <StatCard label="Completed"         value={String(stats.completedContracts)} hint="Finished contracts" />
              <StatCard label="Open disputes"     value={String(stats.openDisputes)}     hint="Needs review" warn={stats.openDisputes > 0} />
              <StatCard label="Pending KYC"       value={String(stats.pendingKyc)}       hint="Awaiting verification" warn={stats.pendingKyc > 0} />
              <StatCard label="Suspended"         value={String(stats.suspended)}        hint="Inactive accounts" />
              <StatCard
                label="Tx volume"
                value={formatMoney(stats.txVolume, stats.txCurrency)}
                hint="Recent transactions"
              />
            </View>
          )}
        </View>

        {/* Shortcuts */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Quick access</Text>
          <View style={styles.shortcutsGrid}>
            <ShortcutCard
              icon="people-outline"
              label="Users"
              hint="Manage accounts"
              badge={stats.pendingKyc}
              onPress={() => nav("AdminUsers")}
            />
            <ShortcutCard
              icon="briefcase-outline"
              label="Contracts"
              hint="All jobs"
              onPress={() => nav("Contracts")}
            />
            <ShortcutCard
              icon="alert-circle-outline"
              label="Disputes"
              hint="Open cases"
              badge={stats.openDisputes}
              onPress={() => nav("AdminDisputes")}
            />
            <ShortcutCard
              icon="shield-checkmark-outline"
              label="Verification"
              hint="KYC queue"
              badge={stats.pendingKyc}
              onPress={() => nav("AdminUsers", { filterVerification: true })}
            />
            <ShortcutCard
              icon="wallet-outline"
              label="Wallet"
              hint="Platform funds"
              onPress={() => nav("Wallet")}
            />
            <ShortcutCard
              icon="notifications-outline"
              label="Notifications"
              hint="System alerts"
              onPress={() => nav("Notifications")}
            />
          </View>
        </View>

        {/* Recent activity */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recent activity</Text>
          <View style={styles.activityCard}>
            {loading ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : activity.length === 0 ? (
              <Text style={styles.emptyNote}>No recent activity.</Text>
            ) : (
              activity.map((item) => <ActivityItem key={item.key} item={item} />)
            )}
          </View>
        </View>

        {/* Open disputes list */}
        {!loading && disputes.filter((d) => ["open", "under_review"].includes(lower(d.status))).length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Open disputes</Text>
              <Pressable onPress={() => nav("AdminDisputes")} hitSlop={8}>
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>
            <View style={styles.activityCard}>
              {disputes
                .filter((d) => ["open", "under_review"].includes(lower(d.status)))
                .slice(0, 5)
                .map((d) => (
                  <Pressable
                    key={d._id || d.id}
                    style={({ pressed }) => [styles.disputeRow, pressed && { opacity: 0.75 }]}
                    onPress={() => nav("Dispute", { disputeId: d._id || d.id, contractTitle: d.contract?.title })}
                  >
                    <View style={styles.disputeLeft}>
                      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.disputeTitle} numberOfLines={1}>
                          {d.reason || d.contract?.title || "Dispute"}
                        </Text>
                        <Text style={styles.disputeSub}>
                          {formatStatusLabel(d.status)} · {formatRelativeTime(d.createdAt)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.muted} />
                  </Pressable>
                ))}
            </View>
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

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
  headerText: { gap: 2 },
  headerEyebrow: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  headerTitle:   { fontSize: 22, fontWeight: "800", color: colors.text },

  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(5),
    gap: spacing(2),
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errorText:  { flex: 1, color: colors.danger, fontWeight: "700", fontSize: 13 },
  retryText:  { color: colors.accent, fontWeight: "800", fontSize: 13 },

  section:       { gap: spacing(1) },
  sectionLabel:  { color: colors.muted, fontWeight: "800", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll:        { color: colors.accent, fontWeight: "700", fontSize: 13 },

  // Stats
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    minWidth: "28%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.25),
    gap: 4,
  },
  statCardAccent: { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" },
  statCardWarn:   { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  statValue: { color: colors.text,  fontSize: 20, fontWeight: "800" },
  statValueAccent: { color: colors.accent },
  statValueWarn:   { color: "#92400E" },
  statHint:  { color: colors.muted, fontSize: 11 },

  // Shortcuts
  shortcutsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: {
    minWidth: "28%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.5),
    gap: 6,
    alignItems: "flex-start",
  },
  shortcutIcon: { position: "relative" },
  shortcutBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  shortcutBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  shortcutLabel: { color: colors.text,  fontWeight: "800", fontSize: 13 },
  shortcutHint:  { color: colors.muted, fontSize: 11 },

  // Activity
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing(1.25),
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  activityIconDanger: { backgroundColor: "#FEF2F2" },
  activityBody: { flex: 1, gap: 2 },
  activityTitle: { color: colors.text,  fontWeight: "700", fontSize: 13 },
  activitySub:   { color: colors.muted, fontSize: 11 },
  activityTime:  { color: colors.muted, fontSize: 11, flexShrink: 0 },

  // Disputes
  disputeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing(1.25),
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  disputeLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  disputeTitle: { color: colors.text,  fontWeight: "700", fontSize: 13 },
  disputeSub:   { color: colors.muted, fontSize: 11 },

  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: colors.muted, fontSize: 14 },
  emptyNote:   { color: colors.muted, fontSize: 13, padding: spacing(1.5) },
});
