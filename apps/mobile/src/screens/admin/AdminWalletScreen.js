/**
 * AdminWalletScreen
 * Displays the platform commission wallet balance and all transactions.
 * Parity with web's admin commission wallet page.
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
import { formatDate, formatMoney } from "../../utils/format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function toArray(payload, key) {
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload)) return payload;
  return [];
}

function txTypeLabel(tx) {
  const t = lower(tx?.type);
  const map = {
    debit:      "Debit",
    credit:     "Credit",
    deposit:    "Deposit",
    withdrawal: "Withdrawal",
    commission: "Commission",
    hold:       "Hold",
    refund:     "Refund",
  };
  return map[t] || (tx?.type || "—");
}

function txStatusColor(status) {
  const s = lower(status);
  if (s === "completed") return colors.success;
  if (s === "failed" || s === "cancelled") return colors.danger;
  return colors.warning;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminWalletScreen({ navigation }) {
  const { accessToken, role } = useAuth();
  const isAdmin = lower(role) === "admin";

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [platformWallet, setPlatformWallet] = useState(null);
  const [transactions, setTransactions]     = useState([]);

  // Filters
  const [txSearch, setTxSearch]   = useState("");
  const [txFilter, setTxFilter]   = useState("all");
  const [txStatus, setTxStatus]   = useState("all");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo]     = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken || !isAdmin) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const [walletPayload, txPayload] = await Promise.all([
          apiRequest("/wallets/admin/platform", { token: accessToken })
            .catch(() => null),
          apiRequest("/transactions/admin", { token: accessToken, query: { limit: 100 } })
            .catch(() => ({ transactions: [] })),
        ]);

        // Resolve platform wallet — try several response shapes
        const wallet =
          walletPayload?.wallet ||
          walletPayload?.data?.wallet ||
          (Array.isArray(walletPayload?.wallets)
            ? walletPayload.wallets.find((w) => lower(w.type) === "platform")
            : null) ||
          walletPayload ||
          null;

        setPlatformWallet(wallet);
        setTransactions(toArray(txPayload, "transactions"));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load admin wallet.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, isAdmin]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived: filtered transactions ───────────────────────────────────────

  const visibleTx = transactions.filter((tx) => {
    const t = lower(txTypeLabel(tx));
    if (txFilter !== "all" && t !== txFilter) return false;
    if (txStatus !== "all" && lower(tx.status) !== txStatus) return false;
    if (txDateFrom) {
      const txDate = new Date(tx.createdAt || 0);
      const from   = new Date(txDateFrom + "T00:00:00");
      if (txDate < from) return false;
    }
    if (txDateTo) {
      const txDate = new Date(tx.createdAt || 0);
      const to     = new Date(txDateTo + "T23:59:59");
      if (txDate > to) return false;
    }
    if (txSearch.trim()) {
      const hay = [txTypeLabel(tx), tx.description, tx.status, tx.amount, tx.referenceId]
        .join(" ").toLowerCase();
      if (!hay.includes(txSearch.trim().toLowerCase())) return false;
    }
    return true;
  });

  const currency = platformWallet?.currency || "KSH";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Commission Wallet"
      subtitle="Platform earnings from all completed contracts."
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />
        ),
      }}
    >
      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.stateTitle}>Loading wallet…</Text>
        </View>
      ) : error ? (
        <View style={s.stateCard}>
          <Text style={s.stateTitle}>Wallet unavailable</Text>
          <Text style={s.stateText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Balance overview ── */}
          <View style={s.statsGrid}>
            <View style={[s.statCard, s.statCardPrimary]}>
              <Text style={s.statLabel}>Available balance</Text>
              <Text style={[s.statValue, s.statValuePrimary]}>
                {formatMoney(platformWallet?.availableBalance ?? platformWallet?.balance ?? 0, currency)}
              </Text>
              <Text style={s.statSub}>Platform commission earnings</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>Total balance</Text>
              <Text style={s.statValue}>
                {formatMoney(platformWallet?.balance ?? 0, currency)}
              </Text>
            </View>
            {platformWallet?.lockedBalance > 0 ? (
              <View style={s.statCard}>
                <Text style={s.statLabel}>Locked</Text>
                <Text style={s.statValue}>
                  {formatMoney(platformWallet.lockedBalance, currency)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Transaction history ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Transactions ({visibleTx.length})</Text>
            <View style={s.cardDivider} />

            {/* Search */}
            <TextInput
              style={s.searchInput}
              value={txSearch}
              onChangeText={setTxSearch}
              placeholder="Search by type, description, status…"
              placeholderTextColor="#94A3B8"
            />

            {/* Type filter chips */}
            <View style={s.filterRow}>
              {["all", "commission", "deposit", "debit", "credit", "withdrawal"].map((f) => (
                <Pressable
                  key={f}
                  style={[s.filterChip, txFilter === f && s.filterChipActive]}
                  onPress={() => setTxFilter(f)}
                >
                  <Text style={[s.filterChipText, txFilter === f && s.filterChipTextActive]}>
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Advanced filters toggle */}
            <Pressable
              style={s.advancedToggle}
              onPress={() => setShowFilters((v) => !v)}
            >
              <Ionicons
                name={showFilters ? "chevron-up-outline" : "options-outline"}
                size={14}
                color={colors.accent}
              />
              <Text style={s.advancedToggleText}>
                {showFilters ? "Hide filters" : "Date & status filters"}
              </Text>
              {(txStatus !== "all" || txDateFrom || txDateTo) ? (
                <View style={s.filterDot} />
              ) : null}
            </Pressable>

            {showFilters ? (
              <View style={{ gap: 10 }}>
                <Text style={s.filterGroupLabel}>Status</Text>
                <View style={s.filterRow}>
                  {["all", "completed", "pending", "failed"].map((st) => (
                    <Pressable
                      key={st}
                      style={[s.filterChip, txStatus === st && s.filterChipActive]}
                      onPress={() => setTxStatus(st)}
                    >
                      <Text style={[s.filterChipText, txStatus === st && s.filterChipTextActive]}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.filterGroupLabel}>Date range</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    value={txDateFrom}
                    onChangeText={(v) => setTxDateFrom(v.replace(/[^\d-]/g, "").slice(0, 10))}
                    placeholder="From YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    value={txDateTo}
                    onChangeText={(v) => setTxDateTo(v.replace(/[^\d-]/g, "").slice(0, 10))}
                    placeholder="To YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>
                {(txStatus !== "all" || txDateFrom || txDateTo) ? (
                  <Pressable
                    style={s.clearBtn}
                    onPress={() => { setTxStatus("all"); setTxDateFrom(""); setTxDateTo(""); }}
                  >
                    <Text style={s.clearBtnText}>Clear date &amp; status filters</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Transaction list */}
            {transactions.length === 0 ? (
              <Text style={s.emptyText}>No transactions found.</Text>
            ) : visibleTx.length === 0 ? (
              <Text style={s.emptyText}>No transactions match that filter.</Text>
            ) : (
              <View style={s.txList}>
                {visibleTx.slice(0, 50).map((tx) => (
                  <View key={tx._id || tx.id} style={s.txRow}>
                    <View style={s.txLeft}>
                      <View style={s.txTypeRow}>
                        <Text style={s.txType}>{txTypeLabel(tx)}</Text>
                        <View style={[s.txStatusPill, { backgroundColor: txStatusColor(tx.status) + "22" }]}>
                          <Text style={[s.txStatusText, { color: txStatusColor(tx.status) }]}>
                            {String(tx.status || "pending").replace(/_/g, " ")}
                          </Text>
                        </View>
                      </View>
                      {tx.description ? (
                        <Text style={s.txDesc} numberOfLines={2}>{tx.description}</Text>
                      ) : null}
                      <Text style={s.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                    <Text style={[
                      s.txAmount,
                      lower(tx.type) === "credit" || lower(tx.type) === "commission" || lower(tx.type) === "deposit"
                        ? s.txAmountCredit
                        : s.txAmountDebit,
                    ]}>
                      {lower(tx.type) === "credit" || lower(tx.type) === "commission" || lower(tx.type) === "deposit" ? "+" : "-"}
                      {formatMoney(tx.amount, tx.currency || currency)}
                    </Text>
                  </View>
                ))}
                {visibleTx.length > 50 ? (
                  <Text style={s.moreText}>
                    Showing 50 of {visibleTx.length}. Use search to narrow results.
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </>
      )}
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2), gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, alignSelf: "flex-start" },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  statsGrid: { gap: spacing(1) },
  statCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 4,
  },
  statCardPrimary: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  statLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: 24, fontWeight: "900", color: colors.text },
  statValuePrimary: { color: colors.accent },
  statSub:   { fontSize: 12, color: colors.muted, lineHeight: 17 },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  cardDivider: { height: 1, backgroundColor: colors.border },

  searchInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontSize: 14, backgroundColor: "#fff",
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  filterChipText:       { fontSize: 12, fontWeight: "800", color: colors.muted },
  filterChipTextActive: { color: colors.accent },

  advancedToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  advancedToggleText: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  filterGroupLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  clearBtn: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, alignSelf: "flex-start" },
  clearBtnText: { color: "#991B1B", fontWeight: "800", fontSize: 12 },

  emptyText: { color: colors.muted, fontSize: 14, paddingVertical: 8 },
  txList: { gap: 0 },
  txRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  txLeft:    { flex: 1, gap: 3 },
  txTypeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  txType:    { fontSize: 13, fontWeight: "800", color: colors.text },
  txStatusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  txStatusText: { fontSize: 11, fontWeight: "800" },
  txDesc:   { color: colors.muted, fontSize: 12, lineHeight: 18 },
  txDate:   { color: colors.muted, fontSize: 11 },
  txAmount: { fontSize: 14, fontWeight: "900", color: colors.text, flexShrink: 0 },
  txAmountCredit: { color: colors.success },
  txAmountDebit:  { color: colors.danger },
  moreText: { color: colors.muted, fontSize: 12, paddingTop: 8 },
});
