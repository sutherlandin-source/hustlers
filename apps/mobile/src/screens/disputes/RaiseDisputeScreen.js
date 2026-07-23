import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatMoney } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";
import BackButton from '../../components/BackButton.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

const REASON_OPTIONS = [
  "Work not completed as agreed",
  "Work quality below standard",
  "Payment not released after approval",
  "Deadline not met",
  "Contract terms violated",
  "Harassment or unprofessional behaviour",
  "Fraudulent activity",
  "Other",
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RaiseDisputeScreen({ route, navigation }) {
  const { contractId, contractTitle } = route?.params || {};
  const { accessToken } = useAuth();

  const [contract, setContract]               = useState(null);
  const [loadingContract, setLoadingContract] = useState(true);
  const [contractError, setContractError]     = useState("");

  // Form state
  const [reason, setReason]                         = useState("");
  const [customReason, setCustomReason]             = useState("");
  const [details, setDetails]                       = useState("");
  const [requestedResolution, setRequestedResolution] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load contract for the info summary card
  const loadContract = useCallback(async () => {
    if (!contractId || !accessToken) { setLoadingContract(false); return; }
    setLoadingContract(true);
    setContractError("");
    try {
      // Check for existing dispute first — redirect if one already exists
      const existingPayload = await apiRequest(`/disputes/contract/${contractId}`, { token: accessToken })
        .catch(() => null);
      const existing = existingPayload?.dispute || existingPayload?.data?.dispute;
      if (existing?._id || existing?.id) {
        navigation.replace("Dispute", {
          disputeId: existing._id || existing.id,
          contractTitle: contractTitle || existing?.contract?.title,
        });
        return;
      }

      const payload = await apiRequest(`/contracts/${contractId}`, { token: accessToken });
      const c = payload?.contract || payload?.data?.contract || payload;
      setContract(c);
    } catch (err) {
      setContractError(err?.response?.data?.message || err?.message || "Unable to load contract.");
    } finally {
      setLoadingContract(false);
    }
  }, [contractId, accessToken, contractTitle, navigation]);

  useEffect(() => { loadContract(); }, [loadContract]);

  const effectiveReason = reason === "Other" ? customReason.trim() : reason;
  const canSubmit = Boolean(effectiveReason && details.trim().length >= 10 && contractId);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = await apiRequest("/disputes", {
        token: accessToken,
        method: "POST",
        body: {
          contractId,
          reason: effectiveReason,
          details: details.trim(),
          requestedResolution: requestedResolution.trim() || undefined,
        },
      });
      const dispute = payload?.dispute || payload?.data?.dispute;
      const disputeId = dispute?._id || dispute?.id;
      navigation.replace("Dispute", {
        disputeId,
        contractTitle: contract?.title || contractTitle,
      });
    } catch (err) {
      setSubmitError(err?.response?.data?.message || err?.message || "Failed to open dispute. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle} numberOfLines={1}>Open Dispute</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Contract summary */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Contract</Text>
          {loadingContract ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.mutedText}>Loading contract…</Text>
            </View>
          ) : contractError ? (
            <Text style={styles.errorText}>{contractError}</Text>
          ) : contract ? (
            <>
              <Text style={styles.contractTitle}>{contract.title || contractTitle || "Untitled"}</Text>
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Budget</Text>
                  <Text style={styles.chipValue}>{formatMoney(contract.amount, contract.currency || "KSH")}</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Status</Text>
                  <Text style={styles.chipValue}>{formatStatusLabel(contract.status)}</Text>
                </View>
                {contract.workLocation ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipLabel}>Location</Text>
                    <Text style={styles.chipValue}>{contract.workLocation}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.contractTitle}>{contractTitle || "Contract"}</Text>
          )}
        </View>

        {/* Warning banner */}
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={18} color="#92400E" />
          <Text style={styles.warningText}>
            Disputes are reviewed by our admin team. Please provide accurate details.
            Raising a false dispute may result in account suspension.
          </Text>
        </View>

        {/* Reason selection */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Reason for Dispute</Text>
          <Text style={styles.fieldHint}>Select the issue that best describes the problem.</Text>
          <View style={styles.reasonList}>
            {REASON_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={[styles.reasonOption, reason === option && styles.reasonOptionSelected]}
                onPress={() => { setReason(option); setSubmitError(""); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: reason === option }}
              >
                <View style={[styles.reasonRadio, reason === option && styles.reasonRadioSelected]}>
                  {reason === option ? <View style={styles.reasonRadioDot} /> : null}
                </View>
                <Text style={[styles.reasonText, reason === option && styles.reasonTextSelected]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          {reason === "Other" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Specify reason</Text>
              <TextInput
                style={styles.input}
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Briefly describe the issue"
                placeholderTextColor={colors.muted}
                maxLength={120}
              />
            </View>
          ) : null}
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Details</Text>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Describe what happened <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={details}
              onChangeText={setDetails}
              placeholder="Explain the issue in full — include dates, actions taken, and any relevant context."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{details.length}/2000 · min 10 characters</Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Requested resolution <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMid]}
              value={requestedResolution}
              onChangeText={setRequestedResolution}
              placeholder="What outcome are you asking the admin team to consider?"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Error */}
        {submitError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit dispute"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Open Dispute</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footerNote}>
          Once submitted, the contract will be flagged and reviewed by the admin team.
          Both parties will be notified.
        </Text>

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

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },
  sectionLabel: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contractTitle: { color: colors.text, fontWeight: "800", fontSize: 17 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mutedText: { color: colors.muted, fontSize: 14 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    minWidth: 80,
  },
  chipLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  chipValue: { color: colors.text, fontSize: 13, fontWeight: "700" },

  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 14,
  },
  warningText: { flex: 1, color: "#92400E", fontSize: 13, lineHeight: 20 },

  reasonList: { gap: 8 },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reasonOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reasonRadioSelected: { borderColor: colors.accent },
  reasonRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  reasonText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" },
  reasonTextSelected: { fontWeight: "800", color: colors.accent },

  fieldHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  required: { color: colors.danger },
  optional: { color: colors.muted, fontWeight: "600" },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputMulti: { minHeight: 120, textAlignVertical: "top" },
  inputMid:   { minHeight: 80,  textAlignVertical: "top" },
  charCount:  { color: colors.muted, fontSize: 11, alignSelf: "flex-end" },

  errorText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errorBannerText: { flex: 1, color: colors.danger, fontWeight: "700", fontSize: 13 },

  submitBtn: {
    backgroundColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  footerNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: spacing(1),
  },
});
