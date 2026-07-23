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
import { getDisplayName } from "../../utils/format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function formatRelativeTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getConversationTitle(conversation, userId) {
  if (conversation?.subject || conversation?.title) {
    return conversation.subject || conversation.title;
  }
  // Try to get the other participant's name
  const participants = conversation?.participants || [];
  const other = participants.find((p) => {
    const pid = p?._id || p?.id || p;
    return String(pid) !== String(userId);
  });
  if (other && typeof other === "object") return getDisplayName(other);
  if (conversation?.contractTitle) return conversation.contractTitle;
  return "Conversation";
}

function getLastMessage(conversation) {
  return (
    conversation?.lastMessage?.text ||
    conversation?.lastMessage?.content ||
    conversation?.preview ||
    conversation?.snippet ||
    null
  );
}

// ─── Conversation Card ────────────────────────────────────────────────────────

function ConversationCard({ conversation, userId, onPress }) {
  const title = getConversationTitle(conversation, userId);
  const preview = getLastMessage(conversation);
  const unread = Number(conversation?.unreadCount || 0);
  const timestamp = formatRelativeTime(
    conversation?.lastMessage?.createdAt ||
    conversation?.updatedAt ||
    conversation?.createdAt
  );
  const isSupport = lower(conversation?.type) === "support";

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`Open conversation: ${title}`}
    >
      {/* Avatar / icon */}
      <View style={[styles.avatar, isSupport && styles.avatarSupport]}>
        <Ionicons
          name={isSupport ? "headset-outline" : "chatbubbles-outline"}
          size={20}
          color={isSupport ? colors.accent : colors.primary}
        />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, unread > 0 && styles.cardTitleUnread]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.cardTopRight}>
            {timestamp ? <Text style={styles.cardTime}>{timestamp}</Text> : null}
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unread > 99 ? "99+" : unread}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {preview ? (
          <Text style={styles.cardPreview} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}

        {isSupport ? (
          <View style={styles.supportTag}>
            <Text style={styles.supportTagText}>Support</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagesScreen({ navigation }) {
  const { accessToken, user } = useAuth();
  const userId = user?._id || user?.id;

  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState("");
  const [conversations, setConversations] = useState([]);
  const [openingSupport, setOpeningSupport] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        const payload = await apiRequest("/conversations", { token: accessToken });
        const list =
          Array.isArray(payload?.conversations) ? payload.conversations :
          Array.isArray(payload?.data?.conversations) ? payload.data.conversations :
          Array.isArray(payload) ? payload : [];
        setConversations(list);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load conversations.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  // Reload every time the screen is focused
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleOpenConversation = (conversation) => {
    navigation.navigate("Chat", {
      conversationId: conversation._id || conversation.id,
      title: getConversationTitle(conversation, userId),
    });
  };

  const handleOpenSupport = async () => {
    setOpeningSupport(true);
    setError("");
    try {
      const result = await apiRequest("/conversations/support", {
        token: accessToken,
        method: "POST",
      });
      const conversation =
        result?.conversation ||
        result?.data?.conversation ||
        result;

      if (conversation?._id || conversation?.id) {
        navigation.navigate("Chat", {
          conversationId: conversation._id || conversation.id,
          title: "Support",
        });
      }
      // Refresh list in background
      load({ isRefresh: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unable to open support chat.");
    } finally {
      setOpeningSupport(false);
    }
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
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>Your contract conversations and support chats.</Text>
          </View>
          {conversations.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{conversations.length}</Text>
            </View>
          ) : null}
        </View>

        {/* Support shortcut */}
        <Pressable
          style={({ pressed }) => [styles.supportCard, pressed && styles.cardPressed]}
          onPress={handleOpenSupport}
          disabled={openingSupport}
          accessibilityRole="button"
          accessibilityLabel="Open support ticket"
        >
          <View style={styles.supportIconWrap}>
            <Ionicons name="headset-outline" size={22} color={colors.accent} />
          </View>
          <View style={styles.supportText}>
            <Text style={styles.supportTitle}>Need help?</Text>
            <Text style={styles.supportSub}>
              {openingSupport ? "Opening support chat…" : "Open a support ticket — we typically reply within minutes."}
            </Text>
          </View>
          {openingSupport ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          )}
        </Pressable>

        {/* States */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateTitle}>Loading conversations…</Text>
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
        ) : conversations.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.muted} />
            <Text style={styles.stateTitle}>No conversations yet</Text>
            <Text style={styles.stateText}>
              Contract chats and support tickets will show up here once started.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>All conversations</Text>
            {conversations.map((conv) => (
              <ConversationCard
                key={conv._id || conv.id}
                conversation={conv}
                userId={userId}
                onPress={handleOpenConversation}
              />
            ))}
          </>
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
  countBadge: {
    backgroundColor: colors.border,
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: { color: colors.text, fontSize: 13, fontWeight: "800" },

  // Support card
  supportCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  supportIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent + "15",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  supportText: { flex: 1, gap: 3 },
  supportTitle: { color: colors.text, fontWeight: "800", fontSize: 15 },
  supportSub: { color: colors.muted, fontSize: 13, lineHeight: 19 },

  // Section label
  sectionLabel: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: -4,
  },

  // Conversation card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardPressed: { opacity: 0.72 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarSupport: {
    backgroundColor: colors.accent + "15",
    borderColor: colors.accent + "40",
  },
  cardContent: { flex: 1, gap: 5 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  cardTitleUnread: { fontWeight: "800" },
  cardTopRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  cardTime: { color: colors.muted, fontSize: 11 },
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  cardPreview: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  supportTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent + "15",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  supportTagText: { color: colors.accent, fontSize: 11, fontWeight: "800" },

  // State cards
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
});
