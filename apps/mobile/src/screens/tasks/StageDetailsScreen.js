/**
 * StageDetailsScreen
 * Per-stage detail view for hustlers.
 * Actions: Start Work, Mark Complete (submit), Revise Work.
 * Parity with web StageDetailsPage + MilestoneDetailsPage.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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

function lower(v) { return String(v || "").trim().toLowerCase(); }

function getWorkStatus(stage) {
  return lower(stage?.workStatus || stage?.status || "not_started");
}

function escrowReady(contract) {
  const es = lower(contract?.escrowStatus || "");
  return ["funded", "in_progress", "awaiting_approval", "released"].includes(es);
}

function escrowLabel(contract) {
  const map = {
    waiting_for_funding: "Awaiting Manager Funding",
    funded:              "Payment Secured",
    in_progress:         "Payment Secured",
    awaiting_approval:   "Payment Secured",
    released:            "Payment Released",
  };
  return map[lower(contract?.escrowStatus || "")] || "Payment Pending";
}

function workStatusLabel(ws) {
  const map = {
    not_started:    "Not Started",
    in_progress:    "In Progress",
    work_submitted: "Awaiting Approval",
    submitted:      "Awaiting Approval",
    needs_revision: "Revision Requested",
    rejected:       "Rejected",
    approved:       "Approved",
    completed:      "Approved",
  };
  return map[ws] || "Pending";
}

function workStatusColor(ws) {
  const map = {
    not_started:    colors.muted,
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

function paymentLabel(stage) {
  const ps = lower(stage?.paymentStatus || "");
  if (ps === "released") return "Payment Released";
  if (ps === "refunded")  return "Refunded to Manager";
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StageDetailsScreen({ route, navigation }) {
  const { stageId, contractId } = route.params || {};
  const { accessToken, user } = useAuth();
  const userId = user?._id || user?.id;

  const [loading, setLoading]         = useState(false);
  const [stage, setStage]             = useState(null);
  const [contract, setContract]       = useState(null);
  const [error, setError]             = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Submission form (for Mark Complete)
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [notes, setNotes]             = useState("");
  const [proofLink, setProofLink]     = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setError("");
    try {
      const s = await apiRequest(`/milestones/${stageId}`, { token: accessToken });
      setStage(s?.milestone || s);

      const cid = contractId || s?.milestone?.contract?._id || s?.contract?._id || s?.milestone?.contract || s?.contract;
      if (cid) {
        const c = await apiRequest(`/contracts/${cid}`, { token: accessToken });
        setContract(c?.contract || c);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load stage.");
    } finally {
      setLoading(false);
    }
  }, [stageId, contractId, accessToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived state ──────────────────────────────────────────────────────────

  const ws = getWorkStatus(stage);
  const isAssigned = (() => {
    if (!contract || !userId) return false;
    const sid = contract.seller?._id || contract.seller?.id || contract.seller;
    return String(sid) === String(userId);
  })();

  const canStart    = isAssigned && (ws === "not_started" || ws === "pending");
  const canSubmit   = isAssigned && ws === "in_progress";
  const canRevise   = isAssigned && (ws === "needs_revision" || ws === "needs revision" || ws === "rejected");
  const isFinished  = ["approved", "completed"].includes(ws);
  const disputeId   = contract?.userDisputeId || contract?.metadata?.disputeId || contract?.disputeId;

  // ── Actions ─────────────────────────────────────────────────────────────────

  const doAction = async (workStatus, body = {}) => {
    setActionLoading(true);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await apiRequest(`/milestones/${stageId}/work-status`, {
        token: accessToken,
        method: "POST",
        body: { workStatus, ...body },
      });
      const updated = res?.milestone || res;
      setStage((prev) => ({ ...(prev || {}), ...updated }));
      return updated;
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || "Action failed.");
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    if (!escrowReady(contract)) {
      setActionError("Payment is not secured yet. Wait for the manager to fund escrow before starting.");
      return;
    }
    const res = await doAction("in_progress");
    if (res) setActionSuccess("Work started!");
  };

  const handleMarkComplete = async () => {
    if (!notes.trim()) {
      setActionError("Please add completion notes before submitting.");
      return;
    }
    const res = await doAction("work_submitted", {
      completionNotes: notes.trim(),
      proofFiles: proofLink.trim() ? [{ url: proofLink.trim(), name: "Proof link" }] : [],
    });
    if (res) {
      setActionSuccess("Work submitted for approval!");
      setShowSubmitForm(false);
      setNotes("");
      setProofLink("");
    }
  };

  const handleRevise = async () => {
    if (!escrowReady(contract)) {
      setActionError("Payment is not secured. Contact your manager.");
      return;
    }
    const res = await doAction("in_progress");
    if (res) setActionSuccess("Revision started — work is now in progress.");
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScreenShell
        title="Stage Details"
        showBack
        onBackPress={() => navigation.goBack()}
      >
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenShell>
    );
  }

  if (error && !stage) {
    return (
      <ScreenShell
        title="Stage Details"
        showBack
        onBackPress={() => navigation.goBack()}
      >
        <View style={s.card}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 8 }}>
            <Text style={s.linkText}>Retry</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  const stageTitle = stage?.title || "Work Stage";
  const contractTitle = contract?.title || stage?.contract?.title || "";

  return (
    <ScreenShell
      title={stageTitle}
      subtitle={contractTitle}
      showBack
      onBackPress={() => navigation.goBack()}
    >
      {/* ── Escrow status pill ── */}
      {contract && (
        <View style={[s.escrowPill, escrowReady(contract) ? s.escrowReady : s.escrowWaiting]}>
          <Ionicons
            name={escrowReady(contract) ? "shield-checkmark-outline" : "time-outline"}
            size={13}
            color={escrowReady(contract) ? colors.success : colors.warning}
          />
          <Text style={[s.escrowPillText, { color: escrowReady(contract) ? colors.success : colors.warning }]}>
            {escrowLabel(contract)}
          </Text>
        </View>
      )}

      {/* ── Stage info card ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>{stageTitle}</Text>
          <View style={[s.statusPill, { backgroundColor: workStatusColor(ws) + "22" }]}>
            <Text style={[s.statusText, { color: workStatusColor(ws) }]}>
              {workStatusLabel(ws)}
            </Text>
          </View>
        </View>

        {stage?.description ? (
          <Text style={s.description}>{stage.description}</Text>
        ) : null}

        <View style={s.divider} />

        <View style={s.metaGrid}>
          <MetaItem label="Payment" value={formatMoney(stage?.amount, contract?.currency || "KSH")} />
          <MetaItem label="Due" value={stage?.dueDate ? formatDate(stage.dueDate) : "Not set"} />
          {contract?.title ? <MetaItem label="Contract" value={contract.title} /> : null}
          {stage?.submittedAt ? <MetaItem label="Submitted" value={formatDate(stage.submittedAt)} /> : null}
          {paymentLabel(stage) ? (
            <MetaItem
              label="Payment status"
              value={paymentLabel(stage)}
              valueColor={lower(stage?.paymentStatus) === "released" ? colors.success : colors.danger}
            />
          ) : null}
        </View>
      </View>

      {/* ── Revision / rejection notice ── */}
      {(ws === "needs_revision" || ws === "needs revision" || ws === "rejected") && (
        <View style={s.alertCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.alertTitle}>
              {ws === "rejected" ? "Work Rejected" : "Revision Requested"}
            </Text>
            {stage?.rejectionReason ? (
              <Text style={s.alertBody}>{stage.rejectionReason}</Text>
            ) : null}
            {stage?.rejectionComments ? (
              <Text style={s.alertBody}>{stage.rejectionComments}</Text>
            ) : (
              <Text style={s.alertBody}>The manager requested changes. Review the feedback and re-submit.</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Submission data (if submitted/approved) ── */}
      {stage?.submissionData && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Your Submission</Text>
          <View style={s.divider} />
          {stage.submissionData.notes ? (
            <Text style={s.submissionNote}>{stage.submissionData.notes}</Text>
          ) : null}
          {stage.submissionData.proofLink ? (
            <View style={s.proofRow}>
              <Ionicons name="link-outline" size={14} color={colors.accent} />
              <Text style={s.proofLinkText} numberOfLines={1}>{stage.submissionData.proofLink}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Action banners ── */}
      {actionError ? (
        <View style={s.bannerError}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <Text style={s.bannerErrorText}>{actionError}</Text>
        </View>
      ) : null}
      {actionSuccess ? (
        <View style={s.bannerSuccess}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
          <Text style={s.bannerSuccessText}>{actionSuccess}</Text>
        </View>
      ) : null}

      {/* ── Submit completion form ── */}
      {showSubmitForm && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Mark Work Complete</Text>
          <View style={s.divider} />

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Completion notes <Text style={{ color: colors.danger }}>*</Text></Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={notes}
              onChangeText={(v) => { setNotes(v); setActionError(""); }}
              placeholder="Describe what you completed for this stage…"
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Work sample / proof link (optional)</Text>
            <TextInput
              style={s.input}
              value={proofLink}
              onChangeText={setProofLink}
              placeholder="https://…"
              placeholderTextColor="#94A3B8"
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          <View style={s.rowGap}>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, actionLoading && s.btnDisabled, { flex: 1 }]}
              onPress={handleMarkComplete}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnPrimaryText}>Submit Work</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnSecondary]}
              onPress={() => { setShowSubmitForm(false); setActionError(""); }}
              disabled={actionLoading}
            >
              <Text style={s.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Primary actions ── */}
      {isAssigned && !showSubmitForm && (
        <View style={{ gap: 10 }}>
          {canStart && (
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, actionLoading && s.btnDisabled]}
              onPress={handleStart}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="play-circle-outline" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>Start Work</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          {canSubmit && (
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, actionLoading && s.btnDisabled]}
              onPress={() => setShowSubmitForm(true)}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
              <Text style={s.btnPrimaryText}>Mark Complete</Text>
            </TouchableOpacity>
          )}

          {canRevise && (
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, actionLoading && s.btnDisabled]}
              onPress={handleRevise}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="refresh-outline" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>Revise Work</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          {isFinished && (
            <View style={s.completedBanner}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={s.completedText}>
                {lower(stage?.paymentStatus) === "released"
                  ? "Work approved and payment released!"
                  : "Work approved — awaiting final contract payment release."}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Dispute link ── */}
      {(ws === "rejected" || disputeId) && (contractId || stage?.contract?._id || stage?.contract) && (
        <TouchableOpacity
          style={[s.btn, s.btnSecondary]}
          onPress={() => {
            const cid = contractId || stage?.contract?._id || stage?.contract;
            if (disputeId) {
              navigation.navigate("Dispute", { disputeId: String(disputeId) });
            } else {
              navigation.navigate("RaiseDispute", { contractId: String(cid) });
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="flag-outline" size={16} color={colors.danger} />
          <Text style={[s.btnSecondaryText, { color: colors.danger }]}>
            {disputeId ? "View Dispute" : "Open Dispute"}
          </Text>
        </TouchableOpacity>
      )}
    </ScreenShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaItem({ label, value, valueColor }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={[s.metaValue, valueColor && { color: valueColor }]}>{value || "—"}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 12,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardTitle:  { fontSize: 17, fontWeight: "800", color: colors.text, flex: 1 },

  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  statusText: { fontSize: 11, fontWeight: "800" },

  escrowPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1,
  },
  escrowReady:   { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  escrowWaiting: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  escrowPillText: { fontSize: 12, fontWeight: "700" },

  description: { color: colors.muted, lineHeight: 22, fontSize: 14 },
  divider:     { height: 1, backgroundColor: colors.border },

  metaGrid: { gap: 10 },
  metaItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaLabel: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  metaValue: { fontSize: 13, color: colors.text, fontWeight: "700", maxWidth: "60%", textAlign: "right" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  fieldLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },

  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15,
  },
  inputMulti: { minHeight: 100 },

  alertCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 14, padding: spacing(1.5),
  },
  alertTitle: { fontSize: 14, fontWeight: "800", color: colors.danger },
  alertBody:  { fontSize: 13, color: "#991B1B", lineHeight: 20 },

  submissionNote: { fontSize: 14, color: colors.text, lineHeight: 21 },
  proofRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  proofLinkText: { fontSize: 13, color: colors.accent, flex: 1 },

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

  completedBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0",
    borderRadius: 14, padding: 14,
  },
  completedText: { flex: 1, color: "#166534", fontWeight: "700", fontSize: 14, lineHeight: 20 },

  rowGap: { flexDirection: "row", gap: 10, alignItems: "center" },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  linkText:  { color: colors.accent, fontWeight: "800", fontSize: 14 },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 16, paddingVertical: 15,
  },
  btnPrimary:      { backgroundColor: colors.primary },
  btnDisabled:     { opacity: 0.65 },
  btnPrimaryText:  { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnSecondary:    { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  btnSecondaryText:{ color: colors.text, fontWeight: "700", fontSize: 15 },
});
