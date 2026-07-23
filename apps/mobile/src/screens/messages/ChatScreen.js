import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { io } from "socket.io-client";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { getDisplayName } from "../../utils/format.js";
import BackButton from '../../components/BackButton.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDayLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Inject day-separator items between messages that span different days.
 */
function buildMessageList(messages) {
  const result = [];
  let lastDay = null;

  for (const msg of messages) {
    const msgDay = msg?.createdAt ? new Date(msg.createdAt).toDateString() : null;
    if (msgDay && msgDay !== lastDay) {
      result.push({ _id: `day-${msgDay}`, _type: "day", label: formatDayLabel(msg.createdAt) });
      lastDay = msgDay;
    }
    result.push({ ...msg, _type: "message" });
  }
  return result;
}

// Resolve the Socket.IO server URL from the same base as the API
function resolveSocketUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, "");
  }
  if (typeof window !== "undefined" && window?.location?.hostname) {
    return "http://localhost:5000";
  }
  try {
    const Constants = require("expo-constants").default;
    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants.manifest?.debuggerHost ||
      "";
    const host = String(hostUri).split(":")[0];
    if (host) return `http://${host}:5000`;
  } catch (_) {}
  return "http://10.0.2.2:5000";
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, isOwn }) {
  const time = formatMessageTime(message?.createdAt);
  const text = message?.text || message?.content || message?.body || "";
  const senderName = isOwn ? null : getDisplayName(message?.senderId || {});

  return (
    <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
      {!isOwn && senderName ? (
        <Text style={styles.bubbleSender}>{senderName}</Text>
      ) : null}

      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{text}</Text>
        <View style={styles.bubbleMeta}>
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{time}</Text>
          {message?._pending ? (
            <Ionicons
              name="time-outline"
              size={11}
              color={isOwn ? "rgba(255,255,255,0.5)" : colors.muted}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Day Separator ────────────────────────────────────────────────────────────

function DaySeparator({ label }) {
  return (
    <View style={styles.daySep}>
      <View style={styles.daySepLine} />
      <Text style={styles.daySepLabel}>{label}</Text>
      <View style={styles.daySepLine} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }) {
  const { conversationId, title } = route?.params || {};
  const { accessToken, user } = useAuth();
  const userId = user?._id || user?.id;

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [messages, setMessages]   = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState("");
  const [connected, setConnected] = useState(false);

  const flatListRef     = useRef(null);
  const socketRef       = useRef(null);
  const pollIntervalRef = useRef(null);
  // Track message IDs to avoid duplicates from socket + poll overlap
  const messageIdsRef   = useRef(new Set());

  // ── Merge helper — dedup by _id ───────────────────────────────────────────

  const mergeMessages = useCallback((incoming) => {
    setMessages((prev) => {
      const next = [...prev];
      let changed = false;
      for (const msg of incoming) {
        const id = String(msg._id || msg.id || "");
        if (!id || messageIdsRef.current.has(id)) continue;
        messageIdsRef.current.add(id);
        // Replace any matching optimistic (temp-*) entry
        const tempIdx = next.findIndex((m) => m._pending && m.text === msg.text);
        if (tempIdx !== -1) {
          next[tempIdx] = { ...msg, _type: "message" };
        } else {
          next.push({ ...msg, _type: "message" });
        }
        changed = true;
      }
      if (!changed) return prev;
      return [...next].sort(
        (a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
      );
    });
  }, []);

  // ── Load messages (REST) ──────────────────────────────────────────────────

  const loadMessages = useCallback(
    async ({ silent = false } = {}) => {
      if (!accessToken || !conversationId) return;
      if (!silent) setLoading(true);
      setError("");

      try {
        const payload = await apiRequest(`/messages/${conversationId}`, { token: accessToken });
        const list =
          Array.isArray(payload?.messages) ? payload.messages :
          Array.isArray(payload?.data?.messages) ? payload.data.messages :
          Array.isArray(payload) ? payload : [];

        // Full reload — reset id tracker then rebuild
        messageIdsRef.current = new Set();
        const sorted = [...list].sort(
          (a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
        );
        sorted.forEach((m) => { if (m._id) messageIdsRef.current.add(String(m._id)); });
        setMessages(sorted.map((m) => ({ ...m, _type: "message" })));
      } catch (err) {
        if (!silent) setError(err?.response?.data?.message || err?.message || "Unable to load messages.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accessToken, conversationId]
  );

  // ── Socket.IO setup ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken || !conversationId) return;

    const serverUrl = resolveSocketUrl();
    const socket = io(serverUrl, {
      auth: { token: accessToken },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_conversation", { conversationId });
      // Stop fallback polling — socket is live
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    });

    socket.on("joined_conversation", () => {
      // Sync any messages received while connecting
      loadMessages({ silent: true });
    });

    socket.on("receive_message", (message) => {
      if (message && String(message.conversationId) === String(conversationId)) {
        mergeMessages([message]);
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => loadMessages({ silent: true }), 8_000);
      }
    });

    socket.on("connect_error", () => {
      setConnected(false);
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => loadMessages({ silent: true }), 8_000);
      }
    });

    socket.on("receive_error", (msg) => {
      console.warn("[ChatScreen] socket error:", msg);
    });

    return () => {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, conversationId, loadMessages, mergeMessages]);

  // Initial REST load
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError("");
    setInputText("");

    // Optimistic bubble
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      _type: "message",
      conversationId,
      text,
      senderId: user,
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const socket = socketRef.current;
    if (socket?.connected) {
      // Socket path — server echoes back via receive_message
      socket.emit("send_message", { conversationId, text });
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      setSending(false);
    } else {
      // REST fallback
      try {
        const payload = await apiRequest("/messages", {
          token: accessToken,
          method: "POST",
          body: { conversationId, text },
        });
        const saved = payload?.message || payload?.data?.message || payload;
        const savedId = String(saved?._id || saved?.id || "");
        if (savedId) messageIdsRef.current.add(savedId);
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? { ...saved, _type: "message" } : m))
        );
      } catch (err) {
        setSendError(err?.response?.data?.message || err?.message || "Failed to send.");
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        setInputText(text);
      } finally {
        setSending(false);
      }
    }
  };

  // ── Render items ──────────────────────────────────────────────────────────

  const listData = buildMessageList(messages);

  const renderItem = ({ item }) => {
    if (item._type === "day") return <DaySeparator label={item.label} />;
    const senderId = item?.senderId?._id || item?.senderId?.id || item?.senderId;
    const isOwn = String(senderId) === String(userId);
    return <MessageBubble message={item} isOwn={isOwn} />;
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>{title || "Chat"}</Text>
          <View style={styles.navStatusRow}>
            <View style={[styles.statusDot, connected ? styles.statusDotOnline : styles.statusDotOffline]} />
            <Text style={styles.navSub}>{connected ? "Live" : "Connecting…"}</Text>
          </View>
        </View>

        <Pressable
          style={styles.refreshBtn}
          onPress={() => loadMessages()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Refresh messages"
        >
          <Ionicons name="refresh-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading messages…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons name="warning-outline" size={28} color={colors.danger} />
            <Text style={styles.stateTitle}>Couldn't load messages</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => loadMessages()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listData}
            keyExtractor={(item) => String(item._id || item.key || item.label)}
            renderItem={renderItem}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.muted} />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Send the first message below to get the conversation started.
                </Text>
              </View>
            }
          />
        )}

        {/* Send error */}
        {sendError ? (
          <View style={styles.sendErrorBar}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.sendErrorText}>{sendError}</Text>
            <Pressable onPress={() => setSendError("")} hitSlop={8}>
              <Ionicons name="close-outline" size={16} color={colors.danger} />
            </Pressable>
          </View>
        ) : null}

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            returnKeyType="default"
            accessibilityLabel="Message input"
          />
          <Pressable
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  // Navbar
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    gap: 10,
  },
  navCenter: { flex: 1, gap: 2 },
  navTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  navStatusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 999 },
  statusDotOnline:  { backgroundColor: colors.success },
  statusDotOffline: { backgroundColor: colors.muted },
  navSub: { fontSize: 12, color: colors.muted },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Message list
  messageList: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    gap: 4,
    flexGrow: 1,
  },

  // Day separator
  daySep: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing(1),
    gap: 10,
  },
  daySepLine: { flex: 1, height: 1, backgroundColor: colors.border },
  daySepLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 4,
  },

  // Bubbles
  bubbleWrap: { alignItems: "flex-start", marginVertical: 2 },
  bubbleWrapOwn: { alignItems: "flex-end" },
  bubbleSender: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bubbleTextOwn: { color: "#fff" },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  bubbleTime: { color: colors.muted, fontSize: 11 },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.65)" },

  // States
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: spacing(3),
  },
  stateTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  stateText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing(5),
    gap: 10,
  },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 21 },

  // Send error bar
  sendErrorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderTopWidth: 1,
    borderTopColor: "#FCA5A5",
    paddingHorizontal: spacing(2),
    paddingVertical: 10,
  },
  sendErrorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: "600" },

  // Input
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.4 },
});
