import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

function normalizeAmount(v) {
  return String(v || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
}

/**
 * Mirror of web walletService.getBalance() — splits the raw wallet list
 * into named buckets so the UI can show manager-relevant stats.
 */
function resolveWalletStats(wallets) {
  const user     = wallets.find((w) => lower(w.type) === "user")     || null;
  const escrow   = wallets.find((w) => lower(w.type) === "escrow")   || null;
  const platform = wallets.find((w) => lower(w.type) === "platform") || null;
  const currency = user?.currency || escrow?.currency || "KSH";

  return {
    available:  Number(escrow?.availableBalance ?? escrow?.balance ?? 0),
    onHold:     Number(escrow?.lockedBalance ?? 0),
    userBal:    Number(user?.availableBalance  ?? user?.balance    ?? 0),
    currency,
    userWallet:   user,
    escrowWallet: escrow,
    platformWallet: platform,
    wallets,
  };
}

function txTypeLabel(tx) {
  const t = lower(tx?.type);
  if (t === "hold" && tx?.metadata?.releasedAt) return "released";
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

export default function WalletScreen({ navigation }) {
  const { user, role, accessToken } = useAuth();
  const isManager = lower(role) === "manager";

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [stats, setStats]           = useState(null);
  const [transactions, setTransactions] = useState([]);

  // Fund wallet state (manager only)
  const [fundAmount, setFundAmount]   = useState("");
  const [funding, setFunding]         = useState(false);
  const [fundError, setFundError]     = useState("");
  const [fundSuccess, setFundSuccess] = useState("");

  // Transaction filter state
  const [txSearch, setTxSearch]   = useState("");
  const [txFilter, setTxFilter]   = useState("all"); // all | deposit | debit | credit | commission | withdrawal
  const [txStatus, setTxStatus]   = useState("all"); // all | completed | pending | failed
  const [txDateFrom, setTxDateFrom] = useState(""); // YYYY-MM-DD
  const [txDateTo, setTxDateTo]     = useState(""); // YYYY-MM-DD
  const [showFilters, setShowFilters] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const [walletPayload, txPayload] = await Promise.all([
          apiRequest("/wallets", { token: accessToken }),
          apiRequest("/transactions", { token: accessToken, query: { limit: 50 } })
            .catch(() => ({ transactions: [] })),
        ]);

        const wallets = toArray(walletPayload, "wallets");
        setStats(resolveWalletStats(wallets));
        setTransactions(toArray(txPayload, "transactions"));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load wallet.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Fund wallet ───────────────────────────────────────────────────────────

  const handleFund = async () => {
    const amount = Number(fundAmount);
    if (!amount || amount <= 0) {
      setFundError("Enter a valid amount greater than 0.");
      return;
    }
    setFunding(true);
    setFundError("");
    setFundSuccess("");
    try {
      const result = await apiRequest("/wallets/fund", {
        token: accessToken,
        method: "POST",
        body: {
          amount,
          currency: stats?.currency || "KSH",
          description: `Escrow funding of ${formatMoney(amount, stats?.currency || "KSH")}`,
        },
      });
      const funded = result?.escrowFunding?.fundedContracts?.length || 0;
      setFundSuccess(
        funded
          ? `Funded! Escrow assigned to ${funded} contract${funded === 1 ? "" : "s"}.`
          : `Escrow wallet topped up with ${formatMoney(amount, stats?.currency || "KSH")}.`
      );
      setFundAmount("");
      // Refresh balances
      setTimeout(() => load({ isRefresh: true }), 800);
    } catch (err) {
      setFundError(err?.response?.data?.message || err?.message || "Failed to fund wallet.");
    } finally {
      setFunding(false);
    }
  };

  // ── Derived: filtered transactions ───────────────────────────────────────

  const visibleTx = transactions.filter((tx) => {
    const t = lower(txTypeLabel(tx));
    if (txFilter !== "all" && t !== txFilter) return false;
    // Status filter
    if (txStatus !== "all" && lower(tx.status) !== txStatus) return false;
    // Date range filter
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

  // Aggregate stats from transactions
  const totalDeposited = transactions.reduce((sum, tx) => {
    return lower(tx.status) === "completed" && lower(tx.type) === "deposit"
      ? sum + Number(tx.amount || 0)
      : sum;
  }, 0);

  const totalReleased = transactions.reduce((sum, tx) => {
    const desc = lower(tx.description || "");
    const isRelease =
      lower(tx.type) === "debit" &&
      lower(tx.status) === "completed" &&
      (desc.includes("released from escrow") || desc.includes("payment released"));
    return isRelease ? sum + Number(tx.amount || 0) : sum;
  }, 0);

  const currency = stats?.currency || "KSH";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Wallet"
      subtitle={
        isManager
          ? "Manage your escrow balance, fund work, and track payments."
          : "Your available balance and transaction history."
      }
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />
        ),
      }}
    >
      {loading ? (
        <StateCard>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.stateTitle}>Loading wallet…</Text>
        </StateCard>
      ) : error ? (
        <StateCard>
          <Text style={s.stateTitle}>Wallet unavailable</Text>
          <Text style={s.stateText}>{error}</Text>
          <Btn title="Try again" onPress={() => load()} />
        </StateCard>
      ) : (
        <>
          {/* ── Balance overview ── */}
          {isManager ? (
            <View style={s.statsGrid}>
              <StatCard
                label="Available escrow"
                value={formatMoney(stats?.available ?? 0, currency)}
                sub="Funds available before contract assignment"
                primary
              />
              <StatCard
                label="On hold"
                value={formatMoney(stats?.onHold ?? 0, currency)}
                sub="Reserved in active contract escrow"
              />
              <StatCard
                label="Released to hustlers"
                value={formatMoney(totalReleased, currency)}
                sub="Total paid out on approval"
              />
              <StatCard
                label="Total deposited"
                value={formatMoney(totalDeposited, currency)}
                sub="Lifetime deposits"
              />
            </View>
          ) : (
            // Hustler: show all wallets
            <View style={s.statsGrid}>
              {stats?.wallets?.length ? (
                stats.wallets.map((w) => (
                  <StatCard
                    key={w._id || w.id}
                    label={`${String(w.type || "Wallet").toUpperCase()} WALLET`}
                    value={formatMoney(w.availableBalance ?? w.balance ?? 0, w.currency || currency)}
                    sub={`Locked: ${formatMoney(w.lockedBalance ?? 0, w.currency || currency)}`}
                  />
                ))
              ) : (
                <StateCard>
                  <Text style={s.stateTitle}>No wallet yet</Text>
                  <Text style={s.stateText}>Your wallet will appear here once the platform sets it up.</Text>
                </StateCard>
              )}
            </View>
          )}

          {/* ── Fund wallet (manager only) ── */}
          {isManager ? (
            <InfoCard title="Top up escrow wallet">
              <Text style={s.hintText}>
                Add funds to your escrow balance. Platform fees are only deducted when you approve a hustler's work.
              </Text>
              <View style={s.fundRow}>
                <TextInput
                  style={s.fundInput}
                  value={fundAmount}
                  onChangeText={(v) => { setFundAmount(normalizeAmount(v)); setFundError(""); setFundSuccess(""); }}
                  placeholder={`Amount (${currency})`}
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={[s.fundBtn, funding && s.fundBtnDisabled]}
                  onPress={handleFund}
                  disabled={funding}
                  activeOpacity={0.8}
                >
                  {funding
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.fundBtnText}>Fund</Text>}
                </TouchableOpacity>
              </View>
              {fundError
                ? <View style={s.bannerError}><Text style={s.bannerErrorText}>{fundError}</Text></View>
                : null}
              {fundSuccess
                ? <View style={s.bannerSuccess}><Text style={s.bannerSuccessText}>{fundSuccess}</Text></View>
                : null}
            </InfoCard>
          ) : null}

          {/* ── Transaction history ── */}
          <InfoCard title={`Transactions (${visibleTx.length})`}>
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
              {["all", "deposit", "debit", "credit", "commission", "withdrawal"].map((f) => (
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
              style={s.advancedFilterToggle}
              onPress={() => setShowFilters((v) => !v)}
            >
              <Ionicons
                name={showFilters ? "chevron-up-outline" : "options-outline"}
                size={14}
                color={colors.accent}
              />
              <Text style={s.advancedFilterToggleText}>
                {showFilters ? "Hide filters" : "Date & status filters"}
              </Text>
              {(txStatus !== "all" || txDateFrom || txDateTo) ? (
                <View style={s.filterActiveDot} />
              ) : null}
            </Pressable>

            {showFilters ? (
              <View style={{ gap: 10 }}>
                {/* Status filter chips */}
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

                {/* Date range inputs */}
                <Text style={s.filterGroupLabel}>Date range</Text>
                <View style={s.dateRow}>
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    value={txDateFrom}
                    onChangeText={(v) => setTxDateFrom(v.replace(/[^\d-]/g, "").slice(0, 10))}
                    placeholder="From (YYYY-MM-DD)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    value={txDateTo}
                    onChangeText={(v) => setTxDateTo(v.replace(/[^\d-]/g, "").slice(0, 10))}
                    placeholder="To (YYYY-MM-DD)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>

                {/* Clear all advanced filters */}
                {(txStatus !== "all" || txDateFrom || txDateTo) ? (
                  <Pressable
                    style={s.clearFiltersBtn}
                    onPress={() => { setTxStatus("all"); setTxDateFrom(""); setTxDateTo(""); }}
                  >
                    <Text style={s.clearFiltersBtnText}>Clear date &amp; status filters</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {transactions.length === 0 ? (
              <Text style={s.emptyText}>No transactions yet.</Text>
            ) : visibleTx.length === 0 ? (
              <Text style={s.emptyText}>No transactions match that filter.</Text>
            ) : (
              <View style={s.txList}>
                {visibleTx.slice(0, 30).map((tx) => (
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
                      {tx.description
                        ? <Text style={s.txDesc} numberOfLines={2}>{tx.description}</Text>
                        : null}
                      <Text style={s.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                    <Text style={[
                      s.txAmount,
                      lower(tx.type) === "credit" || lower(tx.type) === "deposit"
                        ? s.txAmountCredit
                        : s.txAmountDebit,
                    ]}>
                      {lower(tx.type) === "credit" || lower(tx.type) === "deposit" ? "+" : "-"}
                      {formatMoney(tx.amount, tx.currency || currency)}
                    </Text>
                  </View>
                ))}
                {visibleTx.length > 30
                  ? <Text style={s.moreText}>Showing 30 of {visibleTx.length}. Use search to narrow down.</Text>
                  : null}
              </View>
            )}
          </InfoCard>
        </>
      )}
    </ScreenShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateCard({ children }) {
  return <View style={s.stateCard}>{children}</View>;
}

function InfoCard({ title, children }) {
  return (
    <View style={s.infoCard}>
      <Text style={s.infoCardTitle}>{title}</Text>
      <View style={s.infoCardDivider} />
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function StatCard({ label, value, sub, primary }) {
  return (
    <View style={[s.statCard, primary && s.statCardPrimary]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, primary && s.statValuePrimary]}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function Btn({ title, onPress, disabled }) {
  return (
    <Pressable
      style={[s.btn, disabled && s.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={s.btnText}>{title}</Text>
    </Pressable>
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

  statsGrid: { gap: spacing(1) },

  statCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 4,
  },
  statCardPrimary: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  statLabel: {
    fontSize: 11, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  statValue: { fontSize: 24, fontWeight: "900", color: colors.text },
  statValuePrimary: { color: colors.accent },
  statSub:   { fontSize: 12, color: colors.muted, lineHeight: 17 },

  infoCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75),
  },
  infoCardTitle:   { fontSize: 15, fontWeight: "800", color: colors.text },
  infoCardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

  hintText: { color: colors.muted, lineHeight: 21, fontSize: 13 },

  fundRow: { flexDirection: "row", gap: 10 },
  fundInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15,
    backgroundColor: "#fff",
  },
  fundBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingHorizontal: 20, alignItems: "center", justifyContent: "center",
    minWidth: 72,
  },
  fundBtnDisabled: { opacity: 0.6 },
  fundBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  bannerError: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, padding: 10,
  },
  bannerErrorText: { color: "#991B1B", fontWeight: "700", lineHeight: 20 },
  bannerSuccess: {
    backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0",
    borderRadius: 12, padding: 10,
  },
  bannerSuccessText: { color: "#065F46", fontWeight: "700", lineHeight: 20 },

  searchInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, color: colors.text, fontSize: 14,
    backgroundColor: "#fff",
  },

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  filterChipText:       { fontSize: 12, fontWeight: "800", color: colors.muted },
  filterChipTextActive: { color: colors.accent },

  advancedFilterToggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6,
  },
  advancedFilterToggleText: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  filterActiveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent,
  },
  filterGroupLabel: {
    fontSize: 11, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  dateRow: { flexDirection: "row", gap: 8 },
  clearFiltersBtn: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  clearFiltersBtnText: { color: "#991B1B", fontWeight: "800", fontSize: 12 },

  txList: { gap: 0 },
  txRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  txLeft:    { flex: 1, gap: 3 },
  txTypeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  txType:    { fontSize: 14, fontWeight: "800", color: colors.text },
  txStatusPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  txStatusText: { fontSize: 11, fontWeight: "700" },
  txDesc: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  txDate: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  txAmount:       { fontSize: 15, fontWeight: "800", color: colors.text, textAlign: "right" },
  txAmountCredit: { color: colors.success },
  txAmountDebit:  { color: colors.danger },

  emptyText: { color: colors.muted, lineHeight: 22 },
  moreText:  { color: colors.muted, fontSize: 12, fontWeight: "700", paddingTop: 6 },

  btn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800" },
});
