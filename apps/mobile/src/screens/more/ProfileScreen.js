import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { formatDate } from "../../utils/format.js";
import { formatStatusLabel } from "../../utils/status.js";
import BackButton from "../../components/BackButton.js";

// Gracefully handle expo-image-picker being absent (not yet installed)
let ImagePicker = null;
try {
  // eslint-disable-next-line import/no-unresolved
  ImagePicker = require("expo-image-picker");
} catch {
  // expo-image-picker not installed; photo upload will show an informational message
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function skillsToArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function skillsToString(arr) {
  return Array.isArray(arr) ? arr.join(", ") : String(arr || "");
}

function verificationColor(status) {
  if (lower(status) === "verified") return colors.success;
  if (lower(status) === "rejected") return colors.danger;
  return colors.warning;
}

function verificationIcon(status) {
  if (lower(status) === "verified") return "shield-checkmark-outline";
  if (lower(status) === "rejected") return "close-circle-outline";
  return "time-outline";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function InfoRow({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = "default", hint }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={!multiline}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function SkillTag({ skill, onRemove }) {
  return (
    <View style={styles.skillTag}>
      <Text style={styles.skillTagText}>{skill}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={`Remove ${skill}`}>
          <Ionicons name="close" size={12} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen({ route, navigation }) {
  const { user, role, accessToken, setUser } = useAuth();

  // Support viewing another user's profile (read-only) when passed via route.params
  const externalProfile = route?.params?.profile || null;
  const isOwnProfile = !externalProfile;
  const profile = externalProfile || user || {};
  const profileRole = lower(profile?.role || role || "");
  const isHustler = profileRole === "hustler";
  const isManager = profileRole === "manager";

  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Photo upload state
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError]         = useState("");
  const [photoSuccess, setPhotoSuccess]     = useState("");

  // Edit form state — mirrors all editable fields from PUT /users/me
  const [form, setForm] = useState({
    email:           profile?.email          || "",
    phoneNumber:     profile?.phoneNumber    || "",
    location:        profile?.location       || "",
    bio:             profile?.bio            || "",
    idNumber:        profile?.idNumber       || "",
    mpesaNumber:     profile?.mpesaNumber    || "",
    // Hustler fields
    skillsInput:     skillsToString(profile?.skills) || "",
    experienceLevel: profile?.experienceLevel || "",
    // Manager fields
    companyName:     profile?.companyName    || "",
    industry:        profile?.industry       || "",
  });

  // Reset form if user object changes (e.g. after save)
  useEffect(() => {
    if (!editing) {
      setForm({
        email:           user?.email          || "",
        phoneNumber:     user?.phoneNumber    || "",
        location:        user?.location       || "",
        bio:             user?.bio            || "",
        idNumber:        user?.idNumber       || "",
        mpesaNumber:     user?.mpesaNumber    || "",
        skillsInput:     skillsToString(user?.skills) || "",
        experienceLevel: user?.experienceLevel || "",
        companyName:     user?.companyName    || "",
        industry:        user?.industry       || "",
      });
    }
  }, [user, editing]);

  const set = useCallback((key) => (val) => setForm((prev) => ({ ...prev, [key]: val })), []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const body = {
        email:           form.email.trim()           || undefined,
        phoneNumber:     form.phoneNumber.trim()     || undefined,
        location:        form.location.trim()        || undefined,
        bio:             form.bio.trim()             || undefined,
        idNumber:        form.idNumber.trim()        || undefined,
        mpesaNumber:     form.mpesaNumber.trim()     || undefined,
      };

      if (isHustler) {
        body.skills         = skillsToArray(form.skillsInput);
        body.experienceLevel = form.experienceLevel.trim() || undefined;
      }
      if (isManager) {
        body.companyName = form.companyName.trim() || undefined;
        body.industry    = form.industry.trim()    || undefined;
      }

      // Remove undefined keys
      Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

      const payload = await apiRequest("/users/me", {
        token:  accessToken,
        method: "PUT",
        body,
      });

      const updated = payload?.user || payload?.data?.user || null;
      if (updated && setUser) setUser(updated);

      setSaveSuccess("Profile updated successfully.");
      setEditing(false);
    } catch (err) {
      setSaveError(err?.response?.data?.message || err?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError("");
    setSaveSuccess("");
  };

  // ── Photo upload ──────────────────────────────────────────────────────────

  const handlePhotoUpload = async () => {
    if (!isOwnProfile || !accessToken) return;
    setPhotoError("");
    setPhotoSuccess("");

    if (!ImagePicker) {
      setPhotoError("Photo upload requires expo-image-picker. Run: npx expo install expo-image-picker");
      return;
    }

    // Request media library permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setPhotoError("Permission to access your photo library is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions
        ? ImagePicker.MediaTypeOptions.Images
        : ["images"],
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.7,
      base64:        true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setPhotoError("Could not read image data. Please try a different photo.");
      return;
    }

    // Build data URI — mirrors web's canvas approach
    const mimeType = asset.mimeType || "image/jpeg";
    const dataUri  = `data:${mimeType};base64,${asset.base64}`;

    setPhotoUploading(true);
    try {
      const payload = await apiRequest("/users/me", {
        token:  accessToken,
        method: "PUT",
        body:   { avatar: dataUri },
      });
      const updated = payload?.user || payload?.data?.user || null;
      if (updated && setUser) setUser(updated);
      setPhotoSuccess("Profile photo updated.");
    } catch (err) {
      setPhotoError(err?.response?.data?.message || err?.message || "Failed to upload photo.");
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── View mode ─────────────────────────────────────────────────────────────

  const renderViewMode = () => {
    const p = isOwnProfile ? (user || {}) : profile;
    const skills = skillsToArray(p?.skills);
    const verStatus = p?.verificationStatus || (p?.isEmailVerified ? "verified" : "pending");

    return (
      <>
        {/* Identity card */}
        <View style={styles.identityCard}>
          {/* Avatar — tappable for own profile to trigger photo upload */}
          <Pressable
            style={styles.avatarCircle}
            onPress={isOwnProfile ? handlePhotoUpload : undefined}
            disabled={!isOwnProfile || photoUploading}
            accessibilityLabel={isOwnProfile ? "Change profile photo" : undefined}
          >
            {p?.avatar ? (
              <Image source={{ uri: p.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>
                {String(p?.firstName || p?.name || "?")[0].toUpperCase()}
                {p?.lastName ? String(p.lastName)[0].toUpperCase() : ""}
              </Text>
            )}
            {isOwnProfile && !photoUploading ? (
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera-outline" size={16} color="#fff" />
              </View>
            ) : null}
            {isOwnProfile && photoUploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : null}
          </Pressable>

          <View style={styles.identityText}>
            <Text style={styles.identityName}>
              {[p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.name || "—"}
            </Text>
            <Text style={styles.identityEmail}>{p?.email || "—"}</Text>
            {isOwnProfile && (photoError || photoSuccess) ? (
              <Text style={[styles.photoFeedback, photoError ? styles.photoFeedbackError : styles.photoFeedbackSuccess]}>
                {photoError || photoSuccess}
              </Text>
            ) : null}
            <View style={styles.roleBadgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{formatStatusLabel(p?.role || role)}</Text>
              </View>
              <View style={[styles.verBadge, { borderColor: verificationColor(verStatus) }]}>
                <Ionicons name={verificationIcon(verStatus)} size={12} color={verificationColor(verStatus)} />
                <Text style={[styles.verBadgeText, { color: verificationColor(verStatus) }]}>
                  {formatStatusLabel(verStatus)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Contact & KYC */}
        <View style={styles.card}>
          <SectionTitle label="Contact & Identity" />
          <InfoRow label="Phone"    value={p?.phoneNumber} />
          <InfoRow label="Location" value={p?.location} />
          <InfoRow label="ID Number" value={p?.idNumber ? `••••${String(p.idNumber).slice(-3)}` : null} />
          <InfoRow label="M-Pesa"   value={p?.mpesaNumber} />
          {!p?.phoneNumber && !p?.location && !p?.idNumber && !p?.mpesaNumber ? (
            <Text style={styles.emptyNote}>No contact or KYC info added yet.</Text>
          ) : null}
        </View>

        {/* Bio */}
        {p?.bio ? (
          <View style={styles.card}>
            <SectionTitle label="Bio" />
            <Text style={styles.bioText}>{p.bio}</Text>
          </View>
        ) : null}

        {/* Hustler-specific */}
        {isHustler ? (
          <View style={styles.card}>
            <SectionTitle label="Work Profile" />
            <InfoRow label="Experience" value={formatStatusLabel(p?.experienceLevel)} />
            {skills.length > 0 ? (
              <>
                <Text style={styles.infoLabel}>Skills</Text>
                <View style={styles.skillsRow}>
                  {skills.map((s) => <SkillTag key={s} skill={s} />)}
                </View>
              </>
            ) : (
              <Text style={styles.emptyNote}>No skills listed yet.</Text>
            )}
          </View>
        ) : null}

        {/* Manager-specific */}
        {isManager ? (
          <View style={styles.card}>
            <SectionTitle label="Company" />
            <InfoRow label="Company" value={p?.companyName} />
            <InfoRow label="Industry" value={p?.industry} />
            {!p?.companyName && !p?.industry ? (
              <Text style={styles.emptyNote}>No company info added yet.</Text>
            ) : null}
          </View>
        ) : null}

        {/* Account meta */}
        <View style={styles.card}>
          <SectionTitle label="Account" />
          <InfoRow label="Member since" value={formatDate(p?.createdAt)} />
          <InfoRow label="Email verified" value={p?.isEmailVerified ? "Yes" : "No"} />
          <InfoRow label="Account status" value={formatStatusLabel(p?.accountStatus || "active")} />
          {p?.averageRating > 0 ? (
            <InfoRow label="Rating" value={`${Number(p.averageRating).toFixed(1)} ★ (${p?.totalReviews || 0} reviews)`} />
          ) : null}
        </View>

        {/* Reviews entry point */}
        {(p?._id || p?.id) ? (
          <Pressable
            style={styles.reviewsEntryBtn}
            onPress={() =>
              navigation.navigate("Reviews", {
                userId:   String(p._id || p.id),
                userName: [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.name || "User",
              })
            }
            accessibilityRole="button"
          >
            <Ionicons name="star-outline" size={18} color={colors.accent} />
            <Text style={styles.reviewsEntryText}>
              {isOwnProfile ? "View My Reviews" : "View Reviews"}
            </Text>
            {p?.totalReviews > 0 ? (
              <View style={styles.reviewsCountBadge}>
                <Text style={styles.reviewsCountText}>{p.totalReviews}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
          </Pressable>
        ) : null}

        {/* Save success */}
        {saveSuccess ? (
          <View style={styles.successBar}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
            <Text style={styles.successText}>{saveSuccess}</Text>
          </View>
        ) : null}
      </>
    );
  };

  // ── Edit mode ─────────────────────────────────────────────────────────────

  const renderEditMode = () => (
    <>
      <View style={styles.card}>
        <SectionTitle label="Contact" />
        <Field label="Email"        value={form.email}       onChangeText={set("email")}       keyboardType="email-address" />
        <Field label="Phone number" value={form.phoneNumber} onChangeText={set("phoneNumber")} keyboardType="phone-pad" hint="+254XXXXXXXXX" />
        <Field label="Location"     value={form.location}    onChangeText={set("location")}    placeholder="e.g. Nairobi, Kenya" />
      </View>

      <View style={styles.card}>
        <SectionTitle label="Identity (KYC)" />
        <Field label="ID Number"    value={form.idNumber}    onChangeText={set("idNumber")}    keyboardType="number-pad" />
        <Field label="M-Pesa number" value={form.mpesaNumber} onChangeText={set("mpesaNumber")} keyboardType="phone-pad" hint="+254XXXXXXXXX" />
      </View>

      <View style={styles.card}>
        <SectionTitle label="Bio" />
        <Field
          label="About you"
          value={form.bio}
          onChangeText={set("bio")}
          multiline
          placeholder="Tell managers and hustlers about yourself (10–500 characters)"
          hint="Min 10 characters"
        />
      </View>

      {isHustler ? (
        <View style={styles.card}>
          <SectionTitle label="Work Profile" />
          <Field
            label="Skills"
            value={form.skillsInput}
            onChangeText={set("skillsInput")}
            placeholder="e.g. Painting, Plumbing, Cleaning"
            hint="Separate with commas"
          />
          <Field
            label="Experience level"
            value={form.experienceLevel}
            onChangeText={set("experienceLevel")}
            placeholder="e.g. beginner, intermediate, expert"
          />
        </View>
      ) : null}

      {isManager ? (
        <View style={styles.card}>
          <SectionTitle label="Company" />
          <Field label="Company name" value={form.companyName} onChangeText={set("companyName")} />
          <Field label="Industry"     value={form.industry}    onChangeText={set("industry")}    placeholder="e.g. Construction, Cleaning, Events" />
        </View>
      ) : null}

      {saveError ? (
        <View style={styles.errorBar}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      ) : null}

      {/* Actions */}
      <Pressable
        style={[styles.primaryBtn, saving && styles.btnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Save changes</Text>
          </>
        )}
      </Pressable>

      <Pressable style={styles.secondaryBtn} onPress={handleCancel} disabled={saving}>
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </Pressable>
    </>
  );

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Custom navbar */}
      <View style={styles.navbar}>
        {navigation.canGoBack() ? (
          <BackButton onPress={() => navigation.goBack()} />
        ) : <View style={{ width: 40 }} />}

        <Text style={styles.navTitle} numberOfLines={1}>
          {isOwnProfile ? "My Profile" : route?.params?.title || "Profile"}
        </Text>

        {/* Edit / done toggle — only for own profile */}
        {isOwnProfile ? (
          editing ? (
            <Pressable style={styles.navBtn} onPress={handleCancel} hitSlop={10}>
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.navBtn, styles.navBtnEdit]}
              onPress={() => { setEditing(true); setSaveSuccess(""); setSaveError(""); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="pencil-outline" size={18} color={colors.text} />
            </Pressable>
          )
        ) : <View style={styles.navBtn} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? renderEditMode() : renderViewMode()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.background },

  // Navbar
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
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navBtnEdit: { backgroundColor: colors.background },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },

  // Scroll content
  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(5),
    gap: spacing(1.5),
  },

  // Identity card
  identityCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoFeedback: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  photoFeedbackError:   { color: colors.danger },
  photoFeedbackSuccess: { color: colors.success },
  identityText: { flex: 1, gap: 4 },
  identityName: { color: colors.text, fontWeight: "800", fontSize: 18 },
  identityEmail: { color: colors.muted, fontSize: 13 },
  roleBadgeRow: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  roleBadge: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  verBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verBadgeText: { fontSize: 11, fontWeight: "700" },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },

  // Section title
  sectionTitle: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  // Info rows (view mode)
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  infoLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  infoMono:  { fontFamily: "monospace" },
  emptyNote: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  bioText:   { color: colors.text, lineHeight: 24, fontSize: 14 },

  // Skills
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skillTagText: { color: colors.text, fontSize: 12, fontWeight: "700" },

  // Edit fields
  fieldWrap: { gap: 5 },
  fieldLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  fieldInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  fieldInputMulti: { minHeight: 90, textAlignVertical: "top" },
  fieldHint: { color: colors.muted, fontSize: 11 },

  // Buttons
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.text, fontWeight: "700" },

  // Feedback bars
  successBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 12,
  },
  successText: { flex: 1, color: colors.success, fontWeight: "700", fontSize: 13 },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1, color: colors.danger, fontWeight: "700", fontSize: 13 },

  // Reviews entry
  reviewsEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing(1.75),
    paddingVertical: 14,
  },
  reviewsEntryText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 14,
    flex: 1,
  },
  reviewsCountBadge: {
    backgroundColor: colors.accent + "18",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reviewsCountText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
  },
});
