/**
 * MilestonesScreen
 * Hustler's assigned work-stage list.
 * Parity with web MilestonesPage + MilestoneDetailsPage inline actions.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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

function lower(v) { return String(v || "").trim().toLowerCase(); }

function getWorkStatus(stage) {
  return lower(stage?.workStatus || stage?.status || "not_started");
}

function statusLabel(ws) {
  const map = {
    not_started:    "Not Started",
    pending:        "Not Started",
    in_progress:    "In Progress",
    work_submitted: "Awaiting Approval",
    submitted:      "Awaiting Approval",
    needs_revision: "Needs Revision",
    rejected:       "Rejected",
    approved:       "Approved",
    completed:      "Approved",
  };
  return map[ws] || String(ws).replace(/_/g, " ");
}

function statusColor(ws) {
  const map = {
    not_started:    colors.muted,
    pending:        colors.muted,
    in_progress:    colors.warning,
    work_submitted: colors.accent,
    submitted:      colors.accent,
    needs_revision: colors.danger,
    rejected:       colors.danger,
    approved:       colors.success,
    completed:      colors.success,
  };
  return map[ws] || colors.muted;
}

// Group stages by contract
function groupStagesByContract(stages) {
  const groups = {};
  stages.forEach((stage) => {
    const cid = stage?.contract?._id || stage?.contract?.id || stage?.contract || "unknown";
    if (!groups[cid]) {
      groups[cid] = {
        contractId: cid,
        contract: stage?.contract || {},
        stages: [],
      };
    }
    groups[cid].stages.push(stage);
  });
  return Object.values(groups);
}

// ─── Stage row (inside a contract group) ─────────────────────────────────────

function StageRow({ stage, onOpen }) {
  const ws    = getWorkStatus(stage);
  const color = statusColor(ws);

  return (
    <Pressable
      style={({ pressed }) => [s.stageRow, pressed && { opacity: 0.75 }]}
      onPress={() => onOpen(stage)}
    >
      <View style={s.stageRowLeft}>
        <View style={[s.stageStatusDot, { backgroundColor: color }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.stageTitle} numberOfLines={1}>{stage?.title || "Work Stage"}</Text>
          <View style={s.stageMetas}>
            {stage?.amount != null ? (
              <Text style={s.stageMeta}>{formatMoney(stage.amount, stage.contract?.currency || "KSH")}</Text>
            ) : null}
            {stage?.dueDate ? (
              <Text style={s.stageMeta}>· Due {formatDate(stage.dueDate)}</Text>
            ) : null}
          </View>
          {(ws === "needs_revision" || ws === "rejected") && stage?.rejectionReason ? (
            <Text style={s.stageRevision} numberOfLines={1}>⚠ {stage.rejectionReason}</Text>
          ) : null}
        </View>
      </View>
      <View style={[s.stagePill, { backgroundColor: color + "22" }]}>
        <Text style={[s.stagePillText, { color }]}>{statusLabel(ws)}</Text>
      </View>
    </Pressable>
  );
}

// ─── Contract group card ──────────────────────────────────────────────────────

function ContractGroup({ group, onOpenStage, filter }) {
  const { contract, stages } = group;
  const contractTitle = contract?.title || "Contract";
  const contractStatus = lower(contract?.status || "");

  // Apply filter to stages within this group
  const visibleStages = filterStages(stages, filter);
  if (visibleStages.length === 0) return null;

  const total     = stages.length;
  const approved  = stages.filter((m) => ["approved", "completed"].includes(getWorkStatus(m))).length;
  const progress  = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <View style={s.contractGroup}>
      {/* Contract header */}
      <View style={s.contractHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.contractTitle} numberOfLines={1}>{contractTitle}</Text>
          <Text style={s.contractSub}>
            {approved}/{total} stage{total !== 1 ? "s" : ""} approved
            {contractStatus ? ` · ${contractStatus.replace(/_/g, " ")}` : ""}
          </Text>
        </View>
        {/* Progress bar */}
        <View style={s.progressWrap}>
          <View style={[s.progressBar, { width: `${progress}%` }]} />
        </View>
        <Text style={s.progressText}>{progress}%</Text>
      </View>

      {/* Stages */}
      <View style={s.stagesList}>
        {visibleStages.map((stage, idx) => (
          <View key={stage._id || stage.id}>
            {idx > 0 ? <View style={s.stageDivider} /> : null}
            <StageRow stage={stage} onOpen={onOpenStage} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyState({ onRefresh }) {
  return (
    <View style={s.emptyCard}>
      <Ionicons name="layers-outline" size={36} color={colors.muted} style={{ marginBottom: 8 }} />
      <Text style={s.emptyTitle}>No work stages yet</Text>
      <Text style={s.emptyBody}>
        Work stages appear here when a manager assigns them to one of your contracts.
      </Text>
      <TouchableOpacity onPress={onRefresh} style={s.retryBtn}>
        <Text style={s.retryText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",      label: "All"       },
  { key: "active",   label: "Active"    },
  { key: "pending",  label: "Pending"   },
  { key: "done",     label: "Done"      },
];

function filterStages(stages, filter) {
  if (filter === "all") return stages;
  if (filter === "active")  return stages.filter((m) => ["in_progress"].includes(getWorkStatus(m)));
  if (filter === "pending") return stages.filter((m) => ["not_started", "pending", "needs_revision", "rejected"].includes(getWorkStatus(m)));
  if (filter === "done")    return stages.filter((m) => ["approved", "completed", "work_submitted", "submitted"].includes(getWorkStatus(m)));
  return stages;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MilestonesScreen({ navigation }) {
  const { accessToken, user } = useAuth();
  const userId = user?._id || user?.id;

  const [stages, setStages]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState("");
  const [filter, setFilter]       = useState("all");

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) return;
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const data = await apiRequest("/milestones", {
          token: accessToken,
          query: { sellerId: userId, limit: 50 },
        });

        const list =
          Array.isArray(data) ? data :
          Array.isArray(data?.milestones) ? data.milestones :
          [];

        setStages(list);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Failed to load work stages.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, userId]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Navigate to stage ───────────────────────────────────────────────────────

  const handleOpen = (stage) => {
    const sid = stage?._id || stage?.id;
    const cid = stage?.contract?._id || stage?.contract?.id || stage?.contract;
    navigation.navigate("StageDetails", { stageId: String(sid), contractId: cid ? String(cid) : undefined });
  };

  // ── Filtered + grouped ────────────────────────────────────────────────────

  const groups = groupStagesByContract(stages);
  // For "all stages" count after filter
  const anyVisible = groups.some((g) => filterStages(g.stages, filter).length > 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Work Stages"
      subtitle="Your assigned stages grouped by contract."
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
            colors={[colors.primary]}
          />
        ),
      }}
    >
      {/* Filter tabs */}
      <View style={s.tabs}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.tab, filter === f.key && s.tabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, filter === f.key && s.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={{ marginTop: 8 }}>
            <Text style={s.linkText}>Retry</Text>
          </Pressable>
        </View>
      ) : !anyVisible ? (
        <EmptyState onRefresh={() => load({ isRefresh: true })} />
      ) : (
        <View style={{ gap: 14 }}>
          {groups.map((group) => (
            <ContractGroup
              key={group.contractId}
              group={group}
              onOpenStage={handleOpen}
              filter={filter}
            />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  tabs: {
    flexDirection: "row", gap: 8, flexWrap: "wrap",
  },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: "700", color: colors.muted },
  tabTextActive: { color: "#fff" },

  center: { paddingVertical: 60, alignItems: "center" },

  // Contract group
  contractGroup: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, overflow: "hidden",
  },
  contractHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: spacing(1.75), backgroundColor: "#F8FAFC",
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  contractTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  contractSub:   { fontSize: 12, color: colors.muted },
  progressWrap:  { width: 50, height: 6, backgroundColor: "#E2E8F0", borderRadius: 3, overflow: "hidden", flexShrink: 0 },
  progressBar:   { height: "100%", backgroundColor: colors.success, borderRadius: 3 },
  progressText:  { fontSize: 12, fontWeight: "700", color: colors.muted, width: 32, textAlign: "right", flexShrink: 0 },

  // Stage list inside group
  stagesList: {},
  stageRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing(1.25), paddingHorizontal: spacing(1.75), gap: 10,
  },
  stageRowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  stageStatusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  stageTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  stageMetas: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  stageMeta: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  stageRevision: { fontSize: 11, color: colors.danger, fontWeight: "600", marginTop: 2 },
  stagePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  stagePillText: { fontSize: 10, fontWeight: "800" },
  stageDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing(1.75) + 8 + 10 },

  emptyCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2.5), alignItems: "center", gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptyBody:  { fontSize: 14, color: colors.muted, lineHeight: 21, textAlign: "center" },
  retryBtn:   { marginTop: 8 },
  retryText:  { color: colors.accent, fontWeight: "800", fontSize: 14 },

  errorCard: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 14, padding: 14, gap: 4,
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  linkText:  { color: colors.accent, fontWeight: "800", fontSize: 14 },
});
