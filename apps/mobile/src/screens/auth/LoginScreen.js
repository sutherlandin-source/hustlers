import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";

export default function LoginScreen({ navigation }) {
  const { login, authLoading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const canGoBack = Boolean(navigation?.canGoBack?.());

  const trimmedIdentifier = useMemo(() => identifier.trim(), [identifier]);

  const validate = () => {
    if (!trimmedIdentifier) {
      return "Please enter your email or phone number.";
    }

    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier);
    const looksLikePhone = /^[+]?\d[\d\s-]{6,}$/.test(trimmedIdentifier);

    if (!looksLikeEmail && !looksLikePhone) {
      return "Enter a valid email address or phone number.";
    }

    if (!password.trim()) {
      return "Please enter your password.";
    }

    if (password.trim().length < 6) {
      return "Your password must be at least 6 characters.";
    }

    return "";
  };

  const openRoute = (routeName, fallbackMessage) => {
    const routeNames = navigation?.getState?.()?.routeNames || [];
    if (routeNames.includes(routeName)) {
      navigation.navigate(routeName);
      return;
    }

    Alert.alert("Coming soon", fallbackMessage || "This screen is not available yet.");
  };

  const handleLogin = async () => {
    if (authLoading) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    try {
      await login({ email: trimmedIdentifier, password });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Unable to sign in right now. Please check your connection and try again.";
      setError(message);
    }
  };

  return (
    <ScreenShell
      title="Welcome back"
      subtitle="Sign in to access contracts, tasks, messages, wallet activity, and support."
      showBack={canGoBack}
      onBackPress={() => navigation.goBack()}
    >
      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <View style={styles.logoInner}>
            <Ionicons name="briefcase-outline" size={28} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.brand}>HUSTLERS</Text>
          <Text style={styles.tagline}>Secure work, approvals, and payments.</Text>
        </View>
      </View>

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email or phone</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@example.com or 07..."
              placeholderTextColor="#94A3B8"
              returnKeyType="next"
              editable={!authLoading}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.input}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              textContentType="password"
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!authLoading}
            />
            <Pressable
              style={styles.iconButton}
              onPress={() => setShowPassword((current) => !current)}
              hitSlop={8}
              disabled={authLoading}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, authLoading && styles.buttonDisabled]} onPress={handleLogin} disabled={authLoading}>
          {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable onPress={() => openRoute("ForgotPassword", "Use support to recover your account for now.")}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
          <Pressable onPress={() => openRoute("Register", "Account creation is not available in the mobile app yet.")}>
            <Text style={styles.linkText}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
    alignItems: "center",
  },
  logoWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  logoInner: {
    flex: 1,
    borderRadius: 35,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    alignItems: "center",
    gap: 6,
  },
  brand: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    letterSpacing: 2.2,
  },
  tagline: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  form: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  iconButton: {
    paddingLeft: 4,
    paddingVertical: 4,
  },
  button: {
    marginTop: spacing(0.5),
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingTop: 4,
  },
  linkText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
  },
});
