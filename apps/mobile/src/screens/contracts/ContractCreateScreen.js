/**
 * ContractCreateScreen
 * Full manager contract creation flow — mobile implementation.
 *
 * Feature parity with apps/web ContractCreatePage:
 *  - Category picker modal
 *  - Date picker modal (no free-text YYYY-MM-DD)
 *  - Workers stepper (1-10)
 *  - Currency picker modal
 *  - Per-worker payment breakdown in preview
 *  - Stage total vs. budget match indicator
 *  - Single-payment Job Completion milestone fallback
 *  - Graceful backend error handling
 *  - Navigates to ContractDetails on success; Contracts list
 *    refreshes automatically via useFocusEffect.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { useAuth } from "../../context/AuthContext.js";
import { apiRequest } from "../../services/api.js";
import { colors, spacing } from "../../theme.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_CATEGORIES = [
  "Cleaning",
  "Moving & Lifting",
  "Delivery & Errands",
  "Construction Helper",
  "Farm Work",
  "Shop Assistance",
  "Event Support",
  "Household Work",
  "General Labor",
  "Other",
];

const PAYMENT_RATE_TYPES = [
  { label: "Fixed Price", value: "fixed" },
  { label: "Per Day", value: "daily" },
  { label: "Per Hour", value: "hourly" },
];

const CONTRACT_TYPES = [
  {
    label: "Single Payment",
    value: "single",
    hint: "Pay the full amount once all work is approved.",
  },
  {
    label: "Work Stages",
    value: "stages",
    hint: "Split into milestones. Release each stage after approval.",
  },
];

const CURRENCIES = ["KSH", "KES", "USD", "EUR", "GBP"];

const COMMISSION_RATE = 0.025;
const COMMISSION_LABEL = "2.5%";
const MIN_WORKERS = 1;
const MAX_WORKERS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAmountInput(value) {
  return String(value || "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
}

function formatMoney(amount, currency = "KSH") {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
}

function createEmptyStage() {
  return { title: "", description: "", amount: "" };
}

/** Pad a number to 2 digits */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Build a YYYY-MM-DD string from a Date object */
function toISODateString(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parse a YYYY-MM-DD string safely, returning null on failure */
function parseISODate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/** Month names for the date picker */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── PickerModal ──────────────────────────────────────────────────────────────
// Generic scrollable single-select list modal

function PickerModal({ visible, title, options, value, onSelect, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={pickerStyles.backdrop} onPress={onClose} />
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <FlatList
          data={options}
          keyExtractor={(item) => String(item.value ?? item)}
          contentContainerStyle={{ paddingBottom: spacing(2) }}
          renderItem={({ item }) => {
            const itemValue = item.value ?? item;
            const itemLabel = item.label ?? item;
            const selected = itemValue === value;
            return (
              <TouchableOpacity
                style={[pickerStyles.option, selected && pickerStyles.optionSelected]}
                onPress={() => { onSelect(itemValue); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[pickerStyles.optionText, selected && pickerStyles.optionTextSelected]}>
                  {itemLabel}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={18} color={colors.accent} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingHorizontal: spacing(2),
    paddingTop: spacing(1),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing(1),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing(1.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing(1),
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(1),
    borderRadius: 12,
  },
  optionSelected: {
    backgroundColor: "#EFF6FF",
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: "800",
  },
});

// ─── DatePickerModal ──────────────────────────────────────────────────────────
// Inline year/month/day column scroller — no third-party dependency

function DatePickerModal({ visible, title, value, minDate, onSelect, onClose }) {
  const today = new Date();
  const parsed = parseISODate(value) || today;

  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth()); // 0-indexed
  const [day, setDay] = useState(parsed.getDate());

  const minYear = (minDate ? minDate.getFullYear() : today.getFullYear());
  const maxYear = minYear + 5;

  // Days in the selected month/year
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, daysInMonth);

  const years = useMemo(() => {
    const arr = [];
    for (let y = minYear; y <= maxYear; y++) arr.push(y);
    return arr;
  }, [minYear, maxYear]);

  const days = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [daysInMonth]);

  const handleConfirm = useCallback(() => {
    const date = new Date(year, month, safeDay);
    onSelect(toISODateString(date));
    onClose();
  }, [year, month, safeDay, onSelect, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={pickerStyles.backdrop} onPress={onClose} />
      <View style={[pickerStyles.sheet, { maxHeight: "55%" }]}>
        <View style={pickerStyles.handle} />
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Column pickers */}
        <View style={dpStyles.columns}>
          {/* Month */}
          <View style={dpStyles.col}>
            <Text style={dpStyles.colLabel}>Month</Text>
            <ScrollView style={dpStyles.scroll} showsVerticalScrollIndicator={false}>
              {MONTHS.map((m, i) => (
                <TouchableOpacity
                  key={m}
                  style={[dpStyles.item, i === month && dpStyles.itemSelected]}
                  onPress={() => setMonth(i)}
                >
                  <Text style={[dpStyles.itemText, i === month && dpStyles.itemTextSelected]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Day */}
          <View style={[dpStyles.col, { maxWidth: 70 }]}>
            <Text style={dpStyles.colLabel}>Day</Text>
            <ScrollView style={dpStyles.scroll} showsVerticalScrollIndicator={false}>
              {days.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[dpStyles.item, d === safeDay && dpStyles.itemSelected]}
                  onPress={() => setDay(d)}
                >
                  <Text style={[dpStyles.itemText, d === safeDay && dpStyles.itemTextSelected]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Year */}
          <View style={[dpStyles.col, { maxWidth: 90 }]}>
            <Text style={dpStyles.colLabel}>Year</Text>
            <ScrollView style={dpStyles.scroll} showsVerticalScrollIndicator={false}>
              {years.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[dpStyles.item, y === year && dpStyles.itemSelected]}
                  onPress={() => setYear(y)}
                >
                  <Text style={[dpStyles.itemText, y === year && dpStyles.itemTextSelected]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <TouchableOpacity style={dpStyles.confirmButton} onPress={handleConfirm}>
          <Text style={dpStyles.confirmButtonText}>Confirm Date</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  columns: {
    flexDirection: "row",
    gap: spacing(1),
    flex: 1,
    marginBottom: spacing(1.5),
  },
  col: {
    flex: 1,
    gap: 4,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingBottom: 4,
    textAlign: "center",
  },
  scroll: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    borderRadius: 10,
  },
  itemSelected: {
    backgroundColor: "#EFF6FF",
  },
  itemText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  itemTextSelected: {
    color: colors.accent,
    fontWeight: "800",
  },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: spacing(2),
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});

// ─── Reusable form primitives ─────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <Text style={primStyles.label}>
      {children}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={primStyles.sectionCard}>
      <View style={{ gap: 4 }}>
        <Text style={primStyles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={primStyles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={primStyles.divider} />
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

function InputField({ label, required, error, ...rest }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TextInput
        style={[primStyles.input, error ? primStyles.inputError : null]}
        placeholderTextColor="#94A3B8"
        {...rest}
      />
      {error ? <Text style={primStyles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function TextAreaField({ label, required, error, ...rest }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TextInput
        style={[primStyles.input, primStyles.textArea, error ? primStyles.inputError : null]}
        placeholderTextColor="#94A3B8"
        multiline
        textAlignVertical="top"
        {...rest}
      />
      {error ? <Text style={primStyles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** A tappable selector row that opens a modal */
function SelectorField({ label, required, placeholder, value, onPress, error }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TouchableOpacity
        style={[primStyles.selector, error ? primStyles.inputError : null]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={value ? primStyles.selectorValue : primStyles.selectorPlaceholder}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </TouchableOpacity>
      {error ? <Text style={primStyles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Horizontal radio chips — 2-3 options max */
function RadioChips({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[primStyles.chip, active && primStyles.chipActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[primStyles.chipText, active && primStyles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** +/- stepper for numeric fields with bounded min/max */
function Stepper({ value, onChange, min = 1, max = 10 }) {
  return (
    <View style={primStyles.stepper}>
      <TouchableOpacity
        style={[primStyles.stepBtn, value <= min && primStyles.stepBtnDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <Ionicons name="remove" size={18} color={value <= min ? colors.border : colors.text} />
      </TouchableOpacity>
      <Text style={primStyles.stepValue}>{value}</Text>
      <TouchableOpacity
        style={[primStyles.stepBtn, value >= max && primStyles.stepBtnDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <Ionicons name="add" size={18} color={value >= max ? colors.border : colors.text} />
      </TouchableOpacity>
    </View>
  );
}

/** Checkbox row */
function CheckRow({ checked, onToggle, title, subtitle }) {
  return (
    <TouchableOpacity
      style={primStyles.checkRow}
      onPress={onToggle}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[primStyles.checkbox, checked && primStyles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={primStyles.checkTitle}>{title}</Text>
        {subtitle ? <Text style={primStyles.checkSubtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const primStyles = StyleSheet.create({
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.75),
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  inputError: {
    borderColor: colors.danger,
  },
  textArea: {
    minHeight: 88,
  },
  fieldError: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: "700",
  },
  selector: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  selectorPlaceholder: {
    fontSize: 15,
    color: "#94A3B8",
    flex: 1,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipTextActive: {
    color: colors.accent,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "flex-start",
    backgroundColor: "#fff",
  },
  stepBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  stepBtnDisabled: {
    backgroundColor: "#F8FAFC",
  },
  stepValue: {
    minWidth: 44,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkTitle: {
    color: colors.text,
    fontWeight: "800",
    lineHeight: 20,
    fontSize: 14,
  },
  checkSubtitle: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: 13,
    marginTop: 3,
  },
});


// ─── ContractCreateScreen ─────────────────────────────────────────────────────

export default function ContractCreateScreen({ navigation, route }) {
  const { accessToken, role } = useAuth();
  const isManager = String(role || "").toLowerCase() === "manager";

  // Edit mode — when a contractId is passed via route params the screen
  // loads the existing contract and submits a PATCH instead of POST.
  const editContractId = route?.params?.contractId || null;
  const isEditMode = Boolean(editContractId);

  // ── Load existing contract data in edit mode ──
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [loadEditError, setLoadEditError] = useState("");

  // ── Modal visibility ──
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker]   = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker]   = useState(false);

  // ── Form state ──
  const [form, setForm] = useState({
    title:           "",
    description:     "",
    jobCategory:     "",
    workLocation:    "",
    contractType:    "single",   // "single" | "stages"
    paymentRateType: "fixed",    // "fixed" | "daily" | "hourly"
    currency:        "KSH",
    amount:          "",
    numWorkers:      1,
    startDate:       "",
    completionDate:  "",
    escrowConfirm:   false,
    termsAccepted:   false,
    stages: [createEmptyStage(), createEmptyStage()],
  });

  // ── UI state ──
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // ── Load existing contract for edit mode ──
  useEffect(() => {
    if (!isEditMode || !editContractId || !accessToken) return;
    let cancelled = false;
    setLoadingEdit(true);
    setLoadEditError("");
    (async () => {
      try {
        const result = await apiRequest(`/contracts/${editContractId}`, { token: accessToken });
        if (cancelled) return;
        const c = result?.contract || result?.data?.contract || result;
        if (!c) throw new Error("Contract not found.");
        const contractType =
          String(c.contractType || c.paymentType || "").toLowerCase() === "staged"
            ? "stages"
            : "single";
        const existingStages =
          contractType === "stages" && Array.isArray(c.milestones) && c.milestones.length
            ? c.milestones.map((m) => ({
                title:       m.title || "",
                description: m.description || "",
                amount:      String(m.amount || ""),
              }))
            : [createEmptyStage(), createEmptyStage()];
        setForm({
          title:           c.title          || "",
          description:     c.description    || "",
          jobCategory:     c.jobCategory    || "",
          workLocation:    c.workLocation   || "",
          contractType,
          paymentRateType: c.paymentRateType || "fixed",
          currency:        c.currency       || "KSH",
          amount:          String(c.amount  || ""),
          numWorkers:      Number(c.numWorkers || 1),
          startDate:       c.startDate      ? toISODateString(new Date(c.startDate))      : "",
          completionDate:  c.completionDate ? toISODateString(new Date(c.completionDate)) : "",
          escrowConfirm:   true,
          termsAccepted:   true,
          stages: existingStages,
        });
      } catch (err) {
        if (!cancelled) {
          setLoadEditError(err?.response?.data?.message || err?.message || "Failed to load contract.");
        }
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, editContractId, accessToken]);

  // ── Derived payment values ──
  const amountValue = toNumber(form.amount);
  const workers     = Math.max(1, form.numWorkers);

  const totalCommission   = Number((amountValue * COMMISSION_RATE).toFixed(2));
  const totalNet          = Number((amountValue - totalCommission).toFixed(2));
  const grossPerWorker    = amountValue / workers;
  const commissionPerWorker = Number((grossPerWorker * COMMISSION_RATE).toFixed(2));
  const netPerWorker      = Number((grossPerWorker - commissionPerWorker).toFixed(2));

  const stagesTotal = useMemo(
    () => form.stages.reduce((sum, s) => sum + toNumber(s.amount), 0),
    [form.stages]
  );
  const stagesTotalMatch =
    form.contractType === "stages" &&
    amountValue > 0 &&
    Math.abs(stagesTotal - amountValue) < 0.01;
  const stagesTotalMismatch =
    form.contractType === "stages" &&
    amountValue > 0 &&
    stagesTotal > 0 &&
    !stagesTotalMatch;

  // ── Field helpers ──
  const set = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setError("");
  }, []);

  const setStage = useCallback((index, field, value) => {
    setForm((prev) => ({
      ...prev,
      stages: prev.stages.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }, []);

  const addStage = useCallback(() => {
    setForm((prev) => ({ ...prev, stages: [...prev.stages, createEmptyStage()] }));
  }, []);

  const removeStage = useCallback((index) => {
    setForm((prev) => ({
      ...prev,
      stages: prev.stages.length > 1 ? prev.stages.filter((_, i) => i !== index) : prev.stages,
    }));
  }, []);

  const handleContractTypeChange = useCallback((type) => {
    setForm((prev) => ({
      ...prev,
      contractType: type,
      stages:
        type === "stages" && prev.stages.length < 2
          ? [createEmptyStage(), createEmptyStage()]
          : prev.stages,
    }));
    setError("");
  }, []);

  // ── Validation ──
  const validate = useCallback(() => {
    const errs = {};

    if (!form.title.trim())       errs.title       = "Contract title is required.";
    if (!form.description.trim()) errs.description = "Description is required.";
    if (!form.jobCategory)        errs.jobCategory = "Please select a category.";
    if (!form.workLocation.trim()) errs.workLocation = "Work location is required.";

    if (!form.amount || amountValue <= 0)
      errs.amount = "Enter a valid contract amount greater than 0.";

    if (!form.startDate)
      errs.startDate = "Start date is required.";

    if (!form.completionDate)
      errs.completionDate = "Deadline is required.";

    if (
      form.startDate &&
      form.completionDate &&
      parseISODate(form.completionDate) < parseISODate(form.startDate)
    ) {
      errs.completionDate = "Deadline must be after the start date.";
    }

    if (!form.escrowConfirm)
      errs.escrowConfirm = "Please confirm the escrow terms.";

    if (!form.termsAccepted)
      errs.termsAccepted = "Please accept the platform terms.";

    if (form.contractType === "stages") {
      form.stages.forEach((stage, i) => {
        if (!stage.title.trim())
          errs[`stage_${i}_title`] = "Stage title is required.";
        if (!stage.description.trim())
          errs[`stage_${i}_description`] = "Stage description is required.";
        if (toNumber(stage.amount) <= 0)
          errs[`stage_${i}_amount`] = "Enter a valid stage amount.";
      });

      if (amountValue > 0 && stagesTotal > 0 && Math.abs(stagesTotal - amountValue) > 0.01) {
        errs.stagesTotal = `Stage totals (${formatMoney(stagesTotal, form.currency)}) must equal the contract amount (${formatMoney(amountValue, form.currency)}).`;
      }
    }

    return errs;
  }, [form, amountValue, stagesTotal]);


  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!isManager) { setError("Only managers can create contracts."); return; }
    if (!accessToken) { setError("You must be signed in."); return; }
    if (submitting) return;

    const errs = validate();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      // Surface first top-level error as banner too
      const first = errs.title || errs.description || errs.jobCategory ||
        errs.workLocation || errs.amount || errs.startDate ||
        errs.completionDate || errs.escrowConfirm || errs.termsAccepted ||
        errs.stagesTotal || "Please fix the errors highlighted below.";
      setError(first);
      return;
    }

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const isStaged = form.contractType === "stages";

      const payload = {
        title:          form.title.trim(),
        description:    form.description.trim(),
        amount:         amountValue,
        currency:       form.currency,
        contractType:   isStaged ? "staged" : "single",
        paymentType:    isStaged ? "staged" : "single",
        paymentRateType: form.paymentRateType,
        numWorkers:     workers,
        jobCategory:    form.jobCategory,
        workLocation:   form.workLocation.trim(),
        startDate:      form.startDate,
        completionDate: form.completionDate,
      };

      if (isStaged) {
        payload.milestones = form.stages.map((s) => ({
          title:       s.title.trim(),
          description: s.description.trim(),
          amount:      toNumber(s.amount),
        }));
      }

      // POST for new contracts, PATCH for edits
      const result = isEditMode
        ? await apiRequest(`/contracts/${editContractId}`, {
            token:  accessToken,
            method: "PATCH",
            body:   payload,
          })
        : await apiRequest("/contracts", {
            token:  accessToken,
            method: "POST",
            body:   payload,
          });

      const contract   = result?.contract || result?.data?.contract || result || null;
      const contractId = (isEditMode ? editContractId : null) || contract?._id || contract?.id;

      // ── Single-payment milestone fallback (mirrors web behaviour) ──
      // Only for new contracts — edits don't touch milestones here.
      if (!isEditMode && !isStaged && contractId) {
        const existing = Array.isArray(contract?.milestones) ? contract.milestones : [];
        if (existing.length === 0) {
          try {
            await apiRequest(`/contracts/${contractId}/milestones`, {
              token:  accessToken,
              method: "POST",
              body: {
                title:       "Job Completion",
                description: "Complete the full job and mark as done.",
                amount:      amountValue,
              },
            });
          } catch {
            // Non-fatal — contract was created, milestone creation is best-effort
          }
        }
      }

      // Navigate to the contract; the Contracts list screen uses
      // useFocusEffect so it will refresh automatically when the user
      // navigates back to it.
      if (contractId) {
        navigation.replace("ContractDetails", { contractId });
      } else {
        navigation.goBack();
      }
    } catch (err) {
      const msg  = err?.response?.data?.message || err?.message || "Failed to create contract.";
      const detail =
        err?.response?.data?.errors && typeof err.response.data.errors === "object"
          ? Object.values(err.response.data.errors).flat().filter(Boolean).join(" · ")
          : "";
      setError([msg, detail].filter(Boolean).join(" — "));
    } finally {
      setSubmitting(false);
    }
  }, [isManager, accessToken, submitting, validate, form, amountValue, workers, navigation]);

  // ── Render ──
  return (
    <ScreenShell
      title={isEditMode ? "Edit Contract" : "Create Contract"}
      subtitle={
        isEditMode
          ? "Update the contract details below."
          : "Set up a new job, configure payment terms, and preview the budget."
      }
      showBack
      onBackPress={() => navigation.goBack()}
    >
      {/* Edit-mode loading */}
      {loadingEdit ? (
        <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.muted, fontWeight: "700" }}>Loading contract…</Text>
        </View>
      ) : loadEditError ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 15 }}>
            Could not load contract
          </Text>
          <Text style={{ color: colors.muted }}>{loadEditError}</Text>
          <Pressable
            style={{ backgroundColor: colors.primary, borderRadius: 14, padding: 14, alignItems: "center" }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <>
      {/* Modals */}
      <PickerModal
        visible={showCategoryPicker}
        title="Select Category"
        options={JOB_CATEGORIES.map((c) => ({ label: c, value: c }))}
        value={form.jobCategory}
        onSelect={(v) => set("jobCategory", v)}
        onClose={() => setShowCategoryPicker(false)}
      />
      <PickerModal
        visible={showCurrencyPicker}
        title="Select Currency"
        options={CURRENCIES.map((c) => ({ label: c, value: c }))}
        value={form.currency}
        onSelect={(v) => set("currency", v)}
        onClose={() => setShowCurrencyPicker(false)}
      />
      <DatePickerModal
        visible={showStartDatePicker}
        title="Select Start Date"
        value={form.startDate}
        onSelect={(v) => set("startDate", v)}
        onClose={() => setShowStartDatePicker(false)}
      />
      <DatePickerModal
        visible={showDeadlinePicker}
        title="Select Deadline"
        value={form.completionDate}
        minDate={parseISODate(form.startDate) || new Date()}
        onSelect={(v) => set("completionDate", v)}
        onClose={() => setShowDeadlinePicker(false)}
      />

      {/* Error banner */}
      {error ? (
        <View style={scStyles.bannerError}>
          <Ionicons name="alert-circle" size={16} color="#991B1B" style={{ marginTop: 2 }} />
          <Text style={scStyles.bannerErrorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── Section 1: Contract type ── */}
      <Section title="Payment Structure" subtitle="Choose how workers will be paid for this job.">
        <View style={{ gap: 10 }}>
          {CONTRACT_TYPES.map((ct) => {
            const active = form.contractType === ct.value;
            return (
              <TouchableOpacity
                key={ct.value}
                style={[scStyles.typeCard, active && scStyles.typeCardActive]}
                onPress={() => handleContractTypeChange(ct.value)}
                activeOpacity={0.8}
              >
                <View style={[scStyles.typeRadio, active && scStyles.typeRadioActive]}>
                  {active ? <View style={scStyles.typeRadioDot} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[scStyles.typeLabel, active && scStyles.typeLabelActive]}>
                    {ct.label}
                  </Text>
                  <Text style={scStyles.typeHint}>{ct.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* ── Section 2: Job Information ── */}
      <Section title="Job Information" subtitle="Describe the work, location, and scheduling.">
        <InputField
          label="Job Title"
          required
          placeholder="e.g. House Cleaning"
          value={form.title}
          onChangeText={(v) => set("title", v)}
          error={fieldErrors.title}
        />

        <TextAreaField
          label="Description"
          required
          placeholder="Describe the work to be done, expectations, and scope…"
          value={form.description}
          onChangeText={(v) => set("description", v)}
          error={fieldErrors.description}
        />

        <SelectorField
          label="Category"
          required
          placeholder="Select a category…"
          value={form.jobCategory}
          onPress={() => setShowCategoryPicker(true)}
          error={fieldErrors.jobCategory}
        />

        <InputField
          label="Work Location"
          required
          placeholder="e.g. Nairobi, Westlands"
          value={form.workLocation}
          onChangeText={(v) => set("workLocation", v)}
          error={fieldErrors.workLocation}
        />

        <View style={scStyles.row}>
          <View style={{ flex: 1 }}>
            <SelectorField
              label="Start Date"
              required
              placeholder="Pick date…"
              value={form.startDate}
              onPress={() => setShowStartDatePicker(true)}
              error={fieldErrors.startDate}
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectorField
              label="Deadline"
              required
              placeholder="Pick date…"
              value={form.completionDate}
              onPress={() => setShowDeadlinePicker(true)}
              error={fieldErrors.completionDate}
            />
          </View>
        </View>
      </Section>

      {/* ── Section 3: Payment Terms ── */}
      <Section
        title="Payment Terms"
        subtitle={`Managers fund the full amount into escrow. The platform takes a ${COMMISSION_LABEL} commission from each hustler's payout after approval.`}
      >
        <View style={scStyles.row}>
          <View style={{ flex: 2 }}>
            <InputField
              label="Total Budget"
              required
              placeholder="e.g. 15000"
              value={form.amount}
              onChangeText={(v) => set("amount", normalizeAmountInput(v))}
              keyboardType="decimal-pad"
              error={fieldErrors.amount}
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectorField
              label="Currency"
              required
              placeholder="KSH"
              value={form.currency}
              onPress={() => setShowCurrencyPicker(true)}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <FieldLabel required>Workers Required</FieldLabel>
          <Stepper
            value={form.numWorkers}
            onChange={(v) => set("numWorkers", v)}
            min={MIN_WORKERS}
            max={MAX_WORKERS}
          />
        </View>

        <View style={{ gap: 6 }}>
          <FieldLabel required>Payment Rate</FieldLabel>
          <RadioChips
            options={PAYMENT_RATE_TYPES}
            value={form.paymentRateType}
            onChange={(v) => set("paymentRateType", v)}
          />
        </View>

        <CheckRow
          checked={form.escrowConfirm}
          onToggle={() => set("escrowConfirm", !form.escrowConfirm)}
          title="I confirm escrow will hold the full contract amount."
          subtitle={`The platform collects ${COMMISSION_LABEL} from each hustler's payout when the job is approved.`}
        />
        {fieldErrors.escrowConfirm ? (
          <Text style={primStyles.fieldError}>{fieldErrors.escrowConfirm}</Text>
        ) : null}

        <CheckRow
          checked={form.termsAccepted}
          onToggle={() => set("termsAccepted", !form.termsAccepted)}
          title="I confirm the contract details are accurate and agree to the platform terms."
        />
        {fieldErrors.termsAccepted ? (
          <Text style={primStyles.fieldError}>{fieldErrors.termsAccepted}</Text>
        ) : null}
      </Section>


      {/* ── Section 4: Work Stages (staged contracts only) ── */}
      {form.contractType === "stages" ? (
        <Section
          title="Work Stages"
          subtitle="Each stage becomes a separate milestone. Workers are paid per stage after approval."
        >
          {/* Stage total vs. budget indicator */}
          {amountValue > 0 ? (
            <View style={[
              scStyles.stageMatchBanner,
              stagesTotalMatch   ? scStyles.stageMatchOk  : null,
              stagesTotalMismatch ? scStyles.stageMatchBad : null,
            ]}>
              <Ionicons
                name={stagesTotalMatch ? "checkmark-circle" : "alert-circle"}
                size={15}
                color={stagesTotalMatch ? colors.success : stagesTotalMismatch ? colors.danger : colors.muted}
              />
              <Text style={[
                scStyles.stageMatchText,
                stagesTotalMatch   ? { color: colors.success } : null,
                stagesTotalMismatch ? { color: colors.danger }  : null,
              ]}>
                {stagesTotalMatch
                  ? `Stage totals match the budget: ${formatMoney(stagesTotal, form.currency)}`
                  : `Stage totals: ${formatMoney(stagesTotal, form.currency)} — budget: ${formatMoney(amountValue, form.currency)}`}
              </Text>
            </View>
          ) : null}
          {fieldErrors.stagesTotal ? (
            <Text style={primStyles.fieldError}>{fieldErrors.stagesTotal}</Text>
          ) : null}

          {form.stages.map((stage, index) => (
            <View key={`stage-${index}`} style={scStyles.stageCard}>
              <View style={scStyles.stageHeader}>
                <Text style={scStyles.stageLabel}>Stage {index + 1}</Text>
                {form.stages.length > 1 ? (
                  <TouchableOpacity onPress={() => removeStage(index)} hitSlop={8}>
                    <Text style={scStyles.removeText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <InputField
                label="Title"
                required
                placeholder="e.g. Walls and Floors"
                value={stage.title}
                onChangeText={(v) => setStage(index, "title", v)}
                error={fieldErrors[`stage_${index}_title`]}
              />
              <TextAreaField
                label="Description"
                required
                placeholder="Describe what will be done in this stage…"
                value={stage.description}
                onChangeText={(v) => setStage(index, "description", v)}
                error={fieldErrors[`stage_${index}_description`]}
              />
              <InputField
                label="Stage Amount"
                required
                placeholder="e.g. 5000"
                value={stage.amount}
                onChangeText={(v) => setStage(index, "amount", normalizeAmountInput(v))}
                keyboardType="decimal-pad"
                error={fieldErrors[`stage_${index}_amount`]}
              />
            </View>
          ))}

          <TouchableOpacity style={scStyles.addStageBtn} onPress={addStage} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={scStyles.addStageBtnText}>Add Stage</Text>
          </TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Section 5: Payment Preview ── */}
      <Section
        title="Payment Preview"
        subtitle="Updates automatically as you edit the budget and worker count."
      >
        <View style={scStyles.previewGrid}>
          <PreviewCell
            label="Contract amount"
            value={amountValue > 0 ? formatMoney(amountValue, form.currency) : "—"}
            sub="Total funded into escrow"
          />
          <PreviewCell
            label="Platform commission"
            value={amountValue > 0 ? formatMoney(totalCommission, form.currency) : "—"}
            sub={`${COMMISSION_LABEL} deducted at payout`}
          />
          <PreviewCell
            label={`Net per worker${workers > 1 ? ` (÷${workers})` : ""}`}
            value={amountValue > 0 ? formatMoney(netPerWorker, form.currency) : "—"}
            sub="Released after manager approval"
            highlight
          />
          {workers > 1 ? (
            <PreviewCell
              label="Total net to all workers"
              value={amountValue > 0 ? formatMoney(totalNet, form.currency) : "—"}
              sub={`Across ${workers} workers`}
            />
          ) : null}
          {form.contractType === "stages" && stagesTotal > 0 ? (
            <PreviewCell
              label="Stage totals"
              value={formatMoney(stagesTotal, form.currency)}
              sub={stagesTotalMatch ? "✓ Matches budget" : "⚠ Does not match budget"}
              accent={stagesTotalMatch ? colors.success : stagesTotalMismatch ? colors.danger : undefined}
            />
          ) : null}
        </View>
      </Section>

      {/* ── Submit ── */}
      <TouchableOpacity
        style={[scStyles.submitBtn, submitting && scStyles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={scStyles.submitBtnText}>
              {isEditMode ? "Save Changes" : "Create Contract"}
            </Text>
          </>
        )}
      </TouchableOpacity>
      </>)}
    </ScreenShell>
  );
}

// ─── PreviewCell ──────────────────────────────────────────────────────────────

function PreviewCell({ label, value, sub, highlight, accent }) {
  return (
    <View style={[scStyles.previewCell, highlight && scStyles.previewCellHighlight]}>
      <Text style={scStyles.previewCellLabel}>{label}</Text>
      <Text style={[scStyles.previewCellValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={scStyles.previewCellSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Screen-level styles ──────────────────────────────────────────────────────

const scStyles = StyleSheet.create({
  bannerError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    padding: 12,
  },
  bannerErrorText: {
    color: "#991B1B",
    fontWeight: "700",
    lineHeight: 20,
    flex: 1,
  },

  // Contract type cards
  typeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#fff",
  },
  typeCardActive: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  typeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  typeRadioActive: {
    borderColor: colors.accent,
  },
  typeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  typeLabelActive: {
    color: colors.accent,
  },
  typeHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 3,
  },

  // Layout helpers
  row: {
    flexDirection: "row",
    gap: 10,
  },

  // Stage section
  stageMatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
  },
  stageMatchOk: {
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
  },
  stageMatchBad: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  stageMatchText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    flex: 1,
  },
  stageCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  stageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stageLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  removeText: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 12,
  },
  addStageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    paddingVertical: 13,
  },
  addStageBtnText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 14,
  },

  // Payment preview grid
  previewGrid: {
    gap: 10,
  },
  previewCell: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 3,
  },
  previewCellHighlight: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  previewCellLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  previewCellValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  previewCellSub: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },

  // Submit button
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
});
