import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest } from "../services/api.js";
import { useAuth } from "../context/AuthContext.js";
import { colors, spacing } from "../theme.js";
import { formatMoney } from "../utils/format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

const ACTIONS = [
  {
    key:     "under_review",
    label:   "Mark Under Review",
    icon:    "eye-outline",
    color:   "#2563EB",
    bg:      "#EFF6FF",
    hint:    "Flag this dispute for active investigation.",
    noteRequired: false,
  },
  {
    key:     "release_payment",
    label:   "Release Payment",
    icon:    "cash-outline",
    color:   "#059669",
    bg:      "#F0FDF4",
    hint:    "Release locked escrow funds to the hustler.",
    noteRequired: true,
  },
  {
    key:     "refund_manager",
    label:   "Refund to Manager",
    icon:    "return-down-back-outline",
    color:   "#D97706",
    bg:      "#FFFBEB",
    hint:    "Return the locked escrow share to available balance.",
    noteRequired: true,
  },
  {
    key:     "split_payment",
    label:   "Split Payment",
    icon:    "git-branch-outline",
    color:   "#7C3AED",
    bg:      "#F5F3FF",
    hint:    "Split remaining escrow between manager and hustler.",
    noteRequired: true,
    extra:   "split",
  },
  {
    key:     "request_evidence",
    label:   "Request Evidence",
    icon:    "attach-outline",
    color:   "#0284C7",
    bg:      "#F0F9FF",
    hint:    "Ask parties to submit supporting documents.",
    noteRequired: true,
    extra:   "evidence",
  },
  {
    key:     "close",
    label:   "Close Dispute",
    icon:    "close-circle-outline",
    color:   "#DC2626",
    bg:      "#FEF2F2",
    hint:    "Close this dispute without a financial action.",
    noteRequired: true,
  },
];

const EVIDENCE_TYPES = ["photos", "videos", "documents", "receipts", "screenshots"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminResolutionPanel({ disputeId, dispute, onActionComplete }) {
  const { accessToken } = useAuth();

  const [selectedAction, setSelectedAction] = useState(null);
  const [note, setNote]                     = useState("");
  const [splitRatio, setSplitRatio]         = useState("50");
  const [evidenceTypes, setEvidenceTypes]   = useState(["documents"]);
  const [recipientRoles, setRecipientRoles] = useState("both");
  const [deadline, setDeadline]             = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");

  const isResolved = ["resolved", "closed"].includes(lower(dispute?.status));

  const activeAction = ACTIONS.find((a) => a.key === selectedAction);

  const canSubmit = () => {
    if (!selectedAction) return false;
    if (activeAction?.noteRequired && !note.trim()) return false;
    if (selectedAction === "request_evidence") {
      if (!evidenceTypes.length) return false;
      if (!deadline.trim()) return false;
    }
    return true;
  };

  const toggleEvidenceType = (type) => {
    setEvidenceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit() || submitting) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    const body = { action: selectedAction, note: note.trim() };

    if (selectedAction === "split_payment") {
      const ratio = Number(splitRatio);
      if (isNaN(ratio) || ratio < 0 || ratio > 100) {
        setError("Split ratio must be between 0 and 100.");
        setSubmitting(false);
        return;
      }
      body.splitRatio = ratio;
    }

    if (selectedAction === "request_evidence") {
      // deadline: expect YYYY-MM-DD, convert to ISO
      const deadlineParsed = new Date(deadline.trim());
      if (isNaN(deadlineParsed.getTime())) {
        setError("Enter a valid deadline (YYYY-MM-DD).");
        setSubmitting(false);
        return;
      }
      body.requiredEvidenceTypes = evidenceTypes;
      body.recipientRoles        = recipientRoles;
      body.responseDeadline      = deadlineParsed.toISOString();
    }

    try {
      await apiRequest(`/disputes/${disputeId}/actions`, {
        token:  accessToken,
        method: "POST",
        body,
      });
      setSuccess(`Action "${activeAction?.label}" applied successfully.`);
      setSelectedAction(null);
      setNote("");
      setSplitRatio("50");
      setDeadline("");
      setEvidenceTypes(["documents"]);
      onActionComplete?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isResolved) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Admin Resolution</Text>
      <Text style={styles.panelHint}>Select an action to resolve or manage this dispute.</Text>

      {/* Action buttons grid */}
      <View style={styles.actionGrid}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            style={[
              styles.actionCard,
              { borderColor: selectedAction === action.key ? action.color : colors.border },
              selectedAction === action.key && { backgroundColor: action.bg },
            ]}
            onPress={() => {
              setSelectedAction(selectedAction === action.key ? null : action.key);
              setError("");
              setSuccess("");
              setNote("");
            }}
            accessibilityRole="button"
          >
            <Ionicons name={action.icon} size={18} color={selectedAction === action.key ? action.color : colors.muted} />
            <Text style={[styles.actionLabel, selectedAction === action.key && { color: action.color }]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Hint for selected action */}
      {activeAction ? (
        <View style={[styles.hintBanner, { borderColor: activeAction.color + "40", backgroundColor: activeAction.bg }]}>
          <Ionicons name="information-circle-outline" size={15} color={activeAction.color} />
          <Text style={[styles.hintText, { color: activeAction.color }]}>{activeAction.hint}</Text>
        </View>
      ) : null}

      {/* Note field — shown when an action is selected */}
      {selectedAction ? (
        <View style={styles.formBlock}>
          <Text style={styles.fieldLabel}>
            Admin notes {activeAction?.noteRequired ? <Text style={styles.required}>*</Text> : <Text style={styles.optional}>(optional)</Text>}
          </Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={note}
            onChangeText={setNote}
            placeholder="Describe the decision, context, or instructions…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />

          {/* Split ratio — only for split_payment */}
          {selectedAction === "split_payment" ? (
            <View style={styles.extraField}>
              <Text style={styles.fieldLabel}>Manager's share (%) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={splitRatio}
                onChangeText={setSplitRatio}
                keyboardType="number-pad"
                placeholder="e.g. 50"
                placeholderTextColor={colors.muted}
                maxLength={3}
              />
              <Text style={styles.fieldHint}>
                Manager gets {splitRatio || "?"}%, hustler gets {100 - Number(splitRatio || 0)}%
              </Text>
            </View>
          ) : null}

          {/* Evidence request extras */}
          {selectedAction === "request_evidence" ? (
            <View style={styles.extraField}>
              <Text style={styles.fieldLabel}>Required evidence types <Text style={styles.required}>*</Text></Text>
              <View style={styles.checkRow}>
                {EVIDENCE_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.checkChip, evidenceTypes.includes(type) && styles.checkChipActive]}
                    onPress={() => toggleEvidenceType(type)}
                  >
                    <Text style={[styles.checkChipText, evidenceTypes.includes(type) && styles.checkChipTextActive]}>
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Send request to</Text>
              <View style={styles.checkRow}>
                {["both", "hustler", "manager"].map((role) => (
                  <Pressable
                    key={role}
                    style={[styles.checkChip, recipientRoles === role && styles.checkChipActive]}
                    onPress={() => setRecipientRoles(role)}
                  >
                    <Text style={[styles.checkChipText, recipientRoles === role && styles.checkChipTextActive]}>
                      {role}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Response deadline <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={deadline}
                onChangeText={setDeadline}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
          ) : null}

          {/* Feedback */}
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <View style={styles.submitRow}>
            <Pressable
              style={[
                styles.submitBtn,
                activeAction && { backgroundColor: activeAction.color },
                (!canSubmit() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit() || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Ionicons name={activeAction?.icon || "checkmark-outline"} size={16} color="#fff" />
                    <Text style={styles.submitBtnText}>{activeAction?.label || "Apply"}</Text>
                  </>
                )
              }
            </Pressable>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => { setSelectedAction(null); setError(""); setNote(""); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Success shown when no action is selected */}
      {!selectedAction && success ? (
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
          <Text style={styles.successText}>{success}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: spacing(1.75),
    gap: spacing(1.25),
  },
  panelTitle: { color: colors.text, fontWeight: "800", fontSize: 15 },
  panelHint:  { color: colors.muted, fontSize: 13, lineHeight: 19 },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: "44%",
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
  },
  actionLabel: { color: colors.muted, fontWeight: "700", fontSize: 12, flex: 1 },

  hintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "600" },

  formBlock: { gap: 10 },
  fieldLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  required:   { color: colors.danger },
  optional:   { color: colors.muted, fontWeight: "600" },
  fieldHint:  { color: colors.muted, fontSize: 11 },

  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: "top" },

  extraField: { gap: 8 },
  checkRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  checkChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  checkChipActive:    { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  checkChipText:      { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  checkChipTextActive:{ color: colors.accent },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { flex: 1, color: colors.danger, fontWeight: "700", fontSize: 13 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  successText: { flex: 1, color: colors.success, fontWeight: "700", fontSize: 13 },

  submitRow: { flexDirection: "row", gap: 8 },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  cancelBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
});
