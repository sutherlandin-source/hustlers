import { NavLink, Outlet } from "react-router-dom";
import { useUiStore } from "../state/useStore.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  IconDashboard,
  IconTasks,
  IconApplications,
  IconContracts,
  IconBrowse,
  IconWallet,
  IconProfile,
  IconMenu,
} from "../components/Icons.jsx";
import NotificationBell from "../components/NotificationBell.jsx";

function userInitials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";
}

export default function DashboardLayout() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useUiStore();
  const { user, logout } = useAuth();

  const isManager = user?.role === "manager";
  const isHustler = user?.role === "hustler";
  const isAdmin = user?.role === "admin";

  const basePath = isAdmin ? "/admin" : isManager ? "/manager" : "/dashboard";
  const title = isManager ? "Manager Dashboard" : isHustler ? "Hustler Dashboard" : "Admin Dashboard";
  const sidebarStateClass = sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed";

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      closeSidebar();
    }
  };

  return (
    <div className={`dashboard-shell ${sidebarStateClass}`}>
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Dashboard navigation">
        <div className="brand">HUSTLERS</div>
        <nav>
          <div className="nav-section">
            <NavLink to={`${basePath}/`} end className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
              <IconDashboard />
              <span className="nav-label">Dashboard</span>
            </NavLink>
          </div>

          {isHustler && (
            <div className="nav-section">
              <div className="nav-section-title">My Work</div>
              <NavLink to={`${basePath}/tasks`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconTasks />
                <span className="nav-label">My Tasks</span>
              </NavLink>
              <NavLink to={`${basePath}/applications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">My Applications</span>
              </NavLink>
              <NavLink to={`${basePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">My Contracts</span>
              </NavLink>
              <NavLink to={`${basePath}/browse`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconBrowse />
                <span className="nav-label">Browse Contracts</span>
              </NavLink>
            </div>
          )}

          {isManager && (
            <div className="nav-section">
              <div className="nav-section-title">Manage Work</div>
              <NavLink to={`${basePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">My Contracts</span>
              </NavLink>
              <NavLink to={`${basePath}/contracts/new`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconTasks />
                <span className="nav-label">Create Contract</span>
              </NavLink>
              <NavLink to={`${basePath}/applications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">Applications</span>
              </NavLink>
              <NavLink to={`${basePath}/approvals`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconDashboard />
                <span className="nav-label">Work Submissions</span>
              </NavLink>
            </div>
          )}

          {isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Admin</div>
              <NavLink to={`${basePath}/users`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconProfile />
                <span className="nav-label">Users</span>
              </NavLink>
              <NavLink to={`${basePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">All Contracts</span>
              </NavLink>
              <NavLink to={`${basePath}/disputes`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">Disputes</span>
              </NavLink>
              <NavLink to={`${basePath}/reports`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconDashboard />
                <span className="nav-label">Reports</span>
              </NavLink>
            </div>
          )}

          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <NavLink to={`${basePath}/wallet`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
              <IconWallet />
              <span className="nav-label">Wallet</span>
            </NavLink>
            <NavLink to={`${basePath}/profile`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
              <IconProfile />
              <span className="nav-label">Profile</span>
            </NavLink>
          </div>
        </nav>

        <div className="nav-footer">
          <div style={{ padding: "0 0.5rem", color: "rgba(255,255,255,0.9)" }}>
            <div style={{ fontWeight: 700 }}>{user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email || "User"}</div>
            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>{user?.role || "Member"}</div>
          </div>
          <button className="logout-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={handleNavClick} />}

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar" aria-expanded={sidebarOpen}>
            <IconMenu />
          </button>
          <div className="page-title">{title}</div>
          <div className="dashboard-header-actions">
            <NotificationBell />
            <div className="user-chip">
              <span className="user-chip-avatar">
                {user?.avatar ? <img src={user.avatar} alt="" /> : userInitials(user)}
              </span>
              <span className="user-chip-name">{user?.firstName || "User"}</span>
              <span className="role-badge">{user?.role || "Member"}</span>
            </div>
          </div>
        </header>
        <section className="dashboard-content">
          <div className="content-inner">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
}
