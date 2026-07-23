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
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { colors, spacing } from "../../theme.js";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const canGoBack = Boolean(navigation?.canGoBack?.());

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email: trimmed },
      });
      setSuccess(
        "If an account exists for that email, a reset link has been sent. Check your inbox."
      );
      setEmail("");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 400 || status === 422) {
        setError(err?.response?.data?.message || "Invalid email address.");
      } else {
        // Don't confirm whether an account exists for any other error
        setSuccess(
          "If an account exists for that email, a reset link has been sent. Check your inbox."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell
      title="Reset password"
      subtitle="Enter your account email and we'll send you a reset link."
      showBack={canGoBack}
      onBackPress={() => navigation.goBack()}
    >
      <View style={s.hero}>
        <View style={s.logoWrap}>
          <View style={s.logoInner}>
            <Ionicons name="lock-open-outline" size={26} color="#fff" />
          </View>
        </View>
        <Text style={s.heroTitle}>Forgot your password?</Text>
        <Text style={s.heroSub}>
          Enter the email linked to your HUSTLERS account and we'll send you a reset link.
        </Text>
      </View>

      <View style={s.form}>
        <View style={s.fieldGroup}>
          <Text style={s.label}>Email address</Text>
          <View style={s.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.muted} />
            <TextInput
              style={s.input}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(""); setSuccess(""); }}
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              editable={!loading}
            />
          </View>
        </View>

        {error ? (
          <View style={s.bannerError}>
            <Ionicons name="warning-outline" size={15} color={colors.danger} />
            <Text style={s.bannerErrorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={s.bannerSuccess}>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.success} />
            <Text style={s.bannerSuccessText}>{success}</Text>
          </View>
        ) : null}

        <Pressable
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Send reset link</Text>}
        </Pressable>

        {canGoBack ? (
          <Pressable style={s.backLink} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back-outline" size={15} color={colors.accent} />
            <Text style={s.backLinkText}>Back to sign in</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    alignItems: "center",
    gap: 10,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 5,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  logoInner: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  heroSub:   { color: colors.muted, textAlign: "center", lineHeight: 21, fontSize: 14 },
  form: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  fieldGroup: { gap: 8 },
  label: {
    fontSize: 13, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.3,
  },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff",
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  bannerError: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, padding: 12,
  },
  bannerErrorText: { flex: 1, color: "#991B1B", fontWeight: "700", lineHeight: 20, fontSize: 13 },
  bannerSuccess: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0",
    borderRadius: 12, padding: 12,
  },
  bannerSuccessText: { flex: 1, color: "#166534", fontWeight: "700", lineHeight: 20, fontSize: 13 },
  button: {
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14,
    alignItems: "center", minHeight: 50, justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.8 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  backLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingTop: 4,
  },
  backLinkText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
});
