/**
 * AdminContractsScreen
 * Read-only list of all platform contracts for admin review.
 * Parity with web's AdminContractsPage.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function statusColor(status) {
  const s = lower(status);
  if (s === "completed") return colors.success;
  if (s === "active" || s === "open") return colors.accent;
  if (s === "disputed") return colors.danger;
  if (s === "draft" || s === "pending") return colors.warning;
  if (s === "cancelled" || s === "terminated") return colors.danger;
  return colors.muted;
}

function extractContracts(payload) {
  if (Array.isArray(payload?.contracts)) return payload.contracts;
  if (Array.isArray(payload?.data?.contracts)) return payload.data.contracts;
  if (Array.isArray(payload)) return payload;
  return [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContractCard({ contract, onPress }) {
  const status = contract?.status || "unknown";
  const manager = getDisplayName(contract?.buyer || contract?.manager);
  const currency = contract?.currency || "KSH";

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && s.cardPressed]}
      onPress={() => onPress(contract)}
      accessibilityRole="button"
      accessibilityLabel={contract?.title || "Contract"}
    >
      <View style={s.cardRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {contract?.title || "Untitled contract"}
          </Text>
          <Text style={s.cardMeta}>
            {contract?.jobCategory || "—"} · {manager || "Unknown manager"}
          </Text>
          <Text style={s.cardMeta}>
            {formatMoney(contract?.amount, currency)} · {contract?.numWorkers || 1} worker{Number(contract?.numWorkers || 1) !== 1 ? "s" : ""}
          </Text>
          {contract?.createdAt ? (
            <Text style={s.cardDate}>Created {formatDate(contract.createdAt)}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <View style={[s.statusPill, { backgroundColor: statusColor(status) + "22" }]}>
            <Text style={[s.statusText, { color: statusColor(status) }]}>
              {formatStatusLabel(status)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "draft", "open", "active", "completed", "disputed", "cancelled"];

export default function AdminContractsScreen({ navigation }) {
  const { accessToken, role } = useAuth();
  const isAdmin = lower(role) === "admin";

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [contracts, setContracts]   = useState([]);

  // Filters
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken || !isAdmin) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const payload = await apiRequest("/contracts/admin/all", {
          token: accessToken,
          query: { limit: 200 },
        }).catch(() =>
          // Fallback to the regular contracts endpoint with an admin flag
          apiRequest("/contracts", {
            token: accessToken,
            query: { limit: 200, all: true },
          })
        );
        setContracts(extractContracts(payload));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load contracts.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, isAdmin]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived: filtered contracts ───────────────────────────────────────────

  const visible = contracts.filter((c) => {
    if (statusFilter !== "all" && lower(c.status) !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        c.title,
        c.jobCategory,
        getDisplayName(c.buyer || c.manager),
        c.status,
        c._id || c.id,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleOpen = (contract) => {
    const contractId = contract?._id || contract?.id;
    if (!contractId) return;
    navigation.navigate("ContractDetails", { contractId });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="All Contracts"
      subtitle="Platform-wide read-only view of all contracts."
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />
        ),
      }}
    >
      {/* Stats bar */}
      {!loading && !error ? (
        <View style={s.statsRow}>
          <View style={s.statPill}>
            <Text style={s.statPillLabel}>Total</Text>
            <Text style={s.statPillValue}>{contracts.length}</Text>
          </View>
          {["active", "completed", "disputed"].map((st) => (
            <View key={st} style={s.statPill}>
              <Text style={s.statPillLabel}>{formatStatusLabel(st)}</Text>
              <Text style={[s.statPillValue, { color: statusColor(st) }]}>
                {contracts.filter((c) => lower(c.status) === st).length}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Search */}
      <TextInput
        style={s.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by title, category, manager, status…"
        placeholderTextColor="#94A3B8"
      />

      {/* Status filter chips */}
      <View style={s.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[s.filterChip, statusFilter === f && s.filterChipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[s.filterChipText, statusFilter === f && s.filterChipTextActive]}>
              {f === "all" ? "All" : formatStatusLabel(f)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* States */}
      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.stateTitle}>Loading contracts…</Text>
        </View>
      ) : error ? (
        <View style={s.stateCard}>
          <Ionicons name="warning-outline" size={24} color={colors.danger} />
          <Text style={s.stateTitle}>Could not load contracts</Text>
          <Text style={s.stateText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visible.length === 0 ? (
        <View style={s.stateCard}>
          <Ionicons name="document-outline" size={28} color={colors.muted} />
          <Text style={s.stateTitle}>
            {contracts.length === 0 ? "No contracts yet" : "No contracts match that filter"}
          </Text>
        </View>
      ) : (
        <>
          <Text style={s.countLabel}>
            Showing {visible.length} of {contracts.length} contract{contracts.length !== 1 ? "s" : ""}
          </Text>
          {visible.map((c) => (
            <ContractCard
              key={c._id || c.id}
              contract={c}
              onPress={handleOpen}
            />
          ))}
        </>
      )}
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1) },
  statPill: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 2,
    alignItems: "center",
  },
  statPillLabel: { fontSize: 10, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  statPillValue: { fontSize: 18, fontWeight: "900", color: colors.text },

  searchInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontSize: 14, backgroundColor: colors.surface,
  },

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  filterChipActive:     { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  filterChipText:       { fontSize: 12, fontWeight: "800", color: colors.muted },
  filterChipTextActive: { color: colors.accent },

  countLabel: { fontSize: 12, color: colors.muted, fontWeight: "700" },

  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2), gap: 10, alignItems: "flex-start",
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },
  retryBtn: {
    marginTop: 4, backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75),
  },
  cardPressed: { opacity: 0.75 },
  cardRow:   { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text, lineHeight: 21 },
  cardMeta:  { fontSize: 13, color: colors.muted, lineHeight: 19 },
  cardDate:  { fontSize: 12, color: colors.muted },

  statusPill:  { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: "800" },
});
