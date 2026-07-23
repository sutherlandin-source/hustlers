import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function verColor(status) {
  if (lower(status) === "verified")  return colors.success;
  if (lower(status) === "rejected")  return colors.danger;
  return colors.warning;
}

function acColor(user) {
  if (!user?.isActive || lower(user?.accountStatus) === "suspended")   return colors.danger;
  if (lower(user?.accountStatus) === "deactivated")                     return colors.muted;
  return colors.success;
}

function acLabel(user) {
  if (lower(user?.accountStatus) === "suspended")   return "Suspended";
  if (lower(user?.accountStatus) === "deactivated") return "Deactivated";
  return user?.isActive ? "Active" : "Inactive";
}

function skillsArray(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  return String(val || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function InfoRow({ label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]}>{value}</Text>
    </View>
  );
}

function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function ActionButton({ label, icon, onPress, variant = "default", disabled = false }) {
  return (
    <Pressable
      style={[
        styles.actionBtn,
        variant === "success" && styles.actionBtnSuccess,
        variant === "danger"  && styles.actionBtnDanger,
        variant === "warning" && styles.actionBtnWarning,
        variant === "outline" && styles.actionBtnOutline,
        disabled && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Ionicons
        name={icon}
        size={16}
        color={
          variant === "outline" ? colors.text :
          variant === "danger"  ? "#fff" :
          variant === "success" ? "#fff" :
          variant === "warning" ? "#fff" : "#fff"
        }
      />
      <Text style={[
        styles.actionBtnText,
        variant === "outline" && styles.actionBtnTextOutline,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminUserDetailScreen({ route, navigation }) {
  const { userId } = route?.params || {};
  const { accessToken } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [data, setData]             = useState(null); // { user, summary }

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Suspension form
  const [showSuspendForm, setShowSuspendForm]   = useState(false);
  const [suspendReason, setSuspendReason]       = useState("");
  const [suspendDays, setSuspendDays]           = useState("");

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!userId || !accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const payload = await apiRequest(`/users/admin/${userId}`, { token: accessToken });
        const d = payload?.data || payload;
        setData({ user: d?.user, summary: d?.summary });
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load user.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, accessToken]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Admin actions ─────────────────────────────────────────────────────────

  const doAction = async (endpoint, body = {}) => {
    setActionLoading(true);
    setActionError("");
    setActionSuccess("");
    try {
      await apiRequest(endpoint, { token: accessToken, method: "PATCH", body });
      await load({ isRefresh: true });
      return true;
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || "Action failed.");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify = () =>
    doAction(`/users/admin/${userId}/verify`).then((ok) => ok && setActionSuccess("User verified successfully."));

  const handleRejectVerification = () =>
    doAction(`/users/admin/${userId}/reject-verification`).then((ok) => ok && setActionSuccess("Verification rejected."));

  const handleRequestMoreInfo = () =>
    doAction(`/users/admin/${userId}/request-more-info`).then((ok) => ok && setActionSuccess("More info requested."));

  const handleSuspend = async () => {
    if (!suspendReason.trim()) { setActionError("Suspension reason is required."); return; }
    const body = { reason: suspendReason.trim() };
    if (suspendDays.trim()) body.durationDays = Number(suspendDays);
    const ok = await doAction(`/users/admin/${userId}/suspend`, body);
    if (ok) {
      setActionSuccess("User suspended.");
      setShowSuspendForm(false);
      setSuspendReason("");
      setSuspendDays("");
    }
  };

  const handleDeactivate = () =>
    doAction(`/users/admin/${userId}/deactivate`).then((ok) => ok && setActionSuccess("User deactivated."));

  // ── Render ────────────────────────────────────────────────────────────────

  const user    = data?.user;
  const summary = data?.summary;
  const verStatus = user?.verificationStatus || (user?.isEmailVerified ? "verified" : "pending");
  const isSuspended   = lower(user?.accountStatus) === "suspended"   || !user?.isActive;
  const isDeactivated = lower(user?.accountStatus) === "deactivated";
  const isVerified    = lower(verStatus) === "verified";

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle} numberOfLines={1}>
          {user ? (getDisplayName(user) || "User Detail") : "User Detail"}
        </Text>
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
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading user profile…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="warning-outline" size={24} color={colors.danger} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : user ? (
          <>
            {/* Identity card */}
            <View style={styles.identityCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {[user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                </Text>
              </View>
              <View style={styles.identityInfo}>
                <Text style={styles.identityName}>
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                </Text>
                <Text style={styles.identityEmail}>{user.email}</Text>
                <View style={styles.badgeRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{formatStatusLabel(user.role)}</Text>
                  </View>
                  <View style={[styles.verBadge, { borderColor: verColor(verStatus) }]}>
                    <Ionicons name={isVerified ? "shield-checkmark-outline" : "time-outline"} size={11} color={verColor(verStatus)} />
                    <Text style={[styles.verBadgeText, { color: verColor(verStatus) }]}>
                      {formatStatusLabel(verStatus)}
                    </Text>
                  </View>
                  <View style={[styles.acBadge, { borderColor: acColor(user) }]}>
                    <View style={[styles.acDot, { backgroundColor: acColor(user) }]} />
                    <Text style={[styles.acBadgeText, { color: acColor(user) }]}>{acLabel(user)}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Action feedback */}
            {actionSuccess ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={styles.successText}>{actionSuccess}</Text>
              </View>
            ) : null}
            {actionError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{actionError}</Text>
              </View>
            ) : null}

            {/* Admin actions */}
            <View style={styles.card}>
              <SectionTitle label="Admin Actions" />

              {/* Verification actions */}
              <View style={styles.actionGroup}>
                <Text style={styles.actionGroupLabel}>Verification</Text>
                <View style={styles.actionRow}>
                  {!isVerified ? (
                    <ActionButton
                      label="Verify"
                      icon="shield-checkmark-outline"
                      variant="success"
                      onPress={handleVerify}
                      disabled={actionLoading}
                    />
                  ) : null}
                  {isVerified ? (
                    <ActionButton
                      label="Reject Verification"
                      icon="close-circle-outline"
                      variant="warning"
                      onPress={handleRejectVerification}
                      disabled={actionLoading}
                    />
                  ) : null}
                  <ActionButton
                    label="Request More Info"
                    icon="information-circle-outline"
                    variant="outline"
                    onPress={handleRequestMoreInfo}
                    disabled={actionLoading}
                  />
                </View>
              </View>

              {/* Account actions */}
              <View style={styles.actionGroup}>
                <Text style={styles.actionGroupLabel}>Account status</Text>
                <View style={styles.actionRow}>
                  {!isSuspended && !isDeactivated ? (
                    <ActionButton
                      label="Suspend"
                      icon="ban-outline"
                      variant="danger"
                      onPress={() => setShowSuspendForm((v) => !v)}
                      disabled={actionLoading}
                    />
                  ) : null}
                  {!isDeactivated ? (
                    <ActionButton
                      label="Deactivate"
                      icon="trash-outline"
                      variant="danger"
                      onPress={handleDeactivate}
                      disabled={actionLoading}
                    />
                  ) : null}
                  {actionLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
              </View>

              {/* Suspend form */}
              {showSuspendForm ? (
                <View style={styles.suspendForm}>
                  <Text style={styles.fieldLabel}>Suspension reason <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={suspendReason}
                    onChangeText={setSuspendReason}
                    placeholder="Reason for suspension"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                  <Text style={styles.fieldLabel}>Duration (days) <Text style={styles.optional}>– optional</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={suspendDays}
                    onChangeText={setSuspendDays}
                    placeholder="Leave blank for indefinite"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                  />
                  <View style={styles.actionRow}>
                    <ActionButton label="Confirm Suspend" icon="ban-outline" variant="danger" onPress={handleSuspend} disabled={actionLoading || !suspendReason.trim()} />
                    <ActionButton label="Cancel" icon="close-outline" variant="outline" onPress={() => setShowSuspendForm(false)} />
                  </View>
                </View>
              ) : null}
            </View>

            {/* Contact & KYC */}
            <View style={styles.card}>
              <SectionTitle label="Contact & Identity" />
              <InfoRow label="Phone"    value={user.phoneNumber} />
              <InfoRow label="Location" value={user.location} />
              <InfoRow label="ID Number" value={user.idNumber ? `••••${String(user.idNumber).slice(-3)}` : null} />
              <InfoRow label="M-Pesa"   value={user.mpesaNumber} />
              <InfoRow label="Joined"   value={formatDate(user.createdAt)} />
              <InfoRow label="Email verified" value={user.isEmailVerified ? "Yes" : "No"} />
            </View>

            {/* Role-specific profile */}
            {lower(user.role) === "hustler" ? (
              <View style={styles.card}>
                <SectionTitle label="Hustler Profile" />
                <InfoRow label="Experience" value={formatStatusLabel(user.experienceLevel)} />
                {user.bio ? (
                  <View style={styles.bioBlock}>
                    <Text style={styles.bioLabel}>Bio</Text>
                    <Text style={styles.bioText}>{user.bio}</Text>
                  </View>
                ) : null}
                {skillsArray(user.skills).length > 0 ? (
                  <>
                    <Text style={styles.infoLabel}>Skills</Text>
                    <View style={styles.skillsRow}>
                      {skillsArray(user.skills).map((s) => (
                        <View key={s} style={styles.skillTag}>
                          <Text style={styles.skillTagText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {lower(user.role) === "manager" ? (
              <View style={styles.card}>
                <SectionTitle label="Company" />
                <InfoRow label="Company"  value={user.companyName} />
                <InfoRow label="Industry" value={user.industry} />
              </View>
            ) : null}

            {/* Contract summary */}
            {summary?.contracts ? (
              <View style={styles.card}>
                <SectionTitle label="Contract Activity" />
                <View style={styles.statsRow}>
                  <View style={styles.miniStat}>
                    <Text style={styles.miniStatVal}>{summary.contracts.total ?? 0}</Text>
                    <Text style={styles.miniStatLabel}>Total</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Text style={styles.miniStatVal}>{summary.contracts.active ?? 0}</Text>
                    <Text style={styles.miniStatLabel}>Active</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Text style={[styles.miniStatVal, { color: colors.success }]}>{summary.contracts.completed ?? 0}</Text>
                    <Text style={styles.miniStatLabel}>Completed</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Text style={[styles.miniStatVal, { color: summary.contracts.disputed > 0 ? colors.danger : colors.text }]}>{summary.contracts.disputed ?? 0}</Text>
                    <Text style={styles.miniStatLabel}>Disputed</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Ratings */}
            {user.averageRating > 0 ? (
              <View style={styles.card}>
                <SectionTitle label="Ratings & Reviews" />
                <InfoRow label="Average rating" value={`${Number(user.averageRating).toFixed(1)} ★`} />
                <InfoRow label="Total reviews"  value={String(user.totalReviews || 0)} />
              </View>
            ) : null}

            {/* Recent reviews */}
            {Array.isArray(summary?.reviews?.recent) && summary.reviews.recent.length > 0 ? (
              <View style={styles.card}>
                <SectionTitle label="Recent Reviews" />
                {summary.reviews.recent.slice(0, 3).map((rv, i) => (
                  <View key={i} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewRating}>{"★".repeat(rv.rating || 0)} {rv.rating}/5</Text>
                      <Text style={styles.reviewDate}>{formatDate(rv.createdAt)}</Text>
                    </View>
                    {rv.comment ? <Text style={styles.reviewComment}>{rv.comment}</Text> : null}
                  </View>
                ))}
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
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing(2), paddingVertical: spacing(1.25), gap: 10,
  },
  navTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.text },

  content: {
    paddingHorizontal: spacing(2), paddingTop: spacing(2),
    paddingBottom: spacing(5), gap: spacing(1.5),
  },

  stateCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(2.5), alignItems: "flex-start", gap: 10,
  },
  stateText: { color: colors.muted, fontSize: 14 },
  retryBtn:  { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  identityCard: {
    backgroundColor: colors.surface, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(2), flexDirection: "row",
    alignItems: "center", gap: 14,
  },
  avatarCircle: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  avatarInitials: { color: "#fff", fontWeight: "800", fontSize: 20, letterSpacing: 1 },
  identityInfo: { flex: 1, gap: 5 },
  identityName:  { color: colors.text,  fontWeight: "800", fontSize: 17 },
  identityEmail: { color: colors.muted, fontSize: 13 },
  badgeRow:      { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  roleBadge:     { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  verBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  verBadgeText: { fontSize: 10, fontWeight: "700" },
  acBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  acDot:     { width: 6, height: 6, borderRadius: 3 },
  acBadgeText: { fontSize: 10, fontWeight: "700" },

  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0",
    borderRadius: 12, padding: 12,
  },
  successText: { flex: 1, color: colors.success, fontWeight: "700", fontSize: 13 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, padding: 12,
  },
  errorText: { flex: 1, color: colors.danger, fontWeight: "700", fontSize: 13 },

  card: {
    backgroundColor: colors.surface, borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing(1.75), gap: spacing(1),
  },
  sectionTitle: {
    color: colors.muted, fontWeight: "800", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 0.5,
  },

  actionGroup:      { gap: 6 },
  actionGroupLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  actionRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, flexShrink: 0,
  },
  actionBtnSuccess: { backgroundColor: colors.success },
  actionBtnDanger:  { backgroundColor: colors.danger  },
  actionBtnWarning: { backgroundColor: colors.warning  },
  actionBtnOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  actionBtnDisabled:    { opacity: 0.45 },
  actionBtnText:        { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnTextOutline: { color: colors.text },

  suspendForm: {
    backgroundColor: colors.background, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, gap: 10,
  },
  fieldLabel:  { color: colors.text, fontWeight: "700", fontSize: 13 },
  required:    { color: colors.danger },
  optional:    { color: colors.muted, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.text,
  },

  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    gap: 12, paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: colors.background,
  },
  infoLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", flexShrink: 0 },
  infoValue: { color: colors.text,  fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  infoMono:  { fontFamily: "monospace" },

  bioBlock: { gap: 4 },
  bioLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  bioText:  { color: colors.text,  fontSize: 13, lineHeight: 21 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillTag: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  skillTagText: { color: colors.text, fontSize: 11, fontWeight: "700" },

  statsRow:    { flexDirection: "row", gap: 8 },
  miniStat:    { flex: 1, alignItems: "center", gap: 3 },
  miniStatVal:   { color: colors.text,  fontWeight: "800", fontSize: 20 },
  miniStatLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  reviewCard: {
    backgroundColor: colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, gap: 6,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewRating: { color: colors.warning, fontWeight: "800", fontSize: 13 },
  reviewDate:   { color: colors.muted,   fontSize: 11 },
  reviewComment:{ color: colors.text,    fontSize: 13, lineHeight: 20 },
});
