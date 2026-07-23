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
import { matchesId } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function getWorkStatus(ms) {
  return lower(ms?.workStatus || ms?.status || "not_started");
}

/** Is escrow funded enough for the hustler to start / submit work? */
function escrowReady(ms) {
  const es = lower(ms?.contract?.escrowStatus || "");
  return ["funded", "in_progress", "awaiting_approval", "released"].includes(es);
}

function escrowLabel(ms) {
  const map = {
    waiting_for_funding: "Awaiting Manager Funding",
    funded:              "Payment Secured",
    in_progress:         "Payment Secured",
    awaiting_approval:   "Payment Secured",
    released:            "Payment Released",
  };
  const es = lower(ms?.contract?.escrowStatus || "");
  return map[es] || "Payment Pending";
}

function paymentLabel(ms) {
  const ps = lower(ms?.paymentStatus || "");
  if (ps === "released") return "Payment Released";
  if (ps === "refunded") return "Refunded to Manager";
  return escrowLabel(ms);
}

function workStatusLabel(ws) {
  const map = {
    not_started:    "Not Started",
    in_progress:    "In Progress",
    work_submitted: "Awaiting Approval",
    submitted:      "Awaiting Approval",
    needs_revision:    "Revision Requested",
    "needs revision":  "Revision Requested",
    rejected:       "Rejected",
    approved:       "Approved",
    completed:      "Approved",
  };
  return map[ws] || "Pending";
}

function workStatusColor(ws) {
  const map = {
    not_started:    "#94A3B8",
    in_progress:    "#D97706",
    work_submitted: "#2563EB",
    submitted:      "#2563EB",
    needs_revision: "#DC2626",
    rejected:       "#DC2626",
    approved:       "#059669",
    completed:      "#059669",
  };
  return map[ws] || "#94A3B8";
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TaskDetailsScreen({ route, navigation }) {
  const { milestoneId } = route?.params || {};
  const { user, role, accessToken } = useAuth();
  const isManager = lower(role) === "manager";
  const userId = user?._id || user?.id;

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState("");
  const [milestone, setMilestone] = useState(null);

  // Hustler submit fields
  const [completionNotes, setCompletionNotes] = useState("");

  // Manager review fields
  const [revisionReason, setRevisionReason] = useState("");
  const [rejectReason, setRejectReason]     = useState("");
  const [reviewComments, setReviewComments] = useState("");

  // Per-action loading key: "start" | "submit" | "approve" | "revision" | "reject" | ""
  const [actionLoading, setActionLoading] = useState("");
  const [actionError, setActionError]     = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken || !milestoneId) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest(`/milestones/${milestoneId}`, {
          token: accessToken,
        });
        const ms = payload?.milestone || payload?.data?.milestone || payload || null;
        setMilestone(ms);
      } catch (err) {
        setError(
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load task details."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, milestoneId]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived state ─────────────────────────────────────────────────────────

  const ws        = getWorkStatus(milestone);
  const contract  = milestone?.contract || {};
  const isOwner   = matchesId(milestone?.assignedTo, userId) || matchesId(milestone?.submittedBy, userId);
  const ready     = escrowReady(milestone);

  // Hustler action gates
  const canStart  = !isManager && isOwner && ws === "not_started" && ready;
  const canResume = !isManager && isOwner && (ws === "needs_revision" || ws === "needs revision") && ready;
  const canSubmit = !isManager && isOwner && ws === "in_progress";
  const canReview = isManager && (ws === "work_submitted" || ws === "submitted");
  const isDone    = ws === "approved" || ws === "completed" ||
                    lower(milestone?.paymentStatus || "") === "released";

  // ── Action handlers ───────────────────────────────────────────────────────

  const act = async (key, fn) => {
    if (actionLoading) return;
    setActionLoading(key);
    setActionError("");
    setActionSuccess("");
    try {
      await fn();
      await load({ isRefresh: true });
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
        err?.message ||
        "Action failed. Please try again."
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleStart = () =>
    act("start", () =>
      apiRequest(`/milestones/${milestoneId}/work-status`, {
        token: accessToken,
        method: "POST",
        body: { workStatus: "in_progress" },
      })
    );

  const handleSubmit = () => {
    if (!completionNotes.trim()) {
      setActionError("Please add completion notes before submitting.");
      return;
    }
    act("submit", () =>
      apiRequest(`/milestones/${milestoneId}/work-status`, {
        token: accessToken,
        method: "POST",
        body: {
          workStatus: "work_submitted",
          completionNotes: completionNotes.trim(),
        },
      })
    ).then(() => setCompletionNotes(""));
  };

  const handleApprove = () =>
    act("approve", () =>
      apiRequest(`/milestones/${milestoneId}/approve`, {
        token: accessToken,
        method: "POST",
      })
    );

  const handleRequestRevision = () => {
    if (!revisionReason.trim()) {
      setActionError("Please enter a revision reason.");
      return;
    }
    act("revision", () =>
      apiRequest(`/milestones/${milestoneId}/request-revision`, {
        token: accessToken,
        method: "POST",
        body: { reason: revisionReason.trim() },
      })
    ).then(() => setRevisionReason(""));
  };

  const handleRejectWork = () => {
    if (!rejectReason.trim()) {
      setActionError("Please enter a rejection reason.");
      return;
    }
    act("reject", () =>
      apiRequest(`/milestones/${milestoneId}/reject-work`, {
        token: accessToken,
        method: "POST",
        body: {
          reasonType: rejectReason.trim(),
          comments: reviewComments.trim() || undefined,
        },
      })
    ).then(() => { setRejectReason(""); setReviewComments(""); });
  };


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title={milestone?.title || "Task Details"}
      subtitle={contract?.title || "Review status, submit work, and track payment."}
      showBack
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />
        ),
      }}
    >
      {loading ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.stateTitle}>Loading task…</Text>
        </Card>
      ) : error && !milestone ? (
        <Card>
          <Text style={s.stateTitle}>Could not load task</Text>
          <Text style={s.stateText}>{error}</Text>
          <Btn title="Try again" onPress={() => load()} />
        </Card>
      ) : !milestone ? (
        <Card>
          <Text style={s.stateTitle}>Task not found</Text>
          <Text style={s.stateText}>This milestone may have been removed.</Text>
        </Card>
      ) : (
        <>
          {/* ── Status hero ── */}
          <View style={s.hero}>
            <View style={s.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroLabel}>Work status</Text>
                <Text style={[s.heroStatus, { color: workStatusColor(ws) }]}>
                  {workStatusLabel(ws)}
                </Text>
              </View>
              <View style={[s.payBadge, {
                backgroundColor:
                  lower(milestone.paymentStatus) === "released" ? "#ECFDF5" : "#EFF6FF",
              }]}>
                <Ionicons
                  name={lower(milestone.paymentStatus) === "released" ? "checkmark-circle" : "shield-checkmark"}
                  size={13}
                  color={lower(milestone.paymentStatus) === "released" ? colors.success : colors.accent}
                />
                <Text style={[s.payBadgeText, {
                  color: lower(milestone.paymentStatus) === "released" ? colors.success : colors.accent,
                }]}>
                  {paymentLabel(milestone)}
                </Text>
              </View>
            </View>

            {/* Escrow not ready warning for hustler */}
            {!isManager && !ready && !isDone ? (
              <View style={s.escrowWarn}>
                <Ionicons name="warning-outline" size={14} color={colors.warning} />
                <Text style={s.escrowWarnText}>
                  Manager has not funded escrow yet. You cannot start work until payment is secured.
                </Text>
              </View>
            ) : null}

            {/* Rejection reason */}
            {milestone.rejectionReason && (ws === "needs_revision" || ws === "rejected") ? (
              <View style={s.rejectionBox}>
                <Text style={s.rejectionLabel}>
                  {ws === "rejected" ? "Rejection reason" : "Revision requested"}
                </Text>
                <Text style={s.rejectionText}>{milestone.rejectionReason}</Text>
                {milestone.rejectionComments ? (
                  <Text style={s.rejectionComments}>{milestone.rejectionComments}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* ── Task details ── */}
          <InfoCard title="Task Details">
            <Row label="Title"       value={milestone.title} />
            <Row label="Description" value={milestone.description || "—"} />
            <Row label="Amount"      value={formatMoney(milestone.amount, contract.currency || "KSH")} />
            <Row label="Due date"    value={formatDate(milestone.dueDate)} />
            {!isManager
              ? <Row label="Assigned to" value={getDisplayName(milestone.assignedTo)} />
              : null}
          </InfoCard>

          {/* ── Contract summary ── */}
          <InfoCard title="Contract">
            <Row label="Title"         value={contract.title || "—"} />
            <Row label="Escrow status" value={escrowLabel(milestone)} />
            <Row label="Payment type"  value={contract.paymentType || contract.contractType || "—"} />
            {contract._id || contract.id ? (
              <Btn
                secondary
                title="Open Contract"
                onPress={() => {
                  const parent = navigation.getParent?.();
                  (parent ?? navigation).navigate("ContractDetails", {
                    contractId: contract._id || contract.id,
                  });
                }}
              />
            ) : null}
          </InfoCard>

          {/* ── Submission details (if submitted / approved) ── */}
          {milestone.submittedAt || milestone.completionNotes ? (
            <InfoCard title="Submission">
              {milestone.submittedAt
                ? <Row label="Submitted" value={formatDate(milestone.submittedAt)} />
                : null}
              {milestone.completionNotes
                ? <Row label="Completion notes" value={milestone.completionNotes} />
                : null}
              {milestone.approvedAt
                ? <Row label="Approved" value={formatDate(milestone.approvedAt)} />
                : null}
            </InfoCard>
          ) : null}

          {/* ── Hustler: Start Work ── */}
          {canStart ? (
            <InfoCard title="Start Work">
              <Text style={s.hintText}>
                Payment is secured. Tap below to mark this task as in progress and begin work.
              </Text>
              <Btn
                title={actionLoading === "start" ? "Starting…" : "Start Work"}
                onPress={handleStart}
                disabled={Boolean(actionLoading)}
              />
            </InfoCard>
          ) : null}

          {/* ── Hustler: Resume after revision ── */}
          {canResume ? (
            <InfoCard title="Revision Requested">
              <Text style={s.hintText}>
                The manager has requested changes. Review the feedback above, then resume work.
              </Text>
              <Btn
                title={actionLoading === "start" ? "Resuming…" : "Resume Work"}
                onPress={handleStart}
                disabled={Boolean(actionLoading)}
              />
            </InfoCard>
          ) : null}

          {/* ── Hustler: Submit Work ── */}
          {canSubmit ? (
            <InfoCard title="Submit Work">
              <Text style={s.hintText}>
                Describe what you completed. The manager will review and approve your submission.
              </Text>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Completion notes *</Text>
                <TextInput
                  style={s.textArea}
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  placeholder="Summarise the work you completed…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  textAlignVertical="top"
                />
              </View>
              <Btn
                title={actionLoading === "submit" ? "Submitting…" : "Submit Work"}
                onPress={handleSubmit}
                disabled={Boolean(actionLoading)}
              />
            </InfoCard>
          ) : null}

          {/* ── Manager: Review actions ── */}
          {canReview ? (
            <InfoCard title="Review Submission">
              <Text style={s.hintText}>
                The hustler has submitted their work. Approve it to release payment, or request changes.
              </Text>

              {/* Approve */}
              <Btn
                title={actionLoading === "approve" ? "Approving…" : "Approve & Release Payment"}
                onPress={handleApprove}
                disabled={Boolean(actionLoading)}
              />

              {/* Request revision */}
              <View style={s.reviewBlock}>
                <Text style={s.reviewBlockTitle}>Request Revision</Text>
                <TextInput
                  style={s.input}
                  value={revisionReason}
                  onChangeText={setRevisionReason}
                  placeholder="Describe what needs to be changed…"
                  placeholderTextColor="#94A3B8"
                />
                <Btn
                  secondary
                  title={actionLoading === "revision" ? "Sending…" : "Request Revision"}
                  onPress={handleRequestRevision}
                  disabled={Boolean(actionLoading)}
                />
              </View>

              {/* Reject work */}
              <View style={[s.reviewBlock, s.reviewBlockDanger]}>
                <Text style={[s.reviewBlockTitle, { color: colors.danger }]}>Reject Work</Text>
                <TextInput
                  style={s.input}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Reason for rejection…"
                  placeholderTextColor="#94A3B8"
                />
                <TextInput
                  style={[s.input, s.textArea]}
                  value={reviewComments}
                  onChangeText={setReviewComments}
                  placeholder="Additional comments (optional)…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  textAlignVertical="top"
                />
                <Btn
                  danger
                  title={actionLoading === "reject" ? "Rejecting…" : "Reject Work"}
                  onPress={handleRejectWork}
                  disabled={Boolean(actionLoading)}
                />
              </View>
            </InfoCard>
          ) : null}

          {/* ── Not started, escrow not ready ── */}
          {!isManager && ws === "not_started" && !ready ? (
            <InfoCard title="Waiting for Escrow">
              <Text style={s.hintText}>
                Your manager needs to fund the escrow before you can start this task. Check back once they've added payment.
              </Text>
            </InfoCard>
          ) : null}

          {/* ── Done state ── */}
          {isDone ? (
            <View style={s.doneCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={s.doneTitle}>Work approved</Text>
                <Text style={s.doneText}>Payment has been released for this task.</Text>
              </View>
            </View>
          ) : null}

          {/* Feedback banners */}
          {actionError ? (
            <View style={s.bannerError}>
              <Text style={s.bannerErrorText}>{actionError}</Text>
            </View>
          ) : null}
          {actionSuccess ? (
            <View style={s.bannerSuccess}>
              <Text style={s.bannerSuccessText}>{actionSuccess}</Text>
            </View>
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children }) {
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

function Row({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{String(value ?? "—")}</Text>
    </View>
  );
}

function Btn({ title, onPress, secondary, danger, disabled }) {
  return (
    <Pressable
      style={[
        s.btn,
        secondary && s.btnSecondary,
        danger && s.btnDanger,
        disabled && s.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[s.btnText, secondary && s.btnTextSecondary, danger && s.btnTextDanger]}>
        {title}
      </Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // State cards
  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2), gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },

  // Hero
  hero: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 12,
  },
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroLabel: {
    fontSize: 11, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  heroStatus: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  payBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  payBadgeText: { fontSize: 12, fontWeight: "800" },

  // Escrow warning
  escrowWarn: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A",
    borderRadius: 12, padding: 10,
  },
  escrowWarnText: {
    flex: 1, fontSize: 13, color: colors.warning, fontWeight: "700", lineHeight: 18,
  },

  // Rejection box
  rejectionBox: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, padding: 12, gap: 4,
  },
  rejectionLabel:   { fontSize: 11, fontWeight: "800", color: "#991B1B", textTransform: "uppercase" },
  rejectionText:    { color: "#7F1D1D", fontWeight: "700", lineHeight: 20 },
  rejectionComments: { color: "#B91C1C", lineHeight: 19, fontSize: 13 },

  // Info cards
  infoCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75),
  },
  infoCardTitle:   { fontSize: 15, fontWeight: "800", color: colors.text },
  infoCardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

  // Row detail
  row:      { gap: 3 },
  rowLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  rowValue: { color: colors.text, fontWeight: "600", lineHeight: 21 },

  // Hint text
  hintText: { color: colors.muted, lineHeight: 21, fontSize: 13 },

  // Fields
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 14,
  },
  textArea: { minHeight: 88 },

  // Review blocks
  reviewBlock: {
    gap: 8, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 12, backgroundColor: "#F8FAFC",
  },
  reviewBlockDanger: { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  reviewBlockTitle:  { fontSize: 13, fontWeight: "800", color: colors.text },

  // Done card
  doneCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0",
    borderRadius: 18, padding: spacing(1.75),
  },
  doneTitle: { fontSize: 15, fontWeight: "800", color: colors.success },
  doneText:  { color: "#065F46", lineHeight: 19, fontSize: 13 },

  // Buttons
  btn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  btnSecondary: { backgroundColor: "#E2E8F0" },
  btnDanger:    { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  btnDisabled:  { opacity: 0.6 },
  btnText:          { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnTextSecondary: { color: colors.text },
  btnTextDanger:    { color: colors.danger },

  // Banners
  bannerError: {
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 14, padding: 12,
  },
  bannerErrorText: { color: "#991B1B", fontWeight: "700", lineHeight: 20 },
  bannerSuccess: {
    backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0",
    borderRadius: 14, padding: 12,
  },
  bannerSuccessText: { color: "#065F46", fontWeight: "700", lineHeight: 20 },
});
