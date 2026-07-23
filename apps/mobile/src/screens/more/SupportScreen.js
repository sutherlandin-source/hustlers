/**
 * SupportScreen
 * Category-based support ticket form + ticket history list.
 * After submit, navigates to the support chat conversation.
 * Parity with web SupportPage / PublicSupportPage.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate } from "../../utils/format.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Account issue",
  "Payment problem",
  "Contract dispute",
  "Verification / KYC",
  "Technical issue",
  "Account suspension appeal",
  "Billing query",
  "Other",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function statusColor(status) {
  const s = lower(status);
  if (s === "open" || s === "active") return colors.accent;
  if (s === "resolved" || s === "closed") return colors.success;
  if (s === "pending") return colors.warning;
  return colors.muted;
}

function formatRelativeTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return formatDate(value);
}

// ─── Category picker modal ────────────────────────────────────────────────────

function CategoryModal({ visible, value, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle}>Select Category</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <FlatList
          data={CATEGORIES}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingBottom: spacing(2) }}
          renderItem={({ item }) => {
            const selected = item === value;
            return (
              <TouchableOpacity
                style={[s.catRow, selected && s.catRowSelected]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[s.catRowText, selected && s.catRowTextSelected]}>{item}</Text>
                {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ─── Ticket card ─────────────────────────────────────────────────────────────

function TicketCard({ ticket, onOpen }) {
  const status = ticket?.status || "open";
  const title  = ticket?.subject || ticket?.title || ticket?.lastMessage?.content || "Support ticket";
  const time   = formatRelativeTime(ticket?.updatedAt || ticket?.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [s.ticketCard, pressed && { opacity: 0.75 }]}
      onPress={() => onOpen(ticket)}
    >
      <View style={s.ticketRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.ticketTitle} numberOfLines={2}>{title}</Text>
          {ticket?.category ? <Text style={s.ticketMeta}>{ticket.category}</Text> : null}
          {time ? <Text style={s.ticketTime}>{time}</Text> : null}
        </View>
        <View style={[s.ticketStatusPill, { backgroundColor: statusColor(status) + "22" }]}>
          <Text style={[s.ticketStatusText, { color: statusColor(status) }]}>
            {String(status).replace(/_/g, " ")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SupportScreen({ navigation }) {
  const { accessToken } = useAuth();

  // Form state
  const [category, setCategory]   = useState(CATEGORIES[0]);
  const [message, setMessage]     = useState("");
  const [showCatModal, setShowCatModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Ticket history state
  const [tickets, setTickets]       = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // ── Load ticket history ──────────────────────────────────────────────────

  const loadTickets = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) return;
      if (isRefresh) setRefreshing(true); else setTicketsLoading(true);
      setTicketsError("");
      try {
        const payload = await apiRequest("/conversations/support/history", {
          token: accessToken,
          query: { limit: 20 },
        }).catch(() =>
          // Fallback — list all conversations and filter support ones
          apiRequest("/conversations", { token: accessToken, query: { limit: 50 } })
        );

        const list =
          Array.isArray(payload?.conversations) ? payload.conversations :
          Array.isArray(payload?.data?.conversations) ? payload.data.conversations :
          Array.isArray(payload) ? payload : [];

        // Keep only support conversations
        const supportTickets = list.filter((c) =>
          lower(c.type) === "support" ||
          lower(c.subject || "").includes("support") ||
          lower(c.category || "").includes("support") ||
          c.isSupport
        );

        setTickets(supportTickets.length > 0 ? supportTickets : list.slice(0, 10));
      } catch (err) {
        setTicketsError(err?.response?.data?.message || err?.message || "Could not load ticket history.");
      } finally {
        setTicketsLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => { loadTickets(); }, [loadTickets]));

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!message.trim()) {
      setSubmitError("Please describe your issue before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await apiRequest("/conversations/support", {
        token:  accessToken,
        method: "POST",
        body: {
          message:  message.trim(),
          category,
          subject:  `[${category}] Support request`,
        },
      });

      const conversation =
        result?.conversation ||
        result?.data?.conversation ||
        result;
      const convId = conversation?._id || conversation?.id;

      setMessage("");
      setCategory(CATEGORIES[0]);

      // Navigate to the support chat
      if (convId) {
        navigation.navigate("Chat", {
          conversationId: String(convId),
          title: "Support",
        });
      } else {
        // Refresh ticket list if we can't navigate
        loadTickets({ isRefresh: true });
      }
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message || err?.message || "Unable to open support ticket. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Open existing ticket ─────────────────────────────────────────────────

  const handleOpenTicket = (ticket) => {
    const convId = ticket?._id || ticket?.id;
    if (!convId) return;
    navigation.navigate("Chat", {
      conversationId: String(convId),
      title: ticket?.subject || ticket?.title || "Support",
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenShell
      title="Support"
      subtitle="Get help, appeal decisions, or report an issue."
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets({ isRefresh: true })}
          />
        ),
      }}
    >
      <CategoryModal
        visible={showCatModal}
        value={category}
        onSelect={setCategory}
        onClose={() => setShowCatModal(false)}
      />

      {/* ── New ticket form ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Open a ticket</Text>
        <View style={s.cardDivider} />

        {/* Category picker */}
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>Category</Text>
          <TouchableOpacity
            style={s.selector}
            onPress={() => setShowCatModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.selectorValue}>{category}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Message */}
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>Describe your issue</Text>
          <TextInput
            style={s.textArea}
            value={message}
            onChangeText={(v) => { setMessage(v); setSubmitError(""); }}
            placeholder="Tell us what's happening so we can help as quickly as possible…"
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
          />
        </View>

        {submitError ? (
          <View style={s.bannerError}>
            <Ionicons name="warning-outline" size={14} color={colors.danger} />
            <Text style={s.bannerErrorText}>{submitError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : (
              <>
                <Ionicons name="send-outline" size={16} color="#fff" />
                <Text style={s.submitBtnText}>Submit ticket</Text>
              </>
            )}
        </TouchableOpacity>
      </View>

      {/* ── Ticket history ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Your tickets</Text>
        <View style={s.cardDivider} />

        {ticketsLoading ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : ticketsError ? (
          <View style={s.errorRow}>
            <Text style={s.errorText}>{ticketsError}</Text>
            <Pressable onPress={() => loadTickets()}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : tickets.length === 0 ? (
          <Text style={s.emptyText}>No tickets yet. Submit one above and it will appear here.</Text>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket._id || ticket.id}
              ticket={ticket}
              onOpen={handleOpenTicket}
            />
          ))
        )}
      </View>
    </ScreenShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(1.75), gap: 12,
  },
  cardTitle:   { fontSize: 16, fontWeight: "800", color: colors.text },
  cardDivider: { height: 1, backgroundColor: colors.border },

  fieldLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },

  selector: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  selectorValue: { fontSize: 15, color: colors.text, fontWeight: "600", flex: 1 },

  textArea: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15, minHeight: 110,
  },

  bannerError: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 12, padding: 10,
  },
  bannerErrorText: { flex: 1, color: "#991B1B", fontWeight: "700", fontSize: 13, lineHeight: 19 },

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 14,
  },
  submitBtnDisabled: { opacity: 0.75 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // Ticket cards
  ticketCard: {
    backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: spacing(1.5),
  },
  ticketRow:   { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  ticketTitle: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 20 },
  ticketMeta:  { fontSize: 12, color: colors.muted },
  ticketTime:  { fontSize: 11, color: colors.muted },
  ticketStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  ticketStatusText: { fontSize: 11, fontWeight: "800" },

  emptyText: { color: colors.muted, lineHeight: 22, fontSize: 14 },
  errorRow:  { flexDirection: "row", gap: 10, alignItems: "center" },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  retryText: { color: colors.accent, fontWeight: "800", fontSize: 13 },

  // Modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "60%", paddingHorizontal: spacing(2), paddingTop: spacing(1),
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: spacing(1),
  },
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingBottom: spacing(1.5), borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: spacing(1),
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  catRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing(1.5), paddingHorizontal: spacing(1), borderRadius: 12,
  },
  catRowSelected: { backgroundColor: "#EFF6FF" },
  catRowText:     { fontSize: 15, color: colors.text, fontWeight: "600" },
  catRowTextSelected: { color: colors.accent, fontWeight: "800" },
});
