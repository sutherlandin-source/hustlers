import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useNotificationStore from "../state/useNotificationStore.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { createChatSocket } from "../utils/socket.js";

function formatRelativeTime(value) {
  if (!value) return "";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function notificationId(notification) {
  return notification._id || notification.id;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    markAllRead,
    archiveNotification,
  } = useNotificationStore();
  const [tab, setTab] = useState("all");

  const { accessToken, user } = useAuth();
  const addToast = useNotificationStore((s) => s.addToast);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createChatSocket(accessToken);
    socket.connect();

    const handleNotification = (payload) => {
      try {
        const convId = payload?.conversationId;
        const basePath = user?.role === "admin" ? "/admin" : user?.role === "manager" ? "/manager" : "/dashboard";
        const link = payload?.link || (convId ? `${basePath}/chat/${convId}` : undefined);

        const local = {
          _id: `local-${Date.now()}-${Math.random()}`,
          title: payload?.title || "Notification",
          message: payload?.body || payload?.message || "",
          createdAt: new Date().toISOString(),
          status: "unread",
          link,
          payload,
        };

        // Prepend to store and increment unread count immediately
        useNotificationStore.setState((state) => ({
          notifications: [local, ...(state.notifications || [])],
          unreadCount: (state.unreadCount || 0) + 1,
        }));

        // Show a quick toast
        addToast(local.title, "info", 5000);
      } catch (err) {
        // ignore
      }
    };

    socket.on("notification", handleNotification);
    return () => {
      socket.off("notification", handleNotification);
    };
  }, [accessToken, user?.role, addToast]);

  useEffect(() => {
    if (!open) return;
    const query = {};
    if (tab === "notifications") query.type = "system";
    if (tab === "messages") query.type = "message";
    fetchNotifications(query);
  }, [open, tab, fetchNotifications]);

  function getNotificationType(n) {
    if (!n) return undefined;
    if (n.type) return n.type;
    if (n.payload?.type) return n.payload.type;
    // infer message if payload has messageId or conversationId
    if (n.payload?.messageId || n.payload?.conversationId) return "message";
    return "user";
  }

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen((current) => !current);
  };

  const handleMarkRead = async (notification) => {
    // legacy handler kept for non-link buttons
    if (notification.status === "unread") {
      await markRead(notificationId(notification));
    }
    setOpen(false);
  };

  const handleArchive = async (event, notification) => {
    event.preventDefault();
    event.stopPropagation();
    await archiveNotification(notificationId(notification));
  };

  // Prepare filtered list for rendering (keeps JSX cleaner)
  const filteredNotifications = (notifications || []).filter((n) => {
    if (tab === "all") return true;
    const t = getNotificationType(n);
    if (tab === "messages") return t === "message" || t === "MESSAGE";
    if (tab === "notifications") return t !== "message" && t !== "MESSAGE";
    return true;
  });

  return (
    <div className="notifications-menu" ref={panelRef}>
      <button
        type="button"
        className="notification-bell"
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {unreadCount > 0 ? (
            // filled bell when unread
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-1.99 2H20L18 16z" fill="currentColor" />
          ) : (
            <>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </>
          )}
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notifications-panel">
          <div className="notifications-panel-header">
            <div>
              <h3>Notifications</h3>
              <p>{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
            </div>
            <button type="button" onClick={markAllRead} disabled={!unreadCount || loading}>
              Mark all read
            </button>
          </div>

          {loading && <div className="notifications-state">Loading notifications...</div>}
          {/* Tabs: All / Notifications / Messages */}
          <div className="notifications-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "all"} className={`tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All</button>
            <button type="button" role="tab" aria-selected={tab === "notifications"} className={`tab ${tab === "notifications" ? "active" : ""}`} onClick={() => setTab("notifications")}>Notifications</button>
            <button type="button" role="tab" aria-selected={tab === "messages"} className={`tab ${tab === "messages" ? "active" : ""}`} onClick={() => setTab("messages")}>Messages</button>
          </div>
          {error && <div className="notifications-state error">Could not load notifications. {error.message || error}</div>}

          {!loading && !error && filteredNotifications.length === 0 && (
            <div className="notifications-empty">
              <strong>No notifications yet</strong>
              <span>Contract, application, payment, and work updates will appear here.</span>
            </div>
          )}

          {!loading && !error && filteredNotifications.length > 0 && (
            <div className="notifications-list">
              {filteredNotifications.map((notification) => {
                const id = notificationId(notification);
                const type = getNotificationType(notification);
                const senderName = notification.payload?.senderName || notification.payload?.sender?.firstName || notification.payload?.sender?.email;
                const preview = notification.payload?.body || notification.message || notification.title;
                const content =
                  type === "message" ? (
                    <>
                      <strong>{senderName || notification.title || "Message"}</strong>
                      {preview && <span className="message-preview">{preview}</span>}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <small>{formatRelativeTime(notification.createdAt)}</small>
                        {notification.status === "unread" && <span className="status-badge">Unread</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>{notification.title}</strong>
                      {notification.message && <span>{notification.message}</span>}
                      <small>{formatRelativeTime(notification.createdAt)}</small>
                    </>
                  );

                return (
                  <div key={id} className={`notification-item ${notification.status === "unread" ? "unread" : ""}`}>
                    <span className={`notification-dot ${notification.status === "unread" ? "unread" : ""}`} />
                    {notification.link ? (
                      <NotificationLink notification={notification} onNavigate={async () => setOpen(false)} markRead={markRead} />
                    ) : (
                      <button type="button" className="notification-content notification-content-action" onClick={() => handleMarkRead(notification)}>
                        {content}
                      </button>
                    )}
                    <button type="button" className="notification-archive" onClick={(event) => handleArchive(event, notification)}>
                      Archive
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationLink({ notification, onNavigate = () => {}, markRead }) {
  const navigate = useNavigate();

  const handleClick = async (e) => {
    e.preventDefault();
    const id = notificationId(notification);
    const isLocal = String(id).startsWith("local-");
    try {
      if (notification.status === "unread") {
        if (isLocal) {
          // Optimistically mark local (socket-created) notification as read in the store
          useNotificationStore.setState((s) => ({
            notifications: (s.notifications || []).map((n) => ((n._id || n.id) === id ? { ...n, status: "read" } : n)),
            unreadCount: Math.max(0, (s.unreadCount || 0) - 1),
          }));
        } else {
          await markRead(id);
        }
      }
    } catch (err) {
      // ignore failures; we keep UI optimistic state for local notifications
    }

    const target = notification.link || "/";
    // include messageId in navigation state if available
    const messageId = notification.payload?.messageId || notification.payload?.conversationId?.messageId;
    const state = messageId ? { messageId } : undefined;
    navigate(target, { state });
    onNavigate();
  };

  return (
    <a href={notification.link || "#"} className="notification-content notification-content-action" onClick={handleClick}>
      <strong>{notification.title}</strong>
      {notification.message && <span>{notification.message}</span>}
      <small>{new Date(notification.createdAt).toLocaleString()}</small>
    </a>
  );
}
