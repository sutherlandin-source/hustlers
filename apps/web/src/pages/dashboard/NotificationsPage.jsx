import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useNotificationStore from "../../state/useNotificationStore.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { getLandingPath } from "../../utils/roles.js";
import Loader from "../../components/Loader.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1)   return "Just now";
  if (min < 60)  return `${min}m ago`;
  if (hr < 24)   return `${hr}h ago`;
  if (day === 1) return "Yesterday";
  if (day < 7)   return `${day} days ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function notificationId(n) {
  return n._id || n.id;
}

function getNotificationType(n) {
  if (!n) return undefined;
  if (n.type) return n.type;
  if (n.payload?.type) return n.payload.type;
  if (n.payload?.messageId || n.payload?.conversationId) return "message";
  return "general";
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "all",           label: "All"           },
  { key: "notifications", label: "Notifications" },
  { key: "messages",      label: "Messages"      },
];

function filterByTab(notifications, tab) {
  if (tab === "all") return notifications;
  return notifications.filter((n) => {
    const t = getNotificationType(n);
    if (tab === "messages")      return t === "message" || t === "MESSAGE";
    if (tab === "notifications") return t !== "message" && t !== "MESSAGE";
    return true;
  });
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({ notification, onMarkRead, onArchive, onNavigate }) {
  const type   = getNotificationType(notification);
  const isMsg  = type === "message" || type === "MESSAGE";
  const unread = notification.status === "unread";
  const sender = notification.payload?.senderName || notification.payload?.sender?.firstName;
  const preview = notification.payload?.body || notification.message || notification.title;

  const handleClick = (e) => {
    e.preventDefault();
    if (unread) onMarkRead(notificationId(notification));
    if (notification.link) onNavigate(notification);
  };

  return (
    <div
      className={`notification-item ${unread ? "unread" : ""}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        background: unread ? "#F0F9FF" : "#fff",
        borderBottom: "1px solid #E2E8F0",
        cursor: notification.link ? "pointer" : "default",
      }}
      onClick={notification.link ? handleClick : undefined}
      role={notification.link ? "button" : undefined}
      tabIndex={notification.link ? 0 : undefined}
      onKeyDown={(e) => { if (notification.link && (e.key === "Enter" || e.key === " ")) handleClick(e); }}
    >
      {/* Unread dot */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 6,
        background: unread ? "#2563EB" : "transparent",
        border: unread ? "none" : "2px solid #E2E8F0",
      }} />

      {/* Type icon */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: isMsg ? "#EFF6FF" : "#F0FDF4",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1rem",
      }}>
        {isMsg ? "💬" : "🔔"}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <strong style={{ fontSize: "0.9rem", color: "#0F172A" }}>
          {isMsg ? (sender || notification.title || "Message") : (notification.title || "Notification")}
        </strong>
        {preview && (
          <span style={{ fontSize: "0.85rem", color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}
          </span>
        )}
        <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
          {formatRelativeTime(notification.createdAt)}
          {unread && <span style={{ marginLeft: 8, fontWeight: 700, color: "#2563EB" }}>· Unread</span>}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {unread && (
          <button
            className="button-secondary"
            style={{ fontSize: "0.75rem", padding: "4px 10px", minWidth: 0 }}
            onClick={() => onMarkRead(notificationId(notification))}
          >
            Mark read
          </button>
        )}
        <button
          className="button-secondary"
          style={{ fontSize: "0.75rem", padding: "4px 10px", minWidth: 0, color: "#94A3B8" }}
          onClick={() => onArchive(notificationId(notification))}
        >
          Archive
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markRead,
    markAllRead,
    archiveNotification,
  } = useNotificationStore();

  const [tab, setTab]   = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const query = {};
    if (tab === "notifications") query.excludeType = "message";
    if (tab === "messages")      query.type = "message";
    fetchNotifications({ limit: 50, ...query });
  }, [tab, fetchNotifications]);

  const handleNavigate = (notification) => {
    const target = notification.link || "/";
    const messageId = notification.payload?.messageId;
    navigate(target, { state: messageId ? { messageId } : undefined });
  };

  const handleMarkRead = async (id) => {
    const isLocal = String(id).startsWith("local-");
    if (isLocal) {
      useNotificationStore.setState((s) => ({
        notifications: (s.notifications || []).map((n) => ((n._id || n.id) === id ? { ...n, status: "read" } : n)),
        unreadCount: Math.max(0, (s.unreadCount || 0) - 1),
      }));
    } else {
      await markRead(id);
    }
  };

  const visible  = filterByTab(notifications || [], tab);
  const totalPages = Math.ceil(visible.length / PAGE_SIZE);
  const paged    = visible.slice(0, page * PAGE_SIZE);
  const hasMore  = paged.length < visible.length;

  const basePath = (() => {
    const path = window?.location?.pathname || "";
    if (path.startsWith("/manager")) return "/manager";
    if (path.startsWith("/admin"))   return "/admin";
    return getLandingPath(user?.role);
  })();

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Notifications</h2>
          <p>{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
        </div>
        {unreadCount > 0 && (
          <button className="button-secondary" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #E2E8F0", paddingBottom: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #0F172A" : "2px solid transparent",
              padding: "8px 14px",
              fontWeight: tab === t.key ? 800 : 600,
              color: tab === t.key ? "#0F172A" : "#64748B",
              cursor: "pointer",
              fontSize: "0.9rem",
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.key === "all" && unreadCount > 0 && (
              <span style={{
                marginLeft: 6, background: "#EF4444", color: "#fff",
                borderRadius: 999, padding: "1px 7px", fontSize: "0.7rem", fontWeight: 800,
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && (
          <div style={{ padding: 32, display: "flex", justifyContent: "center" }}>
            <Loader label="Loading notifications…" />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: 24, color: "var(--danger)" }}>
            Could not load notifications. <button className="btn-link" onClick={() => fetchNotifications()}>Retry</button>
          </div>
        )}

        {!loading && !error && paged.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>🔔</div>
            <strong style={{ display: "block", marginBottom: 6 }}>No notifications yet</strong>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Contract updates, payments, and messages will appear here.
            </p>
          </div>
        )}

        {!loading && !error && paged.map((notification) => (
          <NotificationRow
            key={notificationId(notification)}
            notification={notification}
            onMarkRead={handleMarkRead}
            onArchive={archiveNotification}
            onNavigate={handleNavigate}
          />
        ))}

        {hasMore && (
          <div style={{ padding: 16, textAlign: "center", borderTop: "1px solid #E2E8F0" }}>
            <button className="button-secondary" onClick={() => setPage((p) => p + 1)}>
              Load more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
