import { create } from "zustand";
import { notificationsService } from "../services/notificationsService.js";

let nextId = 1;
let _pollingInterval = null;

const useNotificationStore = create((set) => ({
  toasts: [],
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  addToast: (message, type = "info", timeout = 4000) => {
    const id = String(nextId++);
    const toast = { id, message, type };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (timeout > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, timeout);
    }
    return id;
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  fetchNotifications: async (query = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await notificationsService.list({ limit: 20, ...query });
      set((prev) => {
        const prevNotifications = prev.notifications || [];
        const localTemp = prevNotifications.filter((n) => String(n._id || n.id).startsWith("local-"));
        const fetched = Array.isArray(data.notifications) ? data.notifications : [];
        const localIds = new Set(localTemp.map((n) => String(n._id || n.id)));
        const merged = [...localTemp, ...fetched.filter((f) => !localIds.has(String(f._id || f.id)))];
        const serverUnread = Number(data.unreadCount || 0);
        const unreadCount = Math.max(serverUnread, prev.unreadCount || 0);
        return { notifications: merged, unreadCount, loading: false, error: null };
      });
    } catch (err) {
      console.error("Failed to load notifications:", err);
      set({ error: err?.message || err || "Failed to load notifications", loading: false });
    }
  },
  fetchUnreadCount: async () => {
    try {
      const count = await notificationsService.unreadCount();
      set({ unreadCount: count });
    } catch {
      // Keep notification polling quiet; API errors are shown when the panel opens.
    }
  },
  // Start background polling of the unread count every 30 seconds.
  // Safe to call multiple times — only one interval runs at a time.
  startPolling: () => {
    if (_pollingInterval) return;
    const { fetchUnreadCount } = useNotificationStore.getState();
    _pollingInterval = setInterval(() => {
      useNotificationStore.getState().fetchUnreadCount();
    }, 30_000);
  },
  stopPolling: () => {
    if (_pollingInterval) {
      clearInterval(_pollingInterval);
      _pollingInterval = null;
    }
  },
  markRead: async (notificationId) => {
    const updated = await notificationsService.markRead(notificationId);
    set((state) => ({
      notifications: state.notifications.map((item) => ((item._id || item.id) === (updated._id || updated.id) ? updated : item)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
    return updated;
  },
  markAllRead: async () => {
    const data = await notificationsService.markAllRead();
    set({ notifications: data.notifications || [], unreadCount: data.unreadCount || 0 });
  },
  archiveNotification: async (notificationId) => {
    await notificationsService.archive(notificationId);
    set((state) => {
      const archived = state.notifications.find((item) => (item._id || item.id) === notificationId);
      return {
        notifications: state.notifications.filter((item) => (item._id || item.id) !== notificationId),
        unreadCount: archived?.status === "unread" ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },
}));

export default useNotificationStore;
