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
import { getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function formatRelativeTime(value) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.floor(diff / 60_000);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 1)   return "Just now";
  if (min < 60)  return `${min}m ago`;
  if (hr < 24)   return `${hr}h ago`;
  if (day === 1) return "Yesterday";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getEffectiveStatus(dispute) {
  const s = lower(dispute?.status);
  const r = lower(dispute?.resolutionType);
  if (s === "closed")                     return "closed";
  if (r === "manager_approved")           return "closed";
  if (r === "release_full_payment")       return "resolved";
  return s || "open";
}

function statusColor(status) {
  const s = lower(status);
  if (s === "open")         return colors.danger;
  if (s === "under_review") return colors.accent;
  if (s === "resolved")     return colors.success;
  if (s === "closed")       return colors.muted;
  return colors.warning;
}

const STATUS_FILTERS = ["All", "Open", "Under Review", "Resolved", "Closed"];

// ─── Dispute Card ─────────────────────────────────────────────────────────────

function DisputeCard({ dispute, onPress }) {
  const status   = getEffectiveStatus(dispute);
  const sc       = statusColor(status);
  const raisedBy = getDisplayName(dispute?.raisedBy);
  const contract = dispute?.contract?.title || dispute?.contract?.jobTitle || "Untitled contract";
  const time     = formatRelativeTime(dispute?.updatedAt || dispute?.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(dispute)}
      accessibilityRole="button"
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusIndicator, { backgroundColor: sc }]} />
        <View style={styles.cardTitles}>
          <Text style={styles.cardReason} numberOfLines={1}>
            {dispute?.reason || "Dispute"}
          </Text>
          <Text style={styles.cardContract} numberOfLines={1}>{contract}</Text>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { borderColor: sc + "60", backgroundColor: sc + "12" }]}>
            <Text style={[styles.statusBadgeText, { color: sc }]}>{formatStatusLabel(status)}</Text>
          </View>
          {time ? <Text style={styles.cardTime}>{time}</Text> : null}
        </View>
      </View>

      <View style={styles.cardMeta}>
        {raisedBy !== "Unknown" ? (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={12} color={colors.muted} />
            <Text style={styles.metaText}>{raisedBy}</Text>
          </View>
        ) : null}
        {dispute?.adminNotes ? (
          <View style={styles.metaItem}>
            <Ionicons name="document-text-outline" size={12} color={colors.muted} />
            <Text style={styles.metaText} numberOfLines={1}>{dispute.adminNotes}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminDisputesScreen({ navigation }) {
  const { accessToken } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [disputes, setDisputes]     = useState([]);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest("/disputes", { token: accessToken });
        const list = payload?.disputes || payload?.data?.disputes || [];
        setDisputes(list);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load disputes.");
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
    return disputes.filter((d) => {
      const eff = getEffectiveStatus(d);
      if (statusFilter !== "All") {
        const sf = lower(statusFilter).replace(/ /g, "_");
        if (sf === "open"         && eff !== "open")         return false;
        if (sf === "under_review" && eff !== "under_review") return false;
        if (sf === "resolved"     && eff !== "resolved")     return false;
        if (sf === "closed"       && eff !== "closed")       return false;
      }
      if (term) {
        const hay = [
          d.reason, d.details,
          d.contract?.title,
          getDisplayName(d.raisedBy),
          getDisplayName(d.assignedTo),
        ].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [disputes, search, statusFilter]);

  const counts = useMemo(() => ({
    open:        disputes.filter((d) => getEffectiveStatus(d) === "open").length,
    under_review: disputes.filter((d) => getEffectiveStatus(d) === "under_review").length,
    resolved:    disputes.filter((d) => getEffectiveStatus(d) === "resolved").length,
    closed:      disputes.filter((d) => getEffectiveStatus(d) === "closed").length,
  }), [disputes]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle}>Disputes</Text>
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
          <View style={styles.statsRow}>
            {[
              { label: "Open",     value: counts.open,         warn: counts.open > 0 },
              { label: "Review",   value: counts.under_review, warn: counts.under_review > 0 },
              { label: "Resolved", value: counts.resolved },
              { label: "Closed",   value: counts.closed },
            ].map((s) => (
              <View key={s.label} style={[styles.statPill, s.warn && styles.statPillWarn]}>
                <Text style={[styles.statVal, s.warn && styles.statValWarn]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={17} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search reason, contract, user…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[styles.filterText, statusFilter === f && styles.filterTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading disputes…</Text>
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
            <Ionicons name="checkmark-done-outline" size={32} color={colors.muted} />
            <Text style={styles.stateText}>
              {disputes.length === 0 ? "No disputes on the platform." : "No disputes match your filters."}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.resultCount}>{filtered.length} dispute{filtered.length !== 1 ? "s" : ""}</Text>
            {filtered.map((d) => (
              <DisputeCard
                key={d._id || d.id}
                dispute={d}
                onPress={(dispute) => navigation.navigate("Dispute", {
                  disputeId: dispute._id || dispute.id,
                  contractTitle: dispute.contract?.title,
                })}
              />
            ))}
          </>
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

  statsRow: { flexDirection: "row", gap: 6 },
  statPill: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(1), alignItems: "center", gap: 2,
  },
  statPillWarn:  { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  statVal:       { color: colors.text, fontWeight: "800", fontSize: 18 },
  statValWarn:   { color: "#92400E" },
  statLabel:     { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },

  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8,
  },
  filterChipActive: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  filterText:       { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: colors.accent },

  resultCount: { color: colors.muted, fontSize: 12, fontWeight: "700" },

  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(1.5), gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  statusIndicator: { width: 3, alignSelf: "stretch", borderRadius: 2, flexShrink: 0 },
  cardTitles: { flex: 1, gap: 3 },
  cardReason:   { color: colors.text,  fontWeight: "800", fontSize: 14 },
  cardContract: { color: colors.muted, fontSize: 12 },
  cardRight: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  statusBadge: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },
  cardTime: { color: colors.muted, fontSize: 11 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.muted, fontSize: 12 },

  stateCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(2.5), alignItems: "flex-start", gap: 10,
  },
  stateText: { color: colors.muted, fontSize: 14 },
  retryBtn:  { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
