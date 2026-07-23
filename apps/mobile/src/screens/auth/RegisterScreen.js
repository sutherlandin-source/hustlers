import React, { useMemo, useState } from "react";
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
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";

const STEPS = ["Basic Info", "Password"];
const ROLES = [
  { value: "hustler", title: "Hustler", description: "Find and complete work on the platform." },
  { value: "manager", title: "Manager", description: "Post contracts and review work submissions." },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+254\d{9}$/;

export default function RegisterScreen({ navigation }) {
  const { register, authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    location: "",
    role: "hustler",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const canGoBack = Boolean(navigation?.canGoBack?.());

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
    setGlobalError("");
  };

  const validateStep = (currentStep) => {
    const nextErrors = {};

    if (currentStep === 1) {
      if (!formData.firstName.trim() || formData.firstName.trim().length < 2) {
        nextErrors.firstName = "First name is required and must be at least 2 characters.";
      }
      if (!formData.lastName.trim() || formData.lastName.trim().length < 2) {
        nextErrors.lastName = "Last name is required and must be at least 2 characters.";
      }
      if (!EMAIL_PATTERN.test(formData.email.trim())) {
        nextErrors.email = "Enter a valid email address.";
      }
      if (!PHONE_PATTERN.test(formData.phoneNumber.trim())) {
        nextErrors.phoneNumber = "Phone number must use +254 format, e.g. +254712345678.";
      }
      if (!formData.location.trim() || formData.location.trim().length < 2) {
        nextErrors.location = "Location is required.";
      }
    }

    if (currentStep === 2) {
      if (formData.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }
      if (formData.confirmPassword !== formData.password) {
        nextErrors.confirmPassword = "Passwords must match.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(current + 1, STEPS.length));
  };

  const handleBack = () => {
    setGlobalError("");
    setStep((current) => Math.max(current - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    setGlobalError("");
    try {
      await register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phoneNumber: formData.phoneNumber.trim(),
        location: formData.location.trim(),
        role: formData.role,
        password: formData.password,
      });
    } catch (err) {
      if (err?.response?.status === 422 && err?.response?.data?.errors) {
        const fieldErrors = {};
        Object.entries(err.response.data.errors).forEach(([field, messages]) => {
          fieldErrors[field] = Array.isArray(messages) ? messages[0] : String(messages);
        });
        setErrors(fieldErrors);
        setGlobalError(err?.response?.data?.message || "Please review the highlighted fields.");
        return;
      }

      if (err?.response?.data?.message) {
        setGlobalError(err.response.data.message);
        return;
      }

      setGlobalError(err?.message || "Registration failed. Please try again.");
    }
  };

  const progress = useMemo(() => (step / STEPS.length) * 100, [step]);

  return (
    <ScreenShell
      title="Create account"
      subtitle="Set up your HUSTLERS profile in a few quick steps."
      showBack={canGoBack}
      onBackPress={() => navigation.goBack()}
    >
      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <View style={styles.logoInner}>
            <Ionicons name="person-add-outline" size={28} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.brand}>HUSTLERS</Text>
          <Text style={styles.tagline}>Join as a Hustler or Manager and keep your work secure.</Text>
        </View>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Step {step} of {STEPS.length}</Text>
          <Text style={styles.progressLabel}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.stepPills}>
          {STEPS.map((label, index) => (
            <View
              key={label}
              style={[
                styles.stepPill,
                index + 1 === step && styles.stepPillActive,
                index + 1 < step && styles.stepPillDone,
              ]}
            >
              <Text style={[styles.stepPillText, index + 1 <= step && styles.stepPillTextActive]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.form}>
        {step === 1 ? (
          <>
            <SectionHeading title="Basic information" />
            <LabeledInput
              label="First name"
              placeholder="Jane"
              value={formData.firstName}
              onChangeText={(value) => updateField("firstName", value)}
              error={errors.firstName}
              autoCapitalize="words"
              editable={!authLoading}
            />
            <LabeledInput
              label="Last name"
              placeholder="Doe"
              value={formData.lastName}
              onChangeText={(value) => updateField("lastName", value)}
              error={errors.lastName}
              autoCapitalize="words"
              editable={!authLoading}
            />
            <LabeledInput
              label="Email address"
              placeholder="jane@example.com"
              value={formData.email}
              onChangeText={(value) => updateField("email", value)}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!authLoading}
            />
            <LabeledInput
              label="Phone number"
              placeholder="+254712345678"
              value={formData.phoneNumber}
              onChangeText={(value) => updateField("phoneNumber", value)}
              error={errors.phoneNumber}
              autoCapitalize="none"
              keyboardType="phone-pad"
              editable={!authLoading}
            />
            <LabeledInput
              label="Location"
              placeholder="Nairobi, Kenya"
              value={formData.location}
              onChangeText={(value) => updateField("location", value)}
              error={errors.location}
              autoCapitalize="words"
              editable={!authLoading}
            />

            <SectionHeading title="Choose account type" />
            <View style={styles.roleGrid}>
              {ROLES.map((option) => {
                const active = formData.role === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                    onPress={() => updateField("role", option.value)}
                    disabled={authLoading}
                  >
                    <View style={styles.roleHeader}>
                      <Text style={styles.roleTitle}>{option.title}</Text>
                      <View style={[styles.roleDot, active && styles.roleDotActive]} />
                    </View>
                    <Text style={styles.roleDescription}>{option.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <SectionHeading title="Create password" />
            <LabeledInput
              label="Password"
              placeholder="Create a strong password"
              value={formData.password}
              onChangeText={(value) => updateField("password", value)}
              error={errors.password}
              secureTextEntry={!showPassword}
              editable={!authLoading}
              rightIcon={
                <Pressable onPress={() => setShowPassword((current) => !current)} hitSlop={8} disabled={authLoading}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.muted} />
                </Pressable>
              }
            />
            <LabeledInput
              label="Confirm password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChangeText={(value) => updateField("confirmPassword", value)}
              error={errors.confirmPassword}
              secureTextEntry={!showConfirmPassword}
              editable={!authLoading}
              rightIcon={
                <Pressable onPress={() => setShowConfirmPassword((current) => !current)} hitSlop={8} disabled={authLoading}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.muted} />
                </Pressable>
              }
            />
            <Text style={styles.helperText}>Password must be at least 8 characters.</Text>
          </>
        )}

        {globalError ? <Text style={styles.globalError}>{globalError}</Text> : null}

        <View style={styles.actions}>
          <Pressable style={[styles.secondaryButton, step === 1 && styles.secondaryButtonDisabled]} onPress={handleBack} disabled={step === 1 || authLoading}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>

          {step < STEPS.length ? (
            <Pressable style={styles.primaryButton} onPress={handleNext} disabled={authLoading}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Finish and create account</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}

function SectionHeading({ title }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionDivider} />
    </View>
  );
}

function LabeledInput({ label, error, rightIcon, style, ...props }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error && styles.inputWrapError, style]}>
        <TextInput style={styles.input} placeholderTextColor="#94A3B8" {...props} />
        {rightIcon ? <View style={styles.inputIcon}>{rightIcon}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
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
  progressCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: 10,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  progressLabel: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  stepPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stepPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  stepPillActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  stepPillDone: {
    backgroundColor: "#F8FAFC",
  },
  stepPillText: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  stepPillTextActive: {
    color: colors.text,
  },
  form: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  sectionHeading: {
    gap: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
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
  inputWrapError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  inputIcon: {
    paddingLeft: 4,
    paddingVertical: 2,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  roleGrid: {
    gap: 10,
  },
  roleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    gap: 8,
  },
  roleCardActive: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  roleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  roleTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  roleDescription: {
    color: colors.muted,
    lineHeight: 20,
  },
  roleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  roleDotActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  globalError: {
    color: colors.danger,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.primary,
    minHeight: 50,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
});
