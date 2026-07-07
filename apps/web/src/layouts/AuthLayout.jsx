import { Outlet, Link } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-topbar">
        <Link to="/" className="auth-home-button">
          Home
        </Link>
      </div>

      <div className="auth-card">
        <aside className="auth-brand-panel">
          <Link to="/" className="auth-logo">
            HUSTLERS
          </Link>
          <div>
            <p className="auth-eyebrow">Work, escrow, payout</p>
            <h1>Manage marketplace work with confidence.</h1>
            <p>Sign in or create an account to post jobs, complete tasks, approve work, and track wallet activity.</p>
          </div>
          <div className="auth-brand-metrics" aria-label="Platform highlights">
            <div>
              <strong>Escrow</strong>
              <span>Protected contract funding</span>
            </div>
            <div>
              <strong>2.5%</strong>
              <span>Hustler payout commission</span>
            </div>
          </div>
        </aside>

        <div className="auth-form-panel">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
