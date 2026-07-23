import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { hasAllowedRole } from "../utils/roles.js";

function isAccessPaused(user) {
  const accountStatus = String(user?.accountStatus || "").toLowerCase();
  const status = String(user?.status || "").toLowerCase();
  return user?.isActive === false || accountStatus === "suspended" || status === "suspended";
}

export default function ProtectedRoute({ redirectTo = "/auth/login", allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-shell">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (isAccessPaused(user) && !location.pathname.startsWith("/app/restricted") && !location.pathname.startsWith("/app/support")) {
    return <Navigate to="/app/restricted" replace state={{ from: location }} />;
  }

  if (allowedRoles.length && !hasAllowedRole(user?.role, allowedRoles)) {
    return (
      <div className="page-shell">
        <section className="page-section">
          <header className="page-header">
            <div>
              <h2>Access denied</h2>
              <p>This page is not available for your current account role.</p>
            </div>
          </header>
          <div className="card">
            <p>Please sign in with an account that has permission to access this area.</p>
          </div>
        </section>
      </div>
    );
  }

  return <Outlet />;
}
