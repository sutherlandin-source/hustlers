import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUiStore } from "../state/useStore.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { isHustlerRole, isManagerRole, getRoleLabel } from "../utils/roles.js";
import {
  IconDashboard,
  IconTasks,
  IconApplications,
  IconContracts,
  IconBrowse,
  IconWallet,
  IconProfile,
  IconMenu,
  IconMessages,
  IconShieldCheck,
  IconChart,
  IconSettings,
} from "../components/Icons.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import { conversationsService } from "../services/conversationsService.js";

export default function DashboardLayout() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useUiStore();
  const { user, logout } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === "admin";
  const isManager = isManagerRole(user?.role);
  const isHustler = isHustlerRole(user?.role);
  const isBoth = user?.role === "both";
  const currentBasePath = location.pathname.startsWith("/manager")
    ? "/manager"
    : location.pathname.startsWith("/admin")
      ? "/admin"
      : "/dashboard";
  const hustlerBasePath = isBoth ? "/dashboard" : currentBasePath;
  const managerBasePath = isBoth ? "/manager" : currentBasePath;

  const title = isAdmin
    ? "Admin Dashboard"
    : isBoth && currentBasePath === "/manager"
      ? "Manager Dashboard"
      : isBoth
        ? "Hustler Dashboard"
        : isManager
          ? "Manager Dashboard"
          : "Hustler Dashboard";
  const sidebarStateClass = sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed";
  const [messagesUnreadCount, setMessagesUnreadCount] = useState(0);

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      closeSidebar();
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadUnreadCount = async () => {
      try {
        const conversations = await conversationsService.list();
        if (!mounted) return;
        const unreadCount = conversations.reduce((count, conversation) => count + Number(conversation?.unreadCount || 0), 0);
        setMessagesUnreadCount(unreadCount);
      } catch {
        if (mounted) setMessagesUnreadCount(0);
      }
    };

    if (user) {
      loadUnreadCount();
      const interval = setInterval(loadUnreadCount, 30000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }

    setMessagesUnreadCount(0);
    return () => {
      mounted = false;
    };
  }, [location.pathname, user]);

  return (
    <div className={`dashboard-shell ${sidebarStateClass}`}>
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Dashboard navigation">
        <div className="brand">HUSTLERS</div>
        <nav>
          <div className="nav-section">
            <NavLink to={`${currentBasePath}/`} end className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
              <IconDashboard />
              <span className="nav-label">Dashboard</span>
            </NavLink>
          </div>

          {isHustler && (
            <div className="nav-section">
              <div className="nav-section-title">My Work</div>
              <NavLink to={`${hustlerBasePath}/tasks`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconTasks />
                <span className="nav-label">My Tasks</span>
              </NavLink>
              <NavLink to={`${hustlerBasePath}/applications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">My Applications</span>
              </NavLink>
              <NavLink to={`${hustlerBasePath}/messages`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconMessages />
                <span className="nav-label">Messages</span>
                {messagesUnreadCount > 0 && <span className="nav-count">{messagesUnreadCount > 99 ? "99+" : messagesUnreadCount}</span>}
              </NavLink>
              <NavLink to={`${hustlerBasePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">My Contracts</span>
              </NavLink>
              <NavLink to={`${hustlerBasePath}/browse`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconBrowse />
                <span className="nav-label">Browse Contracts</span>
              </NavLink>
            </div>
          )}

          {isManager && (
            <div className="nav-section">
              <div className="nav-section-title">Manage Work</div>
              <NavLink to={`${managerBasePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">My Contracts</span>
              </NavLink>
              <NavLink to={`${managerBasePath}/contracts/new`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconTasks />
                <span className="nav-label">Create Contract</span>
              </NavLink>
              <NavLink to={`${managerBasePath}/applications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">Applications</span>
              </NavLink>
              <NavLink to={`${managerBasePath}/messages`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconMessages />
                <span className="nav-label">Messages</span>
                {messagesUnreadCount > 0 && <span className="nav-count">{messagesUnreadCount > 99 ? "99+" : messagesUnreadCount}</span>}
              </NavLink>
              <NavLink to={`${managerBasePath}/approvals`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconDashboard />
                <span className="nav-label">Work Submissions</span>
              </NavLink>
            </div>
          )}

          {isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Admin</div>
              <NavLink to={`${currentBasePath}/users`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconProfile />
                <span className="nav-label">Users</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/contracts`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconContracts />
                <span className="nav-label">Contracts</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/applications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">Applications</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/wallet-payments`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconWallet />
                <span className="nav-label">Wallet &amp; Payments</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/disputes`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconApplications />
                <span className="nav-label">Disputes</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/verification`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconShieldCheck />
                <span className="nav-label">Verification</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/reports`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconChart />
                <span className="nav-label">Reports &amp; Analytics</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/messages`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconMessages />
                <span className="nav-label">Messages / Support</span>
                {messagesUnreadCount > 0 && <span className="nav-count">{messagesUnreadCount > 99 ? "99+" : messagesUnreadCount}</span>}
              </NavLink>
              <NavLink to={`${currentBasePath}/settings`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconSettings />
                <span className="nav-label">Settings</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/notifications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconChart />
                <span className="nav-label">Notifications</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/profile`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconProfile />
                <span className="nav-label">Admin Profile</span>
              </NavLink>
            </div>
          )}

          {!isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Account</div>
              <NavLink to={`${currentBasePath}/notifications`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconChart />
                <span className="nav-label">Notifications</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/wallet`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconWallet />
                <span className="nav-label">Wallet</span>
              </NavLink>
              <NavLink to={`${currentBasePath}/profile`} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} onClick={handleNavClick}>
                <IconProfile />
                <span className="nav-label">Profile</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="nav-footer">
          <div style={{ padding: "0 0.5rem", color: "rgba(255,255,255,0.9)" }}>
            <div style={{ fontWeight: 700 }}>{user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email || "User"}</div>
            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>{getRoleLabel(user?.role)}</div>
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
            <Link to={`${currentBasePath}/profile`} className="user-chip user-chip-icon-only" aria-label="Open your profile">
              <span className="user-chip-avatar">
                <IconProfile />
              </span>
            </Link>
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
