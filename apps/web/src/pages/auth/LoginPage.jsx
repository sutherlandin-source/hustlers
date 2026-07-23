import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login({ email: email.trim().toLowerCase(), password: password.trim() });
      navigate("/app", { replace: true });
    } catch (err) {
      if (err?.errors && typeof err.errors === "object") {
        const details = Object.values(err.errors).flat().join("; ");
        setError(details || err.message || "Login request failed");
      } else {
        setError(err.message || "Login request failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <div className="form-header">
        <p className="auth-kicker">Welcome back</p>
        <h2>Sign in</h2>
        <p>Access your contracts, tasks, approvals, and wallet activity.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form-stack">
        <label className="form-label">
          <span className="label-text">Email address</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </label>

        <label className="form-label">
          <span className="label-text">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
        </label>

        {error && (
          <div className="form-error">
            {String(error).toLowerCase().includes("disabled") ? (
              <>
                <Link to={`/support?email=${encodeURIComponent(email.trim())}`} className="support-link-inline">
                  Contact support
                </Link>{" "}
                {error}
              </>
            ) : (
              error
            )}
          </div>
        )}

        <button type="submit" disabled={loading} className="button-primary auth-submit">
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div style={{ textAlign: "center", marginTop: "8px" }}>
          <Link to="/auth/forgot-password" style={{ fontSize: "0.9rem", color: "var(--accent)", fontWeight: 600 }}>
            Forgot your password?
          </Link>
        </div>
      </form>

      <div className="auth-footer">
        <span>New to HUSTLERS?</span>
        <Link to="/auth/register">Create an account</Link>
      </div>

      <div className="auth-footer">
        <span>Forgot your password?</span>
        <Link to="/auth/forgot-password">Reset it</Link>
      </div>

      <div className="auth-navigation">
        <Link to="/" className="auth-nav-link">Home</Link>
        <span className="auth-nav-divider">/</span>
        <Link to="/" className="auth-nav-link">Browse Platform</Link>
      </div>
    </div>
  );
}
