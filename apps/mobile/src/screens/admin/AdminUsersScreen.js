import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import BackButton from "../../components/BackButton.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function verificationColor(status) {
  if (lower(status) === "verified")  return colors.success;
  if (lower(status) === "rejected")  return colors.danger;
  if (lower(status) === "pending")   return colors.warning;
  return colors.muted;
}

function accountStatusColor(user) {
  if (!user?.isActive || lower(user?.accountStatus) === "suspended")   return colors.danger;
  if (lower(user?.accountStatus) === "deactivated")                     return colors.muted;
  return colors.success;
}

function accountStatusLabel(user) {
  if (lower(user?.accountStatus) === "suspended")   return "Suspended";
  if (lower(user?.accountStatus) === "deactivated") return "Deactivated";
  if (user?.isActive) return "Active";
  return "Inactive";
}

const ROLE_FILTERS   = ["All", "Hustler", "Manager", "Admin"];
const STATUS_FILTERS = ["All", "Active", "Suspended", "Pending KYC"];

// ─── User Card ────────────────────────────────────────────────────────────────

function UserCard({ user, onPress }) {
  const name    = getDisplayName(user) || user?.email || "—";
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const verStatus = user?.verificationStatus || (user?.isEmailVerified ? "verified" : "pending");
  const acStatus  = accountStatusLabel(user);
  const acColor   = accountStatusColor(user);

  return (
    <Pressable
      style={({ pressed }) => [styles.userCard, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(user)}
      accessibilityRole="button"
      accessibilityLabel={`View ${name}`}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{initials}</Text>
      </View>

      <View style={styles.userBody}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>{name}</Text>
          <View style={[styles.statusDot, { backgroundColor: acColor }]} />
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>{user?.email || "—"}</Text>

        <View style={styles.userBadgeRow}>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{formatStatusLabel(user?.role)}</Text>
          </View>
          <View style={[styles.verPill, { borderColor: verificationColor(verStatus) + "80" }]}>
            <Text style={[styles.verPillText, { color: verificationColor(verStatus) }]}>
              {formatStatusLabel(verStatus)}
            </Text>
          </View>
          {acStatus !== "Active" ? (
            <View style={[styles.acPill, { borderColor: acColor + "80" }]}>
              <Text style={[styles.acPillText, { color: acColor }]}>{acStatus}</Text>
            </View>
          ) : null}
        </View>

        {user?.location ? (
          <Text style={styles.userMeta}>
            <Ionicons name="location-outline" size={11} color={colors.muted} /> {user.location}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminUsersScreen({ route, navigation }) {
  const { accessToken } = useAuth();
  const startVerification = Boolean(route?.params?.filterVerification);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [users, setUsers]           = useState([]);

  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("All");
  const [statusFilter, setStatusFilter] = useState(startVerification ? "Pending KYC" : "All");

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest("/users", { token: accessToken, query: { limit: 200 } });
        const list = payload?.users || payload?.data?.users || [];
        setUsers(list);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load users.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "All" && lower(u.role) !== lower(roleFilter)) return false;
      if (statusFilter === "Active"      && (!u.isActive || lower(u.accountStatus) === "suspended")) return false;
      if (statusFilter === "Suspended"   && !(lower(u.accountStatus) === "suspended" || (!u.isActive && lower(u.accountStatus) !== "deactivated"))) return false;
      if (statusFilter === "Pending KYC" && !(lower(u.verificationStatus) === "pending" && u.idNumber)) return false;
      if (term) {
        const hay = [
          u.firstName, u.lastName, u.email, u.role,
          u.phoneNumber, u.location, u.companyName,
        ].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(() => ({
    total:      users.length,
    hustlers:   users.filter((u) => lower(u.role) === "hustler").length,
    managers:   users.filter((u) => lower(u.role) === "manager").length,
    suspended:  users.filter((u) => lower(u.accountStatus) === "suspended" || !u.isActive).length,
    pendingKyc: users.filter((u) => lower(u.verificationStatus) === "pending" && u.idNumber).length,
  }), [users]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle}>Users</Text>
        <View style={{ width: 40 }} />
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
        {/* Stats strip */}
        {!loading ? (
          <View style={styles.statsStrip}>
            <View style={styles.statPill}><Text style={styles.statPillVal}>{counts.total}</Text><Text style={styles.statPillLabel}>Total</Text></View>
            <View style={styles.statPill}><Text style={styles.statPillVal}>{counts.hustlers}</Text><Text style={styles.statPillLabel}>Hustlers</Text></View>
            <View style={styles.statPill}><Text style={styles.statPillVal}>{counts.managers}</Text><Text style={styles.statPillLabel}>Managers</Text></View>
            <View style={[styles.statPill, counts.suspended > 0 && styles.statPillWarn]}>
              <Text style={[styles.statPillVal, counts.suspended > 0 && styles.statPillValWarn]}>{counts.suspended}</Text>
              <Text style={styles.statPillLabel}>Suspended</Text>
            </View>
            <View style={[styles.statPill, counts.pendingKyc > 0 && styles.statPillWarn]}>
              <Text style={[styles.statPillVal, counts.pendingKyc > 0 && styles.statPillValWarn]}>{counts.pendingKyc}</Text>
              <Text style={styles.statPillLabel}>KYC Queue</Text>
            </View>
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={17} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, location…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Role filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {ROLE_FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, roleFilter === f && styles.filterChipActive]}
              onPress={() => setRoleFilter(f)}
            >
              <Text style={[styles.filterChipText, roleFilter === f && styles.filterChipTextActive]}>{f}</Text>
            </Pressable>
          ))}
          <View style={styles.filterDivider} />
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Count */}
        {!loading ? (
          <Text style={styles.resultCount}>
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
            {search || roleFilter !== "All" || statusFilter !== "All" ? " matched" : ""}
          </Text>
        ) : null}

        {/* List */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading users…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="warning-outline" size={24} color={colors.danger} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="people-outline" size={32} color={colors.muted} />
            <Text style={styles.stateText}>No users match your filters.</Text>
          </View>
        ) : (
          filtered.map((u) => (
            <UserCard
              key={u._id || u.id}
              user={u}
              onPress={(user) => navigation.navigate("AdminUserDetail", { userId: user._id || user.id })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  navbar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing(2), paddingVertical: spacing(1.25), gap: 10,
  },
  navTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.text },

  content: {
    paddingHorizontal: spacing(2), paddingTop: spacing(1.5),
    paddingBottom: spacing(5), gap: spacing(1.25),
  },

  statsStrip: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statPill: {
    flexGrow: 1, minWidth: 60,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(1), alignItems: "center", gap: 2,
  },
  statPillWarn:    { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  statPillVal:     { color: colors.text,   fontWeight: "800", fontSize: 18 },
  statPillValWarn: { color: "#92400E" },
  statPillLabel:   { color: colors.muted,  fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },

  filterRow: { gap: 8, paddingVertical: 2 },
  filterDivider: { width: 1, height: "100%", backgroundColor: colors.border, marginHorizontal: 4 },
  filterChip: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8,
  },
  filterChipActive:     { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  filterChipText:       { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterChipTextActive: { color: colors.accent },

  resultCount: { color: colors.muted, fontSize: 12, fontWeight: "700" },

  userCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(1.5), flexDirection: "row",
    alignItems: "center", gap: 12,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  userAvatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  userBody: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userName:  { flex: 1, color: colors.text,  fontWeight: "800", fontSize: 14 },
  userEmail: { color: colors.muted, fontSize: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  userBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  rolePill: {
    backgroundColor: colors.primary, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  rolePillText: { color: "#fff", fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  verPill: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  verPillText: { fontSize: 10, fontWeight: "700" },
  acPill:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  acPillText: { fontSize: 10, fontWeight: "700" },
  userMeta: { color: colors.muted, fontSize: 11 },

  stateCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(2.5), alignItems: "flex-start", gap: 10,
  },
  stateText: { color: colors.muted, fontSize: 14 },
  retryBtn:  { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
