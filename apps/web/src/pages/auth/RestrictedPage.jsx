import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function RestrictedPage() {
  const { logout, user } = useAuth();
  const appealReason = String(user?.suspensionReason || "").trim();
  const suspensionEndsAt = user?.suspensionEndsAt ? new Date(user.suspensionEndsAt) : null;
  const supportLink = `/support?email=${encodeURIComponent(user?.email || "")}&name=${encodeURIComponent([user?.firstName, user?.lastName].filter(Boolean).join(" "))}&reason=${encodeURIComponent(appealReason)}`;

  return (
    <section className="page-shell">
      <div className="card" style={{ maxWidth: "560px", margin: "0 auto" }}>
        <p className="auth-kicker">Account restricted</p>
        <h2>Access paused</h2>
        <p>
          Your account is currently inactive. If you think this is a mistake, submit an appeal and an admin will review it.
        </p>
        <div style={{ marginTop: "16px", padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: "14px", background: "#fafafa" }}>
          <strong style={{ display: "block", marginBottom: "6px" }}>Suspension reason</strong>
          <p style={{ margin: 0, color: "#4b5563" }}>{appealReason || "No reason was provided yet."}</p>
          {suspensionEndsAt && !Number.isNaN(suspensionEndsAt.getTime()) && (
            <p style={{ margin: "8px 0 0", color: "#6b7280" }}>Review date: {suspensionEndsAt.toLocaleDateString()}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
          <Link to={supportLink} className="button-secondary">
            Contact support
          </Link>
          <button type="button" className="button-primary" onClick={logout}>
            Sign out
          </button>
        </div>
        <p style={{ marginTop: "16px", color: "#6b7280" }}>
          Signed in as {user?.email || "unknown user"}
        </p>
      </div>
    </section>
  );
}
