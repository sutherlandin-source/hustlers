import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { userService } from "../../services/userService.js";
import { APP_ROLES, getLandingPath, getRoleLabel } from "../../utils/roles.js";

const OPTIONS = [
  { value: APP_ROLES.HUSTLER, title: "Hustler", description: "Find work, apply for jobs, and manage your tasks." },
  { value: APP_ROLES.MANAGER, title: "Manager", description: "Post jobs, review applications, and manage contracts." },
];

export default function RoleChoicePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, updateUser } = useAuth();
  const [selectedRole, setSelectedRole] = useState(user?.role && user.role !== APP_ROLES.ADMIN ? user.role : APP_ROLES.HUSTLER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pendingRoleChoice = (() => {
    try {
      return localStorage.getItem("hustlers_pending_role_choice") === "true";
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth/login", { replace: true });
      return;
    }

    if (!pendingRoleChoice) {
      navigate(getLandingPath(user?.role), { replace: true });
    }
  }, [isAuthenticated, navigate, pendingRoleChoice, user?.role]);

  if (!isAuthenticated) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await userService.updateProfile({ role: selectedRole });
      const updatedUser = result?.user || result;
      if (updatedUser) {
        updateUser(updatedUser);
      }
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("hustlers_pending_role_choice");
      }
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err?.message || "Unable to save your role right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-form">
      <div className="form-header">
        <p className="auth-kicker">One quick step</p>
        <h2>Choose your role</h2>
        <p>Select how you want to use HUSTLERS for now. You can update this later in your profile if needed.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form-stack">
        <div
          className="role-choice-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}
        >
          {OPTIONS.map((option) => {
            const active = selectedRole === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`role-choice-card ${active ? "active" : ""}`}
                onClick={() => setSelectedRole(option.value)}
                style={{
                  border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
                  borderRadius: "16px",
                  padding: "1rem",
                  textAlign: "left",
                  background: active ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div className="role-choice-title" style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                  {option.title}
                </div>
                <div className="role-choice-description" style={{ color: "#4b5563", fontSize: "0.95rem" }}>
                  {option.description}
                </div>
              </button>
            );
          })}
        </div>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="button-primary auth-submit" disabled={submitting}>
          {submitting ? "Saving role..." : `Continue as ${getRoleLabel(selectedRole)}`}
        </button>
      </form>
    </div>
  );
}
