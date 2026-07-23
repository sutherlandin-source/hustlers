import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeStatus(raw) {
  const s = lower(raw).replace(/_/g, " ");
  if (!s || s === "pending review" || s === "under review") return "Pending";
  if (s === "accepted" || s === "approved") return "Accepted";
  if (s === "rejected" || s === "declined") return "Rejected";
  if (s === "cancelled") return "Cancelled";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * apiRequest unwraps response.data automatically.
 * GET /applications/:id → returns the application object directly.
 * Guard against any envelope shape the server might use.
 */
function extractApplication(payload) {
  if (!payload) return null;
  // plain application object
  if (payload._id || payload.id) return payload;
  // { application: {...} }
  if (payload.application?._id) return payload.application;
  // { data: {...} }
  if (payload.data?._id) return payload.data;
  return null;
}

function getApplicant(app) {
  return app?.hustlerId || app?.applicant || {};
}

function getContract(app) {
  return app?.contractId || app?.contract || {};
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ApplicationDetailsScreen({ navigation, route }) {
  const { accessToken, role, user } = useAuth();
  const isManager = lower(role) === "manager";

  const {
    applicationId,
    contractId: routeContractId,
  } = route?.params || {};

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [application, setApplication] = useState(null);

  // Action state
  const [actionLoading, setActionLoading] = useState(""); // "accept" | "reject" | "message"
  const [actionError, setActionError]     = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken || !applicationId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const payload = await apiRequest(`/applications/${applicationId}`, {
          token: accessToken,
        });
        const app = extractApplication(payload);
        if (!app) throw new Error("Application not found in server response.");
        setApplication(app);
      } catch (err) {
        setError(
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load application details."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, applicationId]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived values ────────────────────────────────────────────────────────

  const applicant = useMemo(() => getApplicant(application), [application]);
  const contract  = useMemo(() => getContract(application),  [application]);
  const status    = useMemo(() => normalizeStatus(application?.status), [application]);

  const applicantName   = getDisplayName(applicant);
  const avatar          = applicant?.avatar || applicant?.profilePhoto;
  const applicantRating = Number(applicant?.averageRating || applicant?.rating || 0);
  const applicantReviews = Number(applicant?.totalReviews || applicant?.reviewCount || 0);
  const applicantJobs   = Number(applicant?.completedContracts || applicant?.completedJobs || 0);
  const applicantLocation = applicant?.location || "Not shared";
  const applicantBio    = applicant?.bio || "";
  const skills          = Array.isArray(applicant?.skills) ? applicant.skills.filter(Boolean) : [];

  const proposedRate    = Number(application?.proposedRate || application?.requestedRate || 0);
  const workersRequired = Number(contract?.numWorkers || 1);
  const coverLetter     = application?.coverLetter || application?.message || "";
  const estimatedDuration = application?.estimatedDuration || "";

  // Resolve the contract ID for navigation
  const resolvedContractId = useMemo(() => {
    const c = application?.contractId;
    if (c && typeof c === "object") return c._id || c.id;
    return c || routeContractId || "";
  }, [application?.contractId, routeContractId]);

  const canAct = isManager && status === "Pending";

  // ── Hustler-side derived values ─────────────────────────────────────────

  const isHustler = lower(role) === "hustler";
  const isMyApplication = isHustler && String(user?._id || user?.id || "") === String(getApplicant(application)?._id || getApplicant(application)?.id || "");
  // Can withdraw/cancel only when pending
  const canWithdraw = isMyApplication && status === "Pending";


  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAccept = async () => {
    if (!application?._id || actionLoading) return;
    setActionLoading("accept");
    setActionError("");
    setActionSuccess("");
    try {
      await apiRequest(`/applications/${application._id}/accept`, {
        token: accessToken,
        method: "POST",
      });
      setActionSuccess("Application accepted. The hustler has been assigned to this contract.");
      await load({ isRefresh: true });
      // Bounce back to the Applications list so the manager sees the updated state
      navigation.navigate("Applications", {
        contractId: resolvedContractId,
        refreshToken: Date.now(),
      });
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not accept this application."
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleReject = async () => {
    if (!application?._id || actionLoading) return;
    if (!rejectionReason.trim()) {
      setActionError("Please enter a rejection reason before rejecting.");
      return;
    }
    setActionLoading("reject");
    setActionError("");
    setActionSuccess("");
    try {
      await apiRequest(`/applications/${application._id}/reject`, {
        token: accessToken,
        method: "POST",
        body: { rejectionReason: rejectionReason.trim() },
      });
      setActionSuccess("Application rejected.");
      setRejectionReason("");
      await load({ isRefresh: true });
      navigation.navigate("Applications", {
        contractId: resolvedContractId,
        refreshToken: Date.now(),
      });
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not reject this application."
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleMessage = async () => {
    if (actionLoading) return;
    const applicantId = applicant?._id || applicant?.id;
    if (!applicantId) { setActionError("Applicant ID not available."); return; }
    setActionLoading("message");
    setActionError("");
    try {
      const result = await apiRequest("/conversations", {
        token: accessToken,
        method: "POST",
        body: {
          participants: [user?._id || user?.id, applicantId],
          contractId: resolvedContractId || undefined,
        },
      });
      const conversation =
        result?.conversation ||
        result?.data?.conversation ||
        result;
      const convId = conversation?._id || conversation?.id;
      if (convId) {
        navigation.navigate("Chat", {
          conversationId: String(convId),
          title: applicantName || "Applicant",
        });
      } else {
        setActionError("Could not open conversation.");
      }
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not open conversation."
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleCancelApplication = async () => {
    if (!application?._id || actionLoading) return;
    setActionLoading("cancel");
    setActionError("");
    setActionSuccess("");
    try {
      await apiRequest(`/applications/${application._id}/cancel`, {
        token:  accessToken,
        method: "POST",
      });
      setActionSuccess("Application withdrawn. You can apply again if the contract is still open.");
      await load({ isRefresh: true });
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not withdraw this application."
      );
    } finally {
      setActionLoading("");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Application"
      subtitle="Review the applicant's profile and make a decision."
      showBack
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
      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.stateTitle}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={s.stateCard}>
          <Text style={s.stateTitle}>Could not load application</Text>
          <Text style={s.stateText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !application ? (
        <View style={s.stateCard}>
          <Text style={s.stateTitle}>Application not found</Text>
          <Text style={s.stateText}>This application may have been removed.</Text>
        </View>
      ) : (
        <>
          {/* ── Hero ── */}
          <View style={s.hero}>
            <View style={s.heroRow}>
              <View style={s.avatarWrap}>
                {avatar
                  ? <Image source={{ uri: avatar }} style={s.avatar} />
                  : <Text style={s.avatarText}>{getInitials(applicantName)}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroName}>{applicantName}</Text>
                <Text style={s.heroContract} numberOfLines={1}>
                  {contract?.title || "Untitled contract"}
                </Text>
                <Text style={s.heroMeta}>
                  Applied {formatDate(application.appliedAt || application.createdAt)}
                </Text>
              </View>
              <StatusBadge status={status} />
            </View>
          </View>

          {/* ── Applicant profile ── */}
          <Card title="Applicant Profile">
            <Row label="Name"      value={applicantName} />
            <Row label="Location"  value={applicantLocation} />
            {applicantBio
              ? <Row label="Bio" value={applicantBio} />
              : null}
            {skills.length
              ? <Row label="Skills" value={skills.join(", ")} />
              : null}
            <Row
              label="Rating"
              value={applicantRating > 0 ? `${applicantRating.toFixed(1)} / 5 (${applicantReviews} reviews)` : "No ratings yet"}
            />
            <Row
              label="Completed contracts"
              value={applicantJobs > 0 ? String(applicantJobs) : "None yet"}
            />
          </Card>

          {/* ── Application details ── */}
          <Card title="Application Details">
            <Row label="Status"     value={status} />
            <Row
              label="Proposed rate"
              value={proposedRate > 0 ? formatMoney(proposedRate, contract?.currency || "KSH") : "Not specified"}
            />
            {estimatedDuration
              ? <Row label="Estimated duration" value={estimatedDuration} />
              : null}
            {coverLetter
              ? <Row label="Cover letter" value={coverLetter} />
              : <Row label="Cover letter" value="None provided" />}
            {status === "Accepted"
              ? <Row label="Accepted on" value={formatDate(application.reviewedAt || application.updatedAt)} />
              : null}
            {status === "Rejected" && application.rejectionReason
              ? <Row label="Rejection reason" value={application.rejectionReason} />
              : null}
          </Card>

          {/* ── Contract summary ── */}
          <Card title="Contract">
            <Row label="Title"            value={contract?.title || "—"} />
            <Row label="Budget"           value={formatMoney(contract?.amount, contract?.currency || "KSH")} />
            <Row label="Workers required" value={String(workersRequired)} />
            {contract?.jobCategory
              ? <Row label="Category" value={contract.jobCategory} />
              : null}
            {contract?.workLocation
              ? <Row label="Location" value={contract.workLocation} />
              : null}
            {resolvedContractId ? (
              <Btn
                secondary
                title="Open Contract"
                onPress={() => {
                  const parent = navigation.getParent?.();
                  (parent ?? navigation).navigate("ContractDetails", {
                    contractId: resolvedContractId,
                  });
                }}
              />
            ) : null}
          </Card>

          {/* ── Manager actions (Pending only) ── */}
          {canAct ? (
            <Card title="Review">
              <Btn
                title={actionLoading === "accept" ? "Accepting…" : "Accept Application"}
                onPress={handleAccept}
                disabled={Boolean(actionLoading)}
              />

              <View style={s.rejectBlock}>
                <Text style={s.rejectLabel}>Rejection reason</Text>
                <TextInput
                  style={s.rejectInput}
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  placeholder="Explain why this application is being rejected…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  textAlignVertical="top"
                />
                <Btn
                  secondary
                  title={actionLoading === "reject" ? "Rejecting…" : "Reject Application"}
                  onPress={handleReject}
                  disabled={Boolean(actionLoading)}
                />
              </View>

              <Btn
                secondary
                title={actionLoading === "message" ? "Opening…" : "Message Applicant"}
                onPress={handleMessage}
                disabled={Boolean(actionLoading)}
              />
            </Card>
          ) : null}

          {/* Contact button for accepted / non-pending — manager only, matching web */}
          {!canAct && isManager ? (
            <Card title="Contact">
              <Btn
                secondary
                title={actionLoading === "message" ? "Opening…" : "Message Applicant"}
                onPress={handleMessage}
                disabled={Boolean(actionLoading)}
              />
            </Card>
          ) : null}

          {/* ── Hustler: withdraw pending application ── */}
          {canWithdraw ? (
            <Card title="Your Application">
              <Btn
                secondary
                title={actionLoading === "cancel" ? "Withdrawing…" : "Withdraw Application"}
                onPress={handleCancelApplication}
                disabled={Boolean(actionLoading)}
              />
            </Card>
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

function Card({ title, children }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      <View style={s.cardDivider} />
      <View style={s.cardBody}>{children}</View>
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

function Btn({ title, onPress, secondary, disabled }) {
  return (
    <Pressable
      style={[s.btn, secondary && s.btnSecondary, disabled && s.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[s.btnText, secondary && s.btnTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function StatusBadge({ status }) {
  const variant =
    status === "Accepted"  ? s.badgeAccepted  :
    status === "Rejected"  ? s.badgeRejected  :
    status === "Cancelled" ? s.badgeCancelled :
    s.badgePending;
  return <Text style={[s.badge, variant]}>{status}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2), gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },
  retryBtn:   { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  retryText:  { color: "#fff", fontWeight: "800" },
  hero: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75),
  },
  heroRow:   { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatar:    { width: "100%", height: "100%" },
  avatarText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  heroName:     { fontSize: 17, fontWeight: "800", color: colors.text },
  heroContract: { color: colors.muted, marginTop: 3, lineHeight: 19 },
  heroMeta:     { color: colors.muted, fontSize: 12, marginTop: 3 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, fontSize: 12, fontWeight: "800",
  },
  badgePending:   { backgroundColor: "#FEF3C7", color: "#B45309" },
  badgeAccepted:  { backgroundColor: "#DCFCE7", color: "#15803D" },
  badgeRejected:  { backgroundColor: "#FEE2E2", color: "#B91C1C" },
  badgeCancelled: { backgroundColor: "#F1F5F9", color: "#64748B" },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75),
  },
  cardTitle:   { fontSize: 15, fontWeight: "800", color: colors.text },
  cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  cardBody:    { gap: 10 },
  row:      { gap: 3 },
  rowLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  rowValue: { color: colors.text, fontWeight: "600", lineHeight: 21 },
  rejectBlock: {
    gap: 8, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 12, backgroundColor: "#F8FAFC",
  },
  rejectLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  rejectInput: {
    minHeight: 88, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 14,
  },
  btn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },
  btnSecondary: { backgroundColor: "#E2E8F0" },
  btnDisabled:  { opacity: 0.6 },
  btnText:          { color: "#fff", fontWeight: "800" },
  btnTextSecondary: { color: colors.text },
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
