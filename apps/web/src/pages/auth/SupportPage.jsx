import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import { conversationsService } from "../../services/conversationsService.js";

export default function SupportPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function openTicket() {
      try {
        const conversation = await conversationsService.openSupportTicket();
        if (!mounted) return;
        const conversationId = conversation?._id || conversation?.id;
        if (conversationId) {
          navigate(`/app/support/${conversationId}`, { replace: true });
          return;
        }
        setError("Support ticket could not be opened.");
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to open support ticket.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (isAuthenticated) {
      openTicket();
    }

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (loading) {
    return (
      <section className="page-shell">
        <Loader label="Opening support ticket..." />
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="card" style={{ maxWidth: "560px", margin: "0 auto" }}>
        <p className="auth-kicker">Support</p>
        <h2>Opening your ticket</h2>
        <p>{error || "We’re redirecting you to support."}</p>
        <p style={{ color: "#6b7280" }}>Signed in as {user?.email || "unknown user"}</p>
      </div>
    </section>
  );
}
