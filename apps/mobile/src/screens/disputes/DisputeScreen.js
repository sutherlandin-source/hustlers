import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import AdminResolutionPanel from "../../components/AdminResolutionPanel.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";

// Gracefully handle expo-image-picker not yet installed
let ImagePicker = null;
try {
  // eslint-disable-next-line import/no-unresolved
  ImagePicker = require("expo-image-picker");
} catch {
  // not installed yet
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getDisputeStatusColor(status) {
  const s = lower(status);
  if (s === "open" || s === "pending") return colors.warning;
  if (s === "under_review" || s === "in_review") return colors.accent;
  if (s === "resolved") return colors.success;
  if (s === "closed") return colors.muted;
  return colors.muted;
}

function getDisputeStatusIcon(status) {
  const s = lower(status);
  if (s === "resolved") return "checkmark-circle-outline";
  if (s === "closed")   return "close-circle-outline";
  if (s === "under_review" || s === "in_review") return "eye-outline";
  return "alert-circle-outline";
}

function timelineIcon(eventType) {
  const t = lower(eventType);
  if (t.includes("creat") || t.includes("open")) return "alert-circle-outline";
  if (t.includes("evidence"))                    return "attach-outline";
  if (t.includes("resolve") || t.includes("release")) return "checkmark-circle-outline";
  if (t.includes("refund"))                      return "return-down-back-outline";
  if (t.includes("close"))                       return "close-circle-outline";
  if (t.includes("review") || t.includes("assign")) return "eye-outline";
  if (t.includes("note") || t.includes("message"))  return "chatbubble-outline";
  return "ellipse-outline";
}

function timelineColor(eventType) {
  const t = lower(eventType);
  if (t.includes("resolve") || t.includes("release")) return colors.success;
  if (t.includes("refund"))                            return colors.warning;
  if (t.includes("reject") || t.includes("close"))    return colors.danger;
  return colors.muted;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function InfoRow({ label, value, valueColor }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function TimelineEvent({ event }) {
  const icon  = timelineIcon(event?.eventType);
  const color = timelineColor(event?.eventType);
  const actor = getDisplayName(event?.actor) !== "Unknown" ? getDisplayName(event?.actor) : null;

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { borderColor: color }]}>
          <Ionicons name={icon} size={12} color={color} />
        </View>
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.timelineBody}>
        <Text style={styles.timelineTitle}>{event?.title || formatStatusLabel(event?.eventType)}</Text>
        {event?.detail ? <Text style={styles.timelineDetail}>{event.detail}</Text> : null}
        <Text style={styles.timelineMeta}>
          {actor ? `${actor} · ` : ""}{formatDateTime(event?.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function EvidenceCard({ item }) {
  const submitter = getDisplayName(item?.submittedBy);
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];

  return (
    <View style={styles.evidenceCard}>
      <View style={styles.evidenceHeader}>
        <Ionicons name="attach-outline" size={16} color={colors.accent} />
        <Text style={styles.evidenceTitle}>Evidence</Text>
        <Text style={styles.evidenceMeta}>{formatDateTime(item?.submittedAt || item?.createdAt)}</Text>
      </View>
      {submitter !== "Unknown" ? (
        <Text style={styles.evidenceBy}>Submitted by {submitter}</Text>
      ) : null}
      {item?.notes ? <Text style={styles.evidenceNotes}>{item.notes}</Text> : null}
      {attachments.length > 0 ? (
        <View style={styles.attachmentList}>
          {attachments.map((att, i) => (
            <View key={i} style={styles.attachmentChip}>
              <Ionicons name="document-outline" size={13} color={colors.muted} />
              <Text style={styles.attachmentName} numberOfLines={1}>{att?.name || `Attachment ${i + 1}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DisputeScreen({ route, navigation }) {
  const { disputeId, contractTitle } = route?.params || {};
  const { accessToken, user, role } = useAuth();
  const isAdmin = lower(role) === "admin";

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [dispute, setDispute]       = useState(null);

  // Add evidence form
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceNotes, setEvidenceNotes]       = useState("");
  const [evidenceAttachments, setEvidenceAttachments] = useState([]); // [{name, dataUrl, mimeType}]
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [evidenceError, setEvidenceError]       = useState("");
  const [evidenceSuccess, setEvidenceSuccess]   = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!disputeId || !accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest(`/disputes/${disputeId}`, { token: accessToken });
        const d = payload?.dispute || payload?.data?.dispute || payload;
        setDispute(d);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load dispute.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [disputeId, accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add evidence ──────────────────────────────────────────────────────────

  const handlePickEvidenceImage = async () => {
    if (!ImagePicker) {
      setEvidenceError("File attachment requires expo-image-picker. Run: npx expo install expo-image-picker");
      return;
    }
    if (evidenceAttachments.length >= 3) {
      setEvidenceError("You can attach up to 3 files.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setEvidenceError("Permission to access your photo library is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions
        ? ImagePicker.MediaTypeOptions.All
        : ["images"],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { setEvidenceError("Could not read file data."); return; }
    const mimeType = asset.mimeType || "image/jpeg";
    const name = asset.fileName || `attachment_${Date.now()}.jpg`;
    setEvidenceAttachments((prev) => [
      ...prev,
      { name, dataUrl: `data:${mimeType};base64,${asset.base64}`, mimeType },
    ]);
    setEvidenceError("");
  };

  const handleAddEvidence = async () => {
    if (!evidenceNotes.trim() || submittingEvidence) return;
    setSubmittingEvidence(true);
    setEvidenceError("");
    setEvidenceSuccess("");
    try {
      await apiRequest(`/disputes/${disputeId}/evidence`, {
        token: accessToken,
        method: "POST",
        body: {
          notes: evidenceNotes.trim(),
          attachments: evidenceAttachments.map((a) => ({
            name:    a.name,
            type:    a.mimeType,
            dataUrl: a.dataUrl,
          })),
        },
      });
      setEvidenceSuccess("Evidence submitted successfully.");
      setEvidenceNotes("");
      setEvidenceAttachments([]);
      setShowEvidenceForm(false);
      load({ isRefresh: true });
    } catch (err) {
      setEvidenceError(err?.response?.data?.message || err?.message || "Failed to submit evidence.");
    } finally {
      setSubmittingEvidence(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const status        = dispute?.status || "open";
  const statusColor   = getDisputeStatusColor(status);
  const statusIcon    = getDisputeStatusIcon(status);
  const isOpen        = !["resolved", "closed"].includes(lower(status));
  const timeline      = Array.isArray(dispute?.timeline)      ? dispute.timeline      : [];
  const evidence      = Array.isArray(dispute?.evidence)      ? dispute.evidence      : [];
  const contract      = dispute?.contract || {};
  const raisedBy      = dispute?.raisedBy;
  const assignedAdmin = dispute?.assignedTo;
  const resolution    = dispute?.resolutionType;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle} numberOfLines={1}>Dispute</Text>
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
        {/* Loading */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateTitle}>Loading dispute…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="warning-outline" size={24} color={colors.danger} />
            <Text style={styles.stateTitle}>Unable to load dispute</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : dispute ? (
          <>
            {/* Status banner */}
            <View style={[styles.statusBanner, { borderColor: statusColor + "60", backgroundColor: statusColor + "12" }]}>
              <Ionicons name={statusIcon} size={22} color={statusColor} />
              <View style={styles.statusBannerText}>
                <Text style={[styles.statusBannerLabel, { color: statusColor }]}>
                  Dispute {formatStatusLabel(status)}
                </Text>
                {dispute?.createdAt ? (
                  <Text style={styles.statusBannerSub}>Opened {formatDateTime(dispute.createdAt)}</Text>
                ) : null}
              </View>
            </View>

            {/* Dispute summary */}
            <View style={styles.card}>
              <SectionTitle label="Summary" />
              <InfoRow label="Reason"    value={dispute.reason} />
              <InfoRow label="Raised by" value={getDisplayName(raisedBy)} />
              {assignedAdmin ? (
                <InfoRow label="Assigned to" value={getDisplayName(assignedAdmin)} />
              ) : null}
              {resolution ? (
                <InfoRow
                  label="Resolution"
                  value={formatStatusLabel(resolution)}
                  valueColor={colors.success}
                />
              ) : null}
              {dispute.adminNotes ? (
                <View style={styles.notesBlock}>
                  <Text style={styles.notesLabel}>Admin notes</Text>
                  <Text style={styles.notesText}>{dispute.adminNotes}</Text>
                </View>
              ) : null}
            </View>

            {/* Details */}
            {dispute.details ? (
              <View style={styles.card}>
                <SectionTitle label="Details" />
                <Text style={styles.detailsText}>{dispute.details}</Text>
              </View>
            ) : null}

            {/* Requested resolution */}
            {dispute.requestedResolution ? (
              <View style={styles.card}>
                <SectionTitle label="Requested Resolution" />
                <Text style={styles.detailsText}>{dispute.requestedResolution}</Text>
              </View>
            ) : null}

            {/* Contract info */}
            {contract?.title || contract?._id ? (
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate("ContractDetails", {
                  contractId: contract._id || contract.id,
                })}
              >
                <SectionTitle label="Contract" />
                <Text style={styles.contractTitle}>{contract.title || contractTitle || "Untitled"}</Text>
                <View style={styles.chipRow}>
                  {contract.amount ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipLabel}>Budget</Text>
                      <Text style={styles.chipValue}>{formatMoney(contract.amount, contract.currency || "KSH")}</Text>
                    </View>
                  ) : null}
                  {contract.status ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipLabel}>Status</Text>
                      <Text style={styles.chipValue}>{formatStatusLabel(contract.status)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.tapHint}>Tap to view contract →</Text>
              </Pressable>
            ) : null}

            {/* Admin resolution panel — only shown to admins on open disputes */}
            {isAdmin && isOpen ? (
              <AdminResolutionPanel
                disputeId={disputeId}
                dispute={dispute}
                onActionComplete={() => load({ isRefresh: true })}
              />
            ) : null}

            {/* Evidence */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <SectionTitle label={`Evidence (${evidence.length})`} />
                {isOpen ? (
                  <Pressable
                    style={styles.addEvidenceBtn}
                    onPress={() => { setShowEvidenceForm((v) => !v); setEvidenceError(""); }}
                  >
                    <Ionicons name={showEvidenceForm ? "chevron-up" : "add"} size={15} color={colors.accent} />
                    <Text style={styles.addEvidenceBtnText}>
                      {showEvidenceForm ? "Cancel" : "Add evidence"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Add evidence form */}
              {showEvidenceForm ? (
                <View style={styles.evidenceForm}>
                  <Text style={styles.fieldLabel}>Notes / description</Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    value={evidenceNotes}
                    onChangeText={setEvidenceNotes}
                    placeholder="Describe the evidence you are submitting…"
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={1000}
                    textAlignVertical="top"
                  />

                  {/* Attachment picker */}
                  <Text style={styles.fieldLabel}>Attachments (optional, up to 3)</Text>
                  <Pressable
                    style={styles.attachBtn}
                    onPress={handlePickEvidenceImage}
                    disabled={evidenceAttachments.length >= 3}
                  >
                    <Ionicons name="attach-outline" size={16} color={evidenceAttachments.length >= 3 ? colors.muted : colors.accent} />
                    <Text style={[styles.attachBtnText, evidenceAttachments.length >= 3 && { color: colors.muted }]}>
                      {evidenceAttachments.length >= 3 ? "Max 3 files reached" : "Attach image or file"}
                    </Text>
                  </Pressable>

                  {/* Attachment list */}
                  {evidenceAttachments.length > 0 ? (
                    <View style={styles.attachList}>
                      {evidenceAttachments.map((att, idx) => (
                        <View key={idx} style={styles.attachItem}>
                          {att.mimeType?.startsWith("image/") ? (
                            <Image source={{ uri: att.dataUrl }} style={styles.attachThumb} />
                          ) : (
                            <View style={styles.attachIconWrap}>
                              <Ionicons name="document-outline" size={18} color={colors.accent} />
                            </View>
                          )}
                          <Text style={styles.attachName} numberOfLines={1}>{att.name}</Text>
                          <Pressable
                            onPress={() => setEvidenceAttachments((prev) => prev.filter((_, i) => i !== idx))}
                            hitSlop={8}
                          >
                            <Ionicons name="close-circle" size={18} color={colors.muted} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {evidenceError ? (
                    <Text style={styles.inlineError}>{evidenceError}</Text>
                  ) : null}
                  {evidenceSuccess ? (
                    <Text style={styles.inlineSuccess}>{evidenceSuccess}</Text>
                  ) : null}
                  <Pressable
                    style={[styles.submitEvidenceBtn, (!evidenceNotes.trim() || submittingEvidence) && styles.submitBtnDisabled]}
                    onPress={handleAddEvidence}
                    disabled={!evidenceNotes.trim() || submittingEvidence}
                  >
                    {submittingEvidence
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.submitEvidenceBtnText}>Submit Evidence</Text>
                    }
                  </Pressable>
                </View>
              ) : null}

              {evidence.length > 0
                ? evidence.map((item, i) => <EvidenceCard key={i} item={item} />)
                : !showEvidenceForm
                  ? <Text style={styles.emptyNote}>No evidence submitted yet.</Text>
                  : null
              }
            </View>

            {/* Timeline */}
            {timeline.length > 0 ? (
              <View style={styles.card}>
                <SectionTitle label="Activity Timeline" />
                <View style={styles.timeline}>
                  {[...timeline].reverse().map((event, i) => (
                    <TimelineEvent key={i} event={event} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Resolved / closed notice */}
            {!isOpen ? (
              <View style={styles.resolvedBanner}>
                <Ionicons name="checkmark-done-outline" size={20} color={colors.success} />
                <Text style={styles.resolvedText}>
                  This dispute has been {lower(status)} by the admin team.
                  {resolution ? ` Resolution: ${formatStatusLabel(resolution)}.` : ""}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  navbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    gap: 10,
  },
  navTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.text },

  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(5),
    gap: spacing(1.5),
  },

  // State cards
  stateCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
    alignItems: "flex-start",
    gap: 10,
  },
  stateTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  stateText:  { color: colors.muted, lineHeight: 22, fontSize: 14 },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Status banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  statusBannerText: { flex: 1, gap: 3 },
  statusBannerLabel: { fontWeight: "800", fontSize: 15 },
  statusBannerSub:   { color: colors.muted, fontSize: 12 },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },
  sectionTitle: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  infoLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", flexShrink: 0 },
  infoValue: { color: colors.text,  fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  notesBlock: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  notesLabel: { color: colors.muted,  fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  notesText:  { color: colors.text,   fontSize: 13, lineHeight: 21 },
  detailsText: { color: colors.text,  fontSize: 14, lineHeight: 22 },

  // Contract card
  contractTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  chipLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  chipValue: { color: colors.text,  fontSize: 12, fontWeight: "700" },
  tapHint:   { color: colors.muted, fontSize: 11, textAlign: "right" },

  // Add evidence
  addEvidenceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.accent + "60",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#EFF6FF",
  },
  addEvidenceBtnText: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  evidenceForm: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  fieldLabel:  { color: colors.text, fontWeight: "700", fontSize: 13 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: "top" },
  inlineError:   { color: colors.danger,  fontWeight: "700", fontSize: 13 },
  inlineSuccess: { color: colors.success, fontWeight: "700", fontSize: 13 },
  submitEvidenceBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitBtnDisabled:    { opacity: 0.45 },
  submitEvidenceBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  attachBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#fff",
  },
  attachBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  attachList: { gap: 8 },
  attachItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  attachThumb:   { width: 36, height: 36, borderRadius: 8 },
  attachIconWrap: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: colors.accent + "18",
    alignItems: "center", justifyContent: "center",
  },
  attachName: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },

  // Evidence cards
  evidenceCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  evidenceTitle: { color: colors.text,  fontWeight: "800", fontSize: 13, flex: 1 },
  evidenceMeta:  { color: colors.muted, fontSize: 11 },
  evidenceBy:    { color: colors.muted, fontSize: 12 },
  evidenceNotes: { color: colors.text,  fontSize: 13, lineHeight: 20 },
  attachmentList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 180,
  },
  attachmentName: { color: colors.muted, fontSize: 11, flex: 1 },
  emptyNote: { color: colors.muted, fontSize: 13, lineHeight: 20 },

  // Timeline
  timeline: { gap: 0 },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
  },
  timelineLeft: {
    alignItems: "center",
    width: 28,
    flexShrink: 0,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 14,
    gap: 3,
  },
  timelineTitle:  { color: colors.text,  fontWeight: "700", fontSize: 13 },
  timelineDetail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  timelineMeta:   { color: colors.muted, fontSize: 11 },

  // Resolved banner
  resolvedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 14,
  },
  resolvedText: { flex: 1, color: "#166534", fontSize: 13, lineHeight: 20, fontWeight: "600" },
});
