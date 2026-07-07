import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function ProtectedRoute({ redirectTo = "/auth/login", allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-shell">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(user?.role)) {
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
