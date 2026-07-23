import { useState } from "react";
import { Link } from "react-router-dom";
import { axiosInstance, handleApiError } from "../../services/api.js";

// ─── Steps ────────────────────────────────────────────────────────────────────
// 1. Enter email  → POST /auth/forgot-password
// 2. Enter OTP + new password  → POST /auth/reset-password
// 3. Success confirmation

const STEP_EMAIL    = "email";
const STEP_RESET    = "reset";
const STEP_SUCCESS  = "success";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const [step, setStep]         = useState(STEP_EMAIL);
  const [email, setEmail]       = useState("");
  const [otp, setOtp]           = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // ── Step 1: request OTP ────────────────────────────────────────────────────

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setStep(STEP_RESET);
    } catch (err) {
      const apiErr = handleApiError(err);
      setError(apiErr?.message || "Could not send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: submit OTP + new password ─────────────────────────────────────

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");

    if (!otp.trim()) {
      setError("Please enter the code sent to your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.post("/auth/reset-password", {
        email:    email.trim().toLowerCase(),
        otp:      otp.trim(),
        password: password,
      });
      setStep(STEP_SUCCESS);
    } catch (err) {
      const apiErr = handleApiError(err);
      setError(apiErr?.message || "Reset failed. Check your code and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────────────────

  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      await axiosInstance.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
    } catch (err) {
      const apiErr = handleApiError(err);
      setError(apiErr?.message || "Could not resend code.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="auth-form">
      <div className="form-header">
        <p className="auth-kicker">Account recovery</p>
        <h2>
          {step === STEP_EMAIL   && "Forgot your password?"}
          {step === STEP_RESET   && "Enter your reset code"}
          {step === STEP_SUCCESS && "Password updated"}
        </h2>
        <p>
          {step === STEP_EMAIL   && "Enter your email and we'll send a reset code."}
          {step === STEP_RESET   && `We sent a code to ${email}. Enter it below along with your new password.`}
          {step === STEP_SUCCESS && "Your password has been updated. You can now sign in."}
        </p>
      </div>

      {/* ── Step 1 ── */}
      {step === STEP_EMAIL && (
        <form onSubmit={handleRequestOtp} className="auth-form-stack" noValidate>
          <label className="form-label">
            <span className="label-text">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="button-primary auth-submit" disabled={loading}>
            {loading ? "Sending code…" : "Send reset code"}
          </button>
        </form>
      )}

      {/* ── Step 2 ── */}
      {step === STEP_RESET && (
        <form onSubmit={handleReset} className="auth-form-stack" noValidate>
          <label className="form-label">
            <span className="label-text">Reset code</span>
            <input
              type="text"
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
              placeholder="Enter the code from your email"
              required
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
            />
          </label>

          <label className="form-label">
            <span className="label-text">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
          </label>

          <label className="form-label">
            <span className="label-text">Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder="Repeat your new password"
              required
              autoComplete="new-password"
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="button-primary auth-submit" disabled={loading}>
            {loading ? "Updating password…" : "Update password"}
          </button>

          <button
            type="button"
            className="button-secondary auth-submit"
            onClick={handleResend}
            disabled={loading}
            style={{ marginTop: -4 }}
          >
            Resend code
          </button>
        </form>
      )}

      {/* ── Step 3 ── */}
      {step === STEP_SUCCESS && (
        <div className="auth-form-stack">
          <div style={{
            background: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: 12,
            padding: "16px 18px",
            color: "#166534",
            fontWeight: 600,
            lineHeight: 1.6,
          }}>
            ✓ Your password has been updated successfully.
          </div>
          <Link to="/auth/login" className="button-primary auth-submit" style={{ textAlign: "center" }}>
            Sign in with new password
          </Link>
        </div>
      )}

      {/* Footer links */}
      <div className="auth-footer">
        <span>Remember your password?</span>
        <Link to="/auth/login">Sign in</Link>
      </div>
      <div className="auth-navigation">
        <Link to="/" className="auth-nav-link">Home</Link>
        <span className="auth-nav-divider">/</span>
        <Link to="/support" className="auth-nav-link">Support</Link>
      </div>
    </div>
  );
}
