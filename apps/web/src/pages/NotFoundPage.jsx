import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { getLandingPath } from "../utils/roles.js";

export default function NotFoundPage() {
  const { isAuthenticated, user } = useAuth();
  const dashboardLink = getLandingPath(user?.role);

  return (
    <section className="page-section">
      <div className="card">
        <h2>Page Not Found</h2>
        <p>The route you requested does not exist or may have been moved.</p>
        <Link 
          to={isAuthenticated ? dashboardLink : "/"} 
          className="button-primary" 
          style={{ display: "inline-block", marginTop: "1rem" }}
        >
          {isAuthenticated ? "Go to Dashboard" : "Go Home"}
        </Link>
      </div>
    </section>
  );
}
