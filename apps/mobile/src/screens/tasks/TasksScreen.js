import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { useAuth } from "../../context/AuthContext.js";
import { apiRequest } from "../../services/api.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney } from "../../utils/format.js";
import { matchesId } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function toArray(payload, key) {
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload)) return payload;
  return [];
}

function getWorkStatus(ms) {
  return lower(ms?.workStatus || ms?.status || "not_started");
}

function getEscrowStatus(ms) {
  return lower(ms?.contract?.escrowStatus || "");
}

/**
 * Returns a display label and colour for the work status.
 */
function workLabel(ws) {
  const map = {
    not_started:    { label: "Not Started",        color: "#94A3B8" },
    in_progress:    { label: "In Progress",         color: "#D97706" },
    work_submitted: { label: "Submitted",           color: "#2563EB" },
    submitted:      { label: "Submitted",           color: "#2563EB" },
    needs_revision:   { label: "Needs Revision",      color: "#DC2626" },
    "needs revision": { label: "Needs Revision",      color: "#DC2626" },
    rejected:       { label: "Rejected",            color: "#DC2626" },
    approved:       { label: "Approved & Paid",     color: "#059669" },
    completed:      { label: "Approved & Paid",     color: "#059669" },
  };
  return map[ws] || { label: "Pending", color: "#94A3B8" };
}

function escrowLabel(es) {
  const map = {
    waiting_for_funding: { label: "Awaiting Funding", ok: false },
    funded:              { label: "Payment Secured",   ok: true  },
    in_progress:         { label: "Payment Secured",   ok: true  },
    awaiting_approval:   { label: "Payment Secured",   ok: true  },
    released:            { label: "Payment Released",  ok: true  },
  };
  return map[es] || { label: "Payment Pending", ok: false };
}

function escrowReady(ms) {
  const es = getEscrowStatus(ms);
  return ["funded", "in_progress", "awaiting_approval", "released"].includes(es);
}

function isFinished(ms) {
  const ws = getWorkStatus(ms);
  const ps = lower(ms?.paymentStatus || "");
  return ws === "approved" || ws === "completed" || ps === "released";
}

function sortTasks(items) {
  const order = { in_progress: 0, work_submitted: 1, submitted: 1, needs_revision: 2, not_started: 3, rejected: 4, approved: 5, completed: 5 };
  return [...items].sort((a, b) => {
    const oa = order[getWorkStatus(a)] ?? 9;
    const ob = order[getWorkStatus(b)] ?? 9;
    if (oa !== ob) return oa - ob;
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TasksScreen({ navigation }) {
  const { user, role, accessToken } = useAuth();
  const isManager = lower(role) === "manager";
  const userId = user?._id || user?.id;

  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest("/milestones", {
          token: accessToken,
          query: isManager
            ? { limit: 30 }
            : { sellerOnly: true, limit: 50 },
        });

        let milestones = toArray(payload, "milestones");

        // For hustlers: filter to only their own milestones
        if (!isManager) {
          milestones = milestones.filter(
            (m) => matchesId(m.assignedTo, userId) || matchesId(m.submittedBy, userId)
          );
        }

        setTasks(sortTasks(milestones));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load tasks.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, isManager, userId]
  );

  // Refresh every time the screen comes into focus (e.g. after returning from TaskDetails)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openTask = (ms) => {
    const parent = navigation.getParent?.();
    (parent ?? navigation).navigate("TaskDetails", {
      milestoneId: ms._id || ms.id,
    });
  };

  // ── Render card ────────────────────────────────────────────────────────────

  const renderCard = (ms) => {
    const ws      = getWorkStatus(ms);
    const wl      = workLabel(ws);
    const es      = getEscrowStatus(ms);
    const el      = escrowLabel(es);
    const ready   = escrowReady(ms);
    const done    = isFinished(ms);
    const contract = ms.contract || {};
    const amount   = ms.amount || contract.amount;

    return (
      <Pressable key={ms._id || ms.id} style={styles.card} onPress={() => openTask(ms)}>
        {/* Title row */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{ms.title || "Task"}</Text>
            {contract.title
              ? <Text style={styles.cardContract} numberOfLines={1}>{contract.title}</Text>
              : null}
          </View>
          <View style={[styles.wsBadge, { backgroundColor: wl.color + "22" }]}>
            <Text style={[styles.wsBadgeText, { color: wl.color }]}>{wl.label}</Text>
          </View>
        </View>

        {/* Escrow + amount row */}
        <View style={styles.metaRow}>
          <View style={[styles.escrowPill, ready ? styles.escrowPillOk : styles.escrowPillWait]}>
            <Ionicons
              name={ready ? "shield-checkmark" : "shield-outline"}
              size={12}
              color={ready ? colors.success : colors.muted}
            />
            <Text style={[styles.escrowText, ready ? styles.escrowTextOk : null]}>
              {el.label}
            </Text>
          </View>
          {amount
            ? <Text style={styles.amount}>{formatMoney(amount, contract.currency || ms.currency || "KSH")}</Text>
            : null}
        </View>

        {/* Submission date if submitted */}
        {ms.submittedAt
          ? <Text style={styles.metaLine}>Submitted: {formatDate(ms.submittedAt)}</Text>
          : null}

        {/* Rejection reason if present */}
        {ms.rejectionReason && (ws === "needs_revision" || ws === "rejected")
          ? <Text style={styles.rejectionHint} numberOfLines={2}>
              ⚠ {ms.rejectionReason}
            </Text>
          : null}

        {/* Escrow warning for hustler when not ready */}
        {!isManager && !ready && !done
          ? <Text style={styles.escrowWarning}>
              Waiting for manager to fund escrow before you can start work.
            </Text>
          : null}

        <Text style={styles.tapHint}>Tap to view details →</Text>
      </Pressable>
    );
  };

  const active   = tasks.filter((m) => !isFinished(m));
  const finished = tasks.filter(isFinished);

  return (
    <ScreenShell
      title={isManager ? "Work Submissions" : "My Tasks"}
      subtitle={
        isManager
          ? "Review submitted milestones and approve or request revisions."
          : "Track your assigned work, start tasks, and submit completed work."
      }
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
          />
        ),
      }}
    >
      {/* Quick-nav shortcuts */}
      {!isManager ? (
        <Pressable
          style={styles.shortcut}
          onPress={() => navigation.navigate("Milestones")}
          accessibilityRole="button"
        >
          <Ionicons name="layers-outline" size={16} color={colors.accent} />
          <Text style={styles.shortcutText}>View all work stages →</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.shortcut}
          onPress={() => navigation.navigate("TaskApprovals")}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
          <Text style={styles.shortcutText}>Open task approvals queue →</Text>
        </Pressable>
      )}
      {loading ? (
        <StateCard>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading tasks…</Text>
          <Text style={styles.stateText}>Pulling your assigned work.</Text>
        </StateCard>
      ) : error ? (
        <StateCard>
          <Text style={styles.stateTitle}>Could not load tasks</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </StateCard>
      ) : tasks.length === 0 ? (
        <StateCard>
          <Text style={styles.stateTitle}>No tasks yet</Text>
          <Text style={styles.stateText}>
            {isManager
              ? "Submitted work from your hustlers will appear here."
              : "Once a manager accepts your application and assigns you a milestone, it will appear here."}
          </Text>
        </StateCard>
      ) : (
        <>
          {active.length > 0 ? (
            <>
              <SectionLabel title="Active" count={active.length} />
              {active.map(renderCard)}
            </>
          ) : null}

          {finished.length > 0 ? (
            <>
              <SectionLabel title="Completed" count={finished.length} />
              {finished.map(renderCard)}
            </>
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateCard({ children }) {
  return <View style={styles.stateCard}>{children}</View>;
}

function SectionLabel({ title, count }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      <Text style={styles.sectionLabelCount}>{count}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shortcut: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  shortcutText: { color: colors.accent, fontWeight: "700", fontSize: 13 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.75),
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardTitle:    { fontSize: 15, fontWeight: "800", color: colors.text },
  cardContract: { color: colors.muted, fontSize: 13, marginTop: 3 },
  wsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  wsBadgeText: { fontSize: 12, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  escrowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  escrowPillOk:   { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  escrowPillWait: { borderColor: colors.border, backgroundColor: "#F8FAFC" },
  escrowText:    { fontSize: 12, fontWeight: "700", color: colors.muted },
  escrowTextOk:  { color: colors.success },
  amount:        { fontSize: 14, fontWeight: "800", color: colors.text },
  metaLine:      { fontSize: 12, color: colors.muted, fontWeight: "600" },
  rejectionHint: { fontSize: 13, color: colors.danger, fontWeight: "700", lineHeight: 18 },
  escrowWarning: {
    fontSize: 12, color: colors.warning, fontWeight: "700",
    backgroundColor: "#FFFBEB", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  tapHint: { fontSize: 12, color: colors.muted, fontWeight: "700", textAlign: "right" },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabelText:  { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionLabelCount: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(2),
    gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },
  retryBtn:   { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  retryText:  { color: "#fff", fontWeight: "800" },
});
