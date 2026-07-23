/**
 * MilestoneCreateScreen
 * Lets managers add a work stage (milestone) to one of their existing contracts.
 * Improvement over web: has a contract picker instead of a raw ID input field.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
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
import { formatMoney } from "../../utils/format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function normalizeAmount(v) {
  return String(v || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
}

function pad2(n) { return String(n).padStart(2, "0"); }

function toISODateString(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ─── Contract Picker Modal ────────────────────────────────────────────────────

function ContractPickerModal({ visible, contracts, loading, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  const filtered = contracts.filter((c) => {
    if (!search.trim()) return true;
    return [c.title, c.jobCategory, c._id, c.id]
      .join(" ").toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Contract</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <TextInput
          style={styles.pickerSearch}
          value={search}
          onChangeText={setSearch}
          placeholder="Search contracts…"
          placeholderTextColor="#94A3B8"
        />

        {loading ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <Text style={styles.pickerEmpty}>
            {contracts.length === 0 ? "No contracts found." : "No contracts match that search."}
          </Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item._id || item.id)}
            contentContainerStyle={{ paddingBottom: spacing(2) }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => { onSelect(item); onClose(); setSearch(""); }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.pickerRowTitle} numberOfLines={1}>
                    {item.title || "Untitled contract"}
                  </Text>
                  <Text style={styles.pickerRowMeta}>
                    {item.jobCategory || "—"} · {formatMoney(item.amount, item.currency || "KSH")}
                  </Text>
                </View>
                <View style={[styles.pickerStatusPill, { backgroundColor: lower(item.status) === "active" ? colors.success + "22" : colors.muted + "22" }]}>
                  <Text style={[styles.pickerStatusText, { color: lower(item.status) === "active" ? colors.success : colors.muted }]}>
                    {String(item.status || "draft").replace(/_/g, " ")}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MilestoneCreateScreen({ navigation }) {
  const { accessToken, role } = useAuth();
  const isManager = lower(role) === "manager";

  // Contract picker state
  const [contracts, setContracts]         = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [showPicker, setShowPicker]       = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  // Form fields
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount]           = useState("");
  const [dueDate, setDueDate]         = useState("");

  // Submission state
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess]         = useState("");

  // ── Load manager's contracts ───────────────────────────────────────────────

  const loadContracts = useCallback(async () => {
    if (!accessToken || !isManager) return;
    setContractsLoading(true);
    try {
      const payload = await apiRequest("/contracts", {
        token: accessToken,
        query: { limit: 100 },
      });
      const list =
        Array.isArray(payload?.contracts) ? payload.contracts :
        Array.isArray(payload?.data?.contracts) ? payload.data.contracts :
        Array.isArray(payload) ? payload : [];
      // Only show non-completed contracts
      setContracts(list.filter((c) => !["completed", "cancelled", "terminated"].includes(lower(c.status))));
    } catch {
      // Non-fatal — picker will show empty state
    } finally {
      setContractsLoading(false);
    }
  }, [accessToken, isManager]);

  useFocusEffect(useCallback(() => { loadContracts(); }, [loadContracts]));

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!isManager) { setError("Only managers can create work stages."); return; }
    if (submitting) return;

    const errs = {};
    if (!selectedContract) errs.contract = "Please select a contract.";
    if (!title.trim()) errs.title = "Stage title is required.";
    if (!description.trim()) errs.description = "Stage description is required.";
    const amountNum = Number(amount);
    if (!amount || amountNum <= 0) errs.amount = "Enter a valid amount greater than 0.";

    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError("Please fix the errors below.");
      return;
    }

    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setSuccess("");

    const contractId = selectedContract._id || selectedContract.id;

    try {
      await apiRequest(`/contracts/${contractId}/milestones`, {
        token: accessToken,
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim(),
          amount: amountNum,
          dueDate: dueDate || undefined,
        },
      });

      setSuccess("Work stage created successfully.");
      // Navigate to the contract so the manager can see the new stage
      navigation.navigate("ContractDetails", { contractId });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to create work stage.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Not a manager ──────────────────────────────────────────────────────────

  if (!isManager) {
    return (
      <ScreenShell title="Create Work Stage" showBack onBackPress={() => navigation.goBack()}>
        <View style={styles.stateCard}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.muted} />
          <Text style={styles.stateTitle}>Managers only</Text>
          <Text style={styles.stateText}>
            Only managers can create work stages. Contact your manager if you need a new stage added.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Create Work Stage"
      subtitle="Add a milestone to one of your existing contracts."
      showBack
      onBackPress={() => navigation.goBack()}
    >
      <ContractPickerModal
        visible={showPicker}
        contracts={contracts}
        loading={contractsLoading}
        onSelect={(c) => { setSelectedContract(c); setFieldErrors((p) => ({ ...p, contract: undefined })); }}
        onClose={() => setShowPicker(false)}
      />

      {/* Contract selector */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Contract</Text>
        <View style={styles.divider} />

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Select contract <Text style={{ color: colors.danger }}>*</Text></Text>
          <TouchableOpacity
            style={[styles.selector, fieldErrors.contract && styles.selectorError]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.7}
          >
            {selectedContract ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.selectorValue} numberOfLines={1}>{selectedContract.title}</Text>
                <Text style={styles.selectorMeta}>
                  {selectedContract.jobCategory || "—"} · {formatMoney(selectedContract.amount, selectedContract.currency || "KSH")}
                </Text>
              </View>
            ) : (
              <Text style={styles.selectorPlaceholder}>Choose a contract…</Text>
            )}
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </TouchableOpacity>
          {fieldErrors.contract ? <Text style={styles.fieldError}>{fieldErrors.contract}</Text> : null}
        </View>
      </View>

      {/* Stage details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Stage Details</Text>
        <View style={styles.divider} />

        {/* Title */}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Title <Text style={{ color: colors.danger }}>*</Text></Text>
          <TextInput
            style={[styles.input, fieldErrors.title && styles.inputError]}
            value={title}
            onChangeText={(v) => { setTitle(v); setFieldErrors((p) => ({ ...p, title: undefined })); setError(""); }}
            placeholder="e.g. Foundation Work, Design Review…"
            placeholderTextColor="#94A3B8"
          />
          {fieldErrors.title ? <Text style={styles.fieldError}>{fieldErrors.title}</Text> : null}
        </View>

        {/* Description */}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Description <Text style={{ color: colors.danger }}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea, fieldErrors.description && styles.inputError]}
            value={description}
            onChangeText={(v) => { setDescription(v); setFieldErrors((p) => ({ ...p, description: undefined })); setError(""); }}
            placeholder="Describe what needs to be done in this stage…"
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
          />
          {fieldErrors.description ? <Text style={styles.fieldError}>{fieldErrors.description}</Text> : null}
        </View>

        {/* Amount */}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>
            Payment amount ({selectedContract?.currency || "KSH"}) <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, fieldErrors.amount && styles.inputError]}
            value={amount}
            onChangeText={(v) => { setAmount(normalizeAmount(v)); setFieldErrors((p) => ({ ...p, amount: undefined })); setError(""); }}
            placeholder="e.g. 5000"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
          {fieldErrors.amount ? <Text style={styles.fieldError}>{fieldErrors.amount}</Text> : null}
        </View>

        {/* Due date */}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Due date (optional)</Text>
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={(v) => setDueDate(v.replace(/[^\d-]/g, "").slice(0, 10))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
      </View>

      {/* Error banner */}
      {error ? (
        <View style={styles.bannerError}>
          <Ionicons name="warning-outline" size={15} color={colors.danger} />
          <Text style={styles.bannerErrorText}>{error}</Text>
        </View>
      ) : null}

      {success ? (
        <View style={styles.bannerSuccess}>
          <Ionicons name="checkmark-circle-outline" size={15} color={colors.success} />
          <Text style={styles.bannerSuccessText}>{success}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Create Work Stage</Text>
            </>
          )}
      </TouchableOpacity>
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2.5), alignItems: "flex-start", gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },

  sectionCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  divider: { height: 1, backgroundColor: colors.border },

  fieldLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "700" },

  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15,
  },
  inputError: { borderColor: colors.danger },
  textArea: { minHeight: 88 },

  selector: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  selectorError: { borderColor: colors.danger },
  selectorValue: { fontSize: 15, color: colors.text, fontWeight: "600", flex: 1 },
  selectorMeta:  { fontSize: 12, color: colors.muted, marginTop: 2 },
  selectorPlaceholder: { fontSize: 15, color: "#94A3B8", flex: 1 },

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

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 16,
    paddingVertical: 16, marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  // Modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "75%", paddingHorizontal: spacing(2), paddingTop: spacing(1),
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: spacing(1),
  },
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingBottom: spacing(1.5), borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: spacing(1),
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  pickerSearch: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontSize: 14, backgroundColor: "#fff", marginBottom: spacing(1),
  },
  pickerEmpty: { color: colors.muted, textAlign: "center", padding: 20 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: spacing(1.5), paddingHorizontal: spacing(1),
    borderRadius: 12,
  },
  pickerRowTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickerRowMeta:  { fontSize: 13, color: colors.muted },
  pickerStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pickerStatusText: { fontSize: 11, fontWeight: "800" },
});
