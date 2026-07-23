/**
 * TaskApprovalsScreen
 * Manager approval queue — approve, request revision, or reject submitted work.
 * Parity with web TaskApprovalsPage + ManagerMilestonesPage.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const REJECTION_REASONS = [
  { value: "poor_quality",     label: "Poor quality"      },
  { value: "incomplete_work",  label: "Incomplete work"   },
  { value: "missed_deadline",  label: "Missed deadline"   },
  { value: "policy_violation", label: "Policy violation"  },
  { value: "other",            label: "Other"             },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function isSubmitted(m) {
  const ws = lower(m?.workStatus || m?.status || "");
  return ["submitted", "work_submitted"].includes(ws);
}

function statusColor(ws) {
  if (["approved", "completed"].includes(ws)) return colors.success;
  if (["rejected", "needs_revision"].includes(ws)) return colors.danger;
  if (["submitted", "work_submitted"].includes(ws)) return colors.accent;
  return colors.muted;
}

function statusLabel(ws) {
  const map = {
    submitted:      "Submitted",
    work_submitted: "Submitted",
    approved:       "Approved",
    completed:      "Approved",
    rejected:       "Rejected",
    needs_revision: "Needs Revision",
    not_started:    "Not Started",
    in_progress:    "In Progress",
  };
  return map[ws] || String(ws).replace(/_/g, " ");
}

function paymentStatusLabel(m) {
  const ps = lower(m?.paymentStatus || "");
  if (ps === "released") return "Payment Released";
  if (ps === "refunded") return "Refunded";
  const cs = lower(m?.contract?.status || "");
  if (ps === "pending" && cs === "disputed") return "On Hold";
  return "Secured";
}

// Group milestones by contract
function groupByContract(milestones) {
  const groups = {};
  milestones.forEach((m) => {
    const cid = m?.contract?._id || m?.contract?.id || m?.contract || "unknown";
    if (!groups[cid]) {
      groups[cid] = {
        contractId: cid,
        contract: typeof m?.contract === "object" ? m.contract : {},
        milestones: [],
      };
    }
    groups[cid].milestones.push(m);
  });
  return Object.values(groups);
}

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({ milestone, onApprove, onRevision, onReject, actionLoading }) {
  const ws    = lower(milestone?.workStatus || milestone?.status || "submitted");
  const color = statusColor(ws);
  const hustler = milestone?.submittedBy || milestone?.assignedTo || milestone?.contract?.seller;
  const hustlerName = getDisplayName(hustler);
  const contractTitle = milestone?.contract?.title || "";
  const submissionData = milestone?.submissionData || {};

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.cardTitle} numberOfLines={2}>{milestone?.title || "Work Stage"}</Text>
          {contractTitle ? <Text style={s.cardMeta} numberOfLines={1}>{contractTitle}</Text> : null}
          {hustlerName ? (
            <View style={s.metaRow}>
              <Ionicons name="person-outline" size={12} color={colors.muted} />
              <Text style={s.cardMeta}>{hustlerName}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.pill, { backgroundColor: color + "22" }]}>
          <Text style={[s.pillText, { color }]}>{statusLabel(ws)}</Text>
        </View>
      </View>

      {/* Payment + amount */}
      <View style={s.metaRow}>
        <Ionicons name="cash-outline" size={13} color={colors.muted} />
        <Text style={s.metaText}>{formatMoney(milestone?.amount, milestone?.contract?.currency || "KSH")}</Text>
        <Text style={[s.metaBadge, { color: colors.muted }]}>{paymentStatusLabel(milestone)}</Text>
      </View>

      {milestone?.submittedAt ? (
        <View style={s.metaRow}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={s.metaText}>Submitted {formatDate(milestone.submittedAt)}</Text>
        </View>
      ) : null}

      {/* Submission notes */}
      {submissionData.notes ? (
        <View style={s.submissionBox}>
          <Text style={s.submissionLabel}>Completion notes</Text>
          <Text style={s.submissionText}>{submissionData.notes}</Text>
        </View>
      ) : null}

      {submissionData.proofLink ? (
        <View style={s.metaRow}>
          <Ionicons name="link-outline" size={13} color={colors.accent} />
          <Text style={s.proofLink} numberOfLines={1}>{submissionData.proofLink}</Text>
        </View>
      ) : null}

      {/* Actions — only for submitted work */}
      {isSubmitted(milestone) ? (
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, s.approveBtn, actionLoading && s.btnDisabled]}
            onPress={() => onApprove(milestone)}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
            <Text style={s.approveBtnText}>Approve</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.revisionBtn, actionLoading && s.btnDisabled]}
            onPress={() => onRevision(milestone)}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.warning} />
            <Text style={s.revisionBtnText}>Revision</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.rejectBtn, actionLoading && s.btnDisabled]}
            onPress={() => onReject(milestone)}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
            <Text style={s.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ─── Contract approval group ──────────────────────────────────────────────────

function ContractApprovalGroup({ group, onApprove, onRevision, onReject, actionLoading }) {
  const { contract, milestones } = group;
  const contractTitle = contract?.title || "Contract";
  const total     = milestones.length;
  const approved  = milestones.filter((m) => ["approved", "completed"].includes(lower(m?.workStatus || m?.status || ""))).length;
  const submitted = milestones.filter((m) => isSubmitted(m)).length;

  return (
    <View style={s.contractGroup}>
      {/* Contract header */}
      <View style={s.contractHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.contractTitle} numberOfLines={1}>{contractTitle}</Text>
          <Text style={s.contractSub}>
            {submitted > 0 ? `${submitted} awaiting review · ` : ""}
            {approved}/{total} approved
          </Text>
        </View>
        <View style={s.progressWrap}>
          <View style={[s.progressBar, { width: total > 0 ? `${Math.round((approved / total) * 100)}%` : "0%" }]} />
        </View>
      </View>

      {/* Milestone rows */}
      {milestones.map((m, idx) => (
        <View key={m._id || m.id}>
          {idx > 0 ? <View style={s.stageDivider} /> : null}
          <SubmissionCard
            milestone={m}
            onApprove={onApprove}
            onRevision={onRevision}
            onReject={onReject}
            actionLoading={actionLoading}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Revision modal ───────────────────────────────────────────────────────────

function RevisionModal({ visible, onClose, onSubmit, loading }) {
  const [reason, setReason] = useState("");
  const handleSubmit = () => {
    if (!reason.trim()) return;
    onSubmit(reason.trim());
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Request Revision</Text>
        <Text style={s.sheetSub}>Tell the hustler what needs to be changed.</Text>
        <TextInput
          style={[s.input, s.inputMulti]}
          value={reason}
          onChangeText={setReason}
          placeholder="Describe the changes needed…"
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
          maxLength={500}
        />
        <View style={s.sheetActions}>
          <TouchableOpacity
            style={[s.sheetBtn, s.sheetBtnPrimary, (!reason.trim() || loading) && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={!reason.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sheetBtnPrimaryText}>Send Request</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={[s.sheetBtn, s.sheetBtnSecondary]} onPress={onClose} disabled={loading}>
            <Text style={s.sheetBtnSecondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({ visible, onClose, onSubmit, loading }) {
  const [reasonType, setReasonType] = useState("poor_quality");
  const [comments, setComments]     = useState("");
  const handleSubmit = () => onSubmit(reasonType, comments.trim());
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Reject Work</Text>
        <Text style={s.sheetSub}>Select a rejection reason.</Text>

        <View style={s.reasonList}>
          {REJECTION_REASONS.map((r) => (
            <Pressable
              key={r.value}
              style={[s.reasonRow, reasonType === r.value && s.reasonRowSelected]}
              onPress={() => setReasonType(r.value)}
            >
              <View style={[s.radio, reasonType === r.value && s.radioSelected]}>
                {reasonType === r.value ? <View style={s.radioDot} /> : null}
              </View>
              <Text style={[s.reasonLabel, reasonType === r.value && s.reasonLabelSelected]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={[s.input, s.inputMulti]}
          value={comments}
          onChangeText={setComments}
          placeholder="Additional comments (optional)…"
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
          maxLength={500}
        />

        <View style={s.sheetActions}>
          <TouchableOpacity
            style={[s.sheetBtn, s.rejectSheetBtn, loading && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sheetBtnPrimaryText}>Confirm Rejection</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={[s.sheetBtn, s.sheetBtnSecondary]} onPress={onClose} disabled={loading}>
            <Text style={s.sheetBtnSecondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TaskApprovalsScreen({ navigation }) {
  const { accessToken } = useAuth();

  const [milestones, setMilestones]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg]   = useState("");
  const [errorMsg, setErrorMsg]       = useState("");

  // Modal state
  const [revisionTarget, setRevisionTarget] = useState(null);
  const [rejectTarget, setRejectTarget]     = useState(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) return;
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const data = await apiRequest("/milestones", {
          token: accessToken,
          query: { status: "submitted", limit: 50 },
        });
        const list =
          Array.isArray(data) ? data :
          Array.isArray(data?.milestones) ? data.milestones :
          [];
        setMilestones(list);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Failed to load submissions.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Actions ──────────────────────────────────────────────────────────────────

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleApprove = async (milestone) => {
    setActionLoading(true);
    setErrorMsg("");
    try {
      const id = milestone?._id || milestone?.id;
      await apiRequest(`/milestones/${id}/approve`, {
        token: accessToken,
        method: "POST",
      });
      showSuccess("Work approved. Payment releases automatically when all stages are approved.");
      load({ isRefresh: true });
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Failed to approve work.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevision = async (reason) => {
    if (!revisionTarget) return;
    setActionLoading(true);
    setErrorMsg("");
    try {
      const id = revisionTarget?._id || revisionTarget?.id;
      await apiRequest(`/milestones/${id}/request-revision`, {
        token: accessToken,
        method: "POST",
        body: { reason },
      });
      setRevisionTarget(null);
      showSuccess("Revision requested.");
      load({ isRefresh: true });
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Failed to request revision.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reasonType, comments) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    setErrorMsg("");
    try {
      const id = rejectTarget?._id || rejectTarget?.id;
      await apiRequest(`/milestones/${id}/reject-work`, {
        token: accessToken,
        method: "POST",
        body: { reasonType, comments },
      });
      setRejectTarget(null);
      showSuccess("Work rejected.");
      load({ isRefresh: true });
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Failed to reject work.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const pending  = milestones.filter((m) => isSubmitted(m));
  const resolved = milestones.filter((m) => !isSubmitted(m));

  const pendingGroups  = groupByContract(pending);
  const resolvedGroups = groupByContract(resolved);

  return (
    <ScreenShell
      title="Task Approvals"
      subtitle="Review and approve submitted work from your team."
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
      <RevisionModal
        visible={!!revisionTarget}
        onClose={() => setRevisionTarget(null)}
        onSubmit={handleRevision}
        loading={actionLoading}
      />
      <RejectModal
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={handleReject}
        loading={actionLoading}
      />

      {/* Banners */}
      {errorMsg ? (
        <View style={s.bannerError}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <Text style={s.bannerErrorText}>{errorMsg}</Text>
        </View>
      ) : null}
      {successMsg ? (
        <View style={s.bannerSuccess}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
          <Text style={s.bannerSuccessText}>{successMsg}</Text>
        </View>
      ) : null}

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
      ) : milestones.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="checkmark-done-circle-outline" size={36} color={colors.muted} style={{ marginBottom: 8 }} />
          <Text style={s.emptyTitle}>No pending approvals</Text>
          <Text style={s.emptyBody}>
            Work stages submitted by your team will appear here for review.
          </Text>
        </View>
      ) : (
        <>
          {/* Pending review section */}
          {pendingGroups.length > 0 && (
            <View style={{ gap: 12 }}>
              <View style={s.sectionHeader}>
                <Ionicons name="hourglass-outline" size={15} color={colors.warning} />
                <Text style={[s.sectionTitle, { color: colors.warning }]}>
                  Pending Review ({pending.length})
                </Text>
              </View>
              {pendingGroups.map((group) => (
                <ContractApprovalGroup
                  key={group.contractId}
                  group={group}
                  onApprove={handleApprove}
                  onRevision={setRevisionTarget}
                  onReject={setRejectTarget}
                  actionLoading={actionLoading}
                />
              ))}
            </View>
          )}

          {/* Resolved section */}
          {resolvedGroups.length > 0 && (
            <View style={{ gap: 12, marginTop: pendingGroups.length > 0 ? 8 : 0 }}>
              <View style={s.sectionHeader}>
                <Ionicons name="checkmark-circle-outline" size={15} color={colors.muted} />
                <Text style={s.sectionTitle}>Previously Reviewed ({resolved.length})</Text>
              </View>
              {resolvedGroups.map((group) => (
                <ContractApprovalGroup
                  key={group.contractId}
                  group={group}
                  onApprove={handleApprove}
                  onRevision={setRevisionTarget}
                  onReject={setRejectTarget}
                  actionLoading={actionLoading}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle:  { fontSize: 14, fontWeight: "800", color: colors.muted },

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
  stageDivider:  { height: 1, backgroundColor: colors.border, marginLeft: spacing(1.75) },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 10,
  },
  cardHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  cardTitle:  { fontSize: 15, fontWeight: "800", color: colors.text, lineHeight: 21 },
  cardMeta:   { fontSize: 12, color: colors.muted },

  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  pillText: { fontSize: 11, fontWeight: "800" },

  metaRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText:  { fontSize: 12, color: colors.muted, fontWeight: "600" },
  metaBadge: { fontSize: 11, fontWeight: "700" },

  submissionBox: {
    backgroundColor: "#F8FAFC", borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, padding: 10, gap: 4,
  },
  submissionLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  submissionText:  { fontSize: 13, color: colors.text, lineHeight: 20 },

  proofLink: { fontSize: 12, color: colors.accent, flex: 1 },

  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, borderRadius: 12, paddingVertical: 10,
  },
  btnDisabled: { opacity: 0.6 },

  approveBtn:      { backgroundColor: colors.success },
  approveBtnText:  { color: "#fff", fontWeight: "800", fontSize: 13 },
  revisionBtn:     { borderWidth: 1.5, borderColor: colors.warning, backgroundColor: "#FFFBEB" },
  revisionBtnText: { color: colors.warning, fontWeight: "800", fontSize: 13 },
  rejectBtn:       { borderWidth: 1.5, borderColor: colors.danger, backgroundColor: "#FEF2F2" },
  rejectBtnText:   { color: colors.danger, fontWeight: "800", fontSize: 13 },

  bannerError: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 14, padding: 12,
  },
  bannerErrorText: { flex: 1, color: "#991B1B", fontWeight: "700", lineHeight: 20, fontSize: 13 },
  bannerSuccess: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0",
    borderRadius: 14, padding: 12,
  },
  bannerSuccessText: { flex: 1, color: "#166534", fontWeight: "700", lineHeight: 20, fontSize: 13 },

  emptyCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2.5), alignItems: "center", gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptyBody:  { fontSize: 14, color: colors.muted, lineHeight: 21, textAlign: "center" },

  errorCard: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 14, padding: 14, gap: 4,
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  linkText:  { color: colors.accent, fontWeight: "800", fontSize: 14 },

  // Modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing(2), paddingTop: spacing(1), paddingBottom: spacing(3), gap: 14,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 4,
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  sheetSub:   { fontSize: 13, color: colors.muted, marginTop: -8 },

  reasonList: { gap: 4 },
  reasonRow:  {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
  },
  reasonRowSelected: { backgroundColor: "#EFF6FF" },
  radio:         { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.accent },
  radioDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  reasonLabel:         { fontSize: 14, color: colors.text, fontWeight: "600" },
  reasonLabelSelected: { color: colors.accent, fontWeight: "800" },

  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15,
  },
  inputMulti: { minHeight: 90 },

  sheetActions: { flexDirection: "column", gap: 10 },
  sheetBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
  },
  sheetBtnPrimary:      { backgroundColor: colors.primary },
  sheetBtnPrimaryText:  { color: "#fff", fontWeight: "800", fontSize: 15 },
  sheetBtnSecondary:    { borderWidth: 1.5, borderColor: colors.border },
  sheetBtnSecondaryText:{ color: colors.text, fontWeight: "700", fontSize: 15 },
  rejectSheetBtn:       { backgroundColor: colors.danger },
});
