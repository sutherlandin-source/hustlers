import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import BackButton from "../../components/BackButton.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a date into a relative or absolute human-readable string.
 * e.g. "Just now", "5 min ago", "2 hr ago", "Yesterday", "Jul 18"
 */
function formatRelativeTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Map a notification type string to an Ionicon name.
 */
function iconForType(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("payment") || t.includes("wallet") || t.includes("escrow")) return "cash-outline";
  if (t.includes("contract")) return "document-text-outline";
  if (t.includes("milestone") || t.includes("task") || t.includes("work")) return "checkbox-outline";
  if (t.includes("dispute")) return "alert-circle-outline";
  if (t.includes("application")) return "person-add-outline";
  if (t.includes("message") || t.includes("chat")) return "chatbubble-outline";
  if (t.includes("review") || t.includes("rating")) return "star-outline";
  return "notifications-outline";
}

function colorForType(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("payment") || t.includes("wallet") || t.includes("escrow")) return colors.success;
  if (t.includes("dispute")) return colors.danger;
  if (t.includes("milestone") || t.includes("task") || t.includes("work")) return colors.accent;
  return colors.primary;
}

/**
 * Resolve the screen to navigate to when tapping a notification.
 */
function resolveTarget(notification) {
  const link = String(notification?.link || "");
  const payload = notification?.payload || {};

  if (
    payload.milestoneId &&
    /work|milestone/i.test(String(notification?.title || "") + " " + String(notification?.message || ""))
  ) {
    return { screen: "TaskDetails", params: { milestoneId: payload.milestoneId } };
  }

  const contractIdMatch = link.match(/\/(?:dashboard|manager)\/contracts\/([^/?#]+)/);
  const contractId = payload.contractId || contractIdMatch?.[1];

  if (contractId && /\/(?:dashboard|manager)\/contracts\//.test(link)) {
    return { screen: "ContractDetails", params: { contractId } };
  }

  if (/\/dashboard\/applications/.test(link)) {
    return { screen: "Applications" };
  }

  if (/\/dashboard\/tasks/.test(link)) {
    return { screen: "Tabs", params: { screen: "Tasks" } };
  }

  if (/\/(?:dashboard|manager|admin)\/chat\//.test(link)) {
    return { screen: "Tabs", params: { screen: "Messages" } };
  }

  return null;
}

// ─── Notification Card ────────────────────────────────────────────────────────

function NotificationCard({ notification, onPress, onArchive }) {
  const unread = notification?.status !== "read" && !notification?.readAt;
  const timestamp = formatRelativeTime(notification?.createdAt || notification?.updatedAt);
  const icon = iconForType(notification?.type);
  const iconColor = colorForType(notification?.type);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, unread && styles.unreadCard, pressed && styles.cardPressed]}
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={notification?.title || "Notification"}
    >
      {/* Icon + content row */}
      <View style={styles.cardRow}>
        <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={[styles.cardTitle, unread && styles.cardTitleUnread]} numberOfLines={2}>
              {notification?.title || "Notification"}
            </Text>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>

          <Text style={styles.cardText} numberOfLines={3}>
            {notification?.message || "No details"}
          </Text>

          <View style={styles.cardMeta}>
            <Text style={styles.metaType}>
              {String(notification?.type || "system").replace(/_/g, " ")}
            </Text>
            {timestamp ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaTime}>{timestamp}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Archive button */}
        {onArchive ? (
          <Pressable
            style={styles.archiveBtn}
            onPress={(e) => { e.stopPropagation?.(); onArchive(notification); }}
            hitSlop={10}
            accessibilityLabel="Archive notification"
          >
            <Ionicons name="archive-outline" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen({ navigation }) {
  const { accessToken } = useAuth();

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const [listPayload, countPayload] = await Promise.all([
          apiRequest("/notifications", { token: accessToken, query: { limit: 30 } }),
          apiRequest("/notifications/unread-count", { token: accessToken }).catch(() => ({ count: 0 })),
        ]);

        setNotifications(
          Array.isArray(listPayload?.notifications) ? listPayload.notifications :
          Array.isArray(listPayload?.data?.notifications) ? listPayload.data.notifications : []
        );
        setUnreadCount(Number(countPayload?.count ?? countPayload?.data?.count ?? 0));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load notifications.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  // Reload every time the screen comes into focus
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleMarkAllRead = async () => {
    if (!unreadCount) return;
    setRefreshing(true);
    try {
      await apiRequest("/notifications/read-all", { token: accessToken, method: "PATCH" });
      await load({ isRefresh: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unable to mark as read.");
      setRefreshing(false);
    }
  };

  const handleArchive = async (notification) => {
    const id = notification?._id || notification?.id;
    if (!id) return;
    // Optimistically remove from list
    setNotifications((prev) => prev.filter((n) => (n._id || n.id) !== id));
    if (notification?.status !== "read" && !notification?.readAt) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Fire and forget — best-effort
    apiRequest(`/notifications/${id}/archive`, {
      token:  accessToken,
      method: "PATCH",
    }).catch(() => {
      // Reload on failure so the list is consistent
      load();
    });
  };

  const handleOpen = async (notification) => {
    // Mark as read (best effort)
    if (!notification?.readAt && notification?.status !== "read") {
      apiRequest(`/notifications/${notification._id || notification.id}/read`, {
        token: accessToken,
        method: "PATCH",
      }).catch(() => {});
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          (n._id || n.id) === (notification._id || notification.id)
            ? { ...n, status: "read", readAt: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    const target = resolveTarget(notification);
    if (target) navigation.navigate(target.screen, target.params);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          {navigation.canGoBack() ? (
            <BackButton onPress={() => navigation.goBack()} />
          ) : null}
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSub}>Alerts from contracts, payments, and disputes.</Text>
          </View>
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Pressable
            style={[styles.actionBtn, !unreadCount && styles.actionBtnDisabled]}
            onPress={handleMarkAllRead}
            disabled={!unreadCount || refreshing}
          >
            <Ionicons name="checkmark-done-outline" size={16} color={unreadCount ? colors.text : colors.muted} />
            <Text style={[styles.actionBtnText, !unreadCount && styles.actionBtnTextDisabled]}>
              Mark all read
            </Text>
          </Pressable>
        </View>

        {/* States */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateTitle}>Loading notifications…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="warning-outline" size={24} color={colors.danger} />
            <Text style={styles.stateTitle}>Something went wrong</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="notifications-off-outline" size={32} color={colors.muted} />
            <Text style={styles.stateTitle}>No notifications yet</Text>
            <Text style={styles.stateText}>
              Contract updates, payment releases, and dispute alerts will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((n) => (
            <NotificationCard
              key={n._id || n.id || n.createdAt}
              notification={n}
              onPress={handleOpen}
              onArchive={handleArchive}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(4),
    gap: spacing(1.5),
  },

  // Header
  header: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text },
  headerSub: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  unreadBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  // Action bar
  actionBar: {
    flexDirection: "row",
    gap: spacing(1),
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  actionBtnTextDisabled: { color: colors.muted },

  // State (loading / error / empty)
  stateCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
    alignItems: "flex-start",
    gap: 10,
  },
  stateTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  stateText: { color: colors.muted, lineHeight: 22, fontSize: 14 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Notification card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
  },
  unreadCard: { borderColor: colors.accent },
  cardPressed: { opacity: 0.75 },
  cardRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 5 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 15, lineHeight: 21 },
  cardTitleUnread: { fontWeight: "800" },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 6,
    flexShrink: 0,
  },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaType: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  metaDot: { color: colors.muted, fontSize: 12 },
  metaTime: { color: colors.muted, fontSize: 12 },
  archiveBtn: {
    padding: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginLeft: 4,
  },
});
