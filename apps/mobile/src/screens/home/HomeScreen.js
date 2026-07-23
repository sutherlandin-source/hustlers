import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import NotificationBell from "../../components/NotificationBell.js";
import { useAuth } from "../../context/AuthContext.js";
import { apiRequest } from "../../services/api.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney } from "../../utils/format.js";
import { formatStatusLabel, matchesId } from "../../utils/status.js";

const FINISHED_CONTRACT_STATUSES = new Set(["completed", "cancelled", "closed"]);

function normalizeItems(payload, key) {
  const value = payload?.[key];
  return Array.isArray(value) ? value : Array.isArray(payload) ? payload : [];
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function isPendingWork(milestone) {
  const workStatus = lower(milestone?.workStatus || milestone?.status);
  return [
    "pending",
    "submitted",
    "in progress",
    "in_progress",
    "awaiting approval",
    "needs revision",
    "needs_revision",
    "revision requested",
    "rejected",
  ].includes(workStatus);
}

function isActionableSubmission(milestone) {
  const workStatus = lower(milestone?.workStatus || milestone?.status);
  return ["submitted", "work_submitted", "awaiting approval", "pending", "needs revision", "revision requested"].includes(workStatus);
}

function resolveMilestoneContractTitle(milestone) {
  return milestone?.contract?.title || milestone?.contract?.jobTitle || milestone?.contract?.name || "Untitled contract";
}

function sortNewest(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.updatedAt || left?.submittedAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || right?.updatedAt || right?.submittedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function isMilestoneForUser(milestone, userId) {
  return matchesId(milestone?.assignedTo, userId) || matchesId(milestone?.submittedBy, userId);
}

function isFinishedMilestone(milestone) {
  const workStatus = lower(milestone?.workStatus || milestone?.status);
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);
  return workStatus === "approved" || workStatus === "completed" || paymentStatus === "payment released" || paymentStatus === "released";
}

function getMilestonePaymentAmount(milestone) {
  const values = [
    milestone?.netAmount,
    milestone?.paidAmount,
    milestone?.paymentAmount,
    milestone?.amount,
  ];

  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return null;
}

function richPaymentLabel(milestone) {
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);
  if (paymentStatus === "payment released" || paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded" || paymentStatus === "refunded_to_manager" || paymentStatus === "refunded to manager") return "Refunded to Manager";
  if (paymentStatus === "payment secured" || paymentStatus === "secured") return "Payment Secured";
  if (paymentStatus === "on hold" || paymentStatus === "on_hold") return "Payment On Hold";
  if (paymentStatus) return formatStatusLabel(paymentStatus);
  // derive from workStatus
  const workStatus = lower(milestone?.workStatus || milestone?.status);
  if (workStatus === "approved") return "Payment Released";
  if (workStatus === "rejected") return "Not Released";
  return "Payment Secured";
}

function buildActivityLabel(item) {
  const type = lower(item?.type || item?.eventType || item?.category);
  if (type.includes("payment") || type.includes("withdrawal") || type.includes("commission")) return "Payment update";
  if (type.includes("dispute")) return "Dispute update";
  if (type.includes("message")) return "New message";
  if (type.includes("work") || type.includes("milestone")) return "Work update";
  return item?.title || "Activity";
}

export default function HomeScreen({ navigation }) {
  const { user, role, accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState({
    unreadCount: 0,
    wallets: [],
    contracts: [],
    milestones: [],
    notifications: [],
    conversations: [],
    disputedContracts: [],
    transactions: [],
    refreshedAt: null,
  });
  const isManager = role === "manager";
  const isHustler = role === "hustler";

  const loadDashboard = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      // Track which critical requests failed (contracts + milestones are critical;
      // wallets, transactions, conversations, notifications are supplementary).
      let criticalFailure = false;
      const userId = user?._id || user?.id;

      try {
        const [
          unreadPayload,
          walletPayload,
          contractPayload,
          milestonePayload,
          notificationPayload,
          conversationPayload,
          disputedContractPayload,
          transactionPayload,
        ] = await Promise.all([
          // ── supplementary: unread count ──
          apiRequest("/notifications/unread-count", { token: accessToken }).catch(() => ({ count: 0 })),

          // ── supplementary: wallets (manager may have no wallet yet) ──
          apiRequest("/wallets", { token: accessToken }).catch(() => ({ wallets: [] })),

          // ── CRITICAL: contracts ──
          // For hustlers: sellerOnly=true scopes to contracts where they are the
          // seller OR have an accepted application (multi-worker). Limit 10 so
          // recent contracts + stats have enough context.
          apiRequest("/contracts", {
            token: accessToken,
            query: isHustler ? { sellerOnly: true, limit: 10 } : { limit: 5 },
          }).catch((err) => {
            // Only flag as critical if it's not just an empty result
            if (err?.response?.status !== 404) criticalFailure = true;
            return { contracts: [] };
          }),

          // ── CRITICAL: milestones ──
          apiRequest("/milestones", {
            token: accessToken,
            query: isHustler ? { sellerOnly: true, limit: 8 } : { limit: 8 },
          }).catch((err) => {
            if (err?.response?.status !== 404) criticalFailure = true;
            return { milestones: [] };
          }),

          // ── supplementary: notifications ──
          apiRequest("/notifications", { token: accessToken, query: { limit: 5 } }).catch(() => ({ notifications: [] })),

          // ── supplementary: conversations ──
          apiRequest("/conversations", { token: accessToken }).catch(() => ({ conversations: [] })),

          // ── supplementary: disputed contracts (manager only) ──
          isManager
            ? apiRequest("/contracts", {
                token: accessToken,
                query: { status: "disputed", limit: 20 },
              }).catch(() => ({ contracts: [] }))
            : Promise.resolve({ contracts: [] }),

          // ── supplementary: transactions ──
          apiRequest("/transactions", { token: accessToken, query: { limit: 8 } }).catch(() => ({ transactions: [] })),
        ]);

        const wallets = normalizeItems(walletPayload, "wallets");
        const contracts = normalizeItems(contractPayload, "contracts");
        const visibleContracts = isManager
          ? contracts.filter((contract) => matchesId(contract?.buyer, userId))
          : contracts;
        const milestones = normalizeItems(milestonePayload, "milestones");
        const notifications = normalizeItems(notificationPayload, "notifications");
        const conversations = normalizeItems(conversationPayload, "conversations");
        const disputedContracts = normalizeItems(disputedContractPayload, "contracts").filter(
          (contract) => !isManager || matchesId(contract?.buyer, userId)
        );
        const transactions = normalizeItems(transactionPayload, "transactions");

        setDashboard({
          unreadCount: Number(unreadPayload?.count || 0),
          wallets,
          contracts: visibleContracts,
          milestones,
          notifications,
          conversations,
          disputedContracts,
          transactions,
          refreshedAt: new Date(),
        });

        // Only show the error banner when a critical endpoint actually failed.
        // Supplementary failures (no wallet, no transactions yet) are expected
        // for new accounts and should not alarm the user.
        if (criticalFailure) {
          setError("Some dashboard data could not be loaded right now. Pull to refresh.");
        }
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load your dashboard.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, isHustler, isManager, user?._id, user?.id]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const userId = user?._id || user?.id;

    // For managers, count all non-finished contracts they own.
    // For hustlers, count only contracts where they are assigned — either via
    // seller field, acceptedHustlers, or having a milestone assigned to them.
    const hustlerMilestoneContractIds = !isManager
      ? new Set(
          dashboard.milestones
            .filter((m) => isMilestoneForUser(m, userId))
            .map((m) => String(m?.contract?._id || m?.contract || ""))
            .filter(Boolean)
        )
      : null;

    const activeContracts = dashboard.contracts.filter((contract) => {
      if (FINISHED_CONTRACT_STATUSES.has(lower(contract.status))) return false;
      if (isManager) return true;
      // Hustler: is this actually their contract?
      const cid = String(contract._id || contract.id || "");
      if (hustlerMilestoneContractIds.has(cid)) return true;
      if (Array.isArray(contract.acceptedHustlers) && contract.acceptedHustlers.some(
        (h) => matchesId(h, userId) || matchesId(h?._id, userId)
      )) return true;
      return matchesId(contract.seller, userId) || matchesId(contract.seller?._id, userId);
    }).length;

    // For managers: pending approvals = milestones on THEIR contracts with
    // workStatus "work_submitted" or "submitted" (hustler submitted, awaiting review).
    // For hustlers: milestones assigned to them that have actionable states.
    let pendingApprovals = 0;
    let pendingWork = 0;
    let completedJobs = 0;

    if (isManager) {
      // Manager contract IDs
      const managerContractIds = new Set(
        dashboard.contracts.map((c) => String(c._id || c.id || "")).filter(Boolean)
      );
      // Milestones on manager's contracts that are awaiting their review
      pendingApprovals = dashboard.milestones.filter((milestone) => {
        const cid = String(milestone?.contract?._id || milestone?.contract || "");
        const ws = lower(milestone?.workStatus || milestone?.status);
        return (
          managerContractIds.has(cid) &&
          (ws === "work_submitted" || ws === "submitted")
        );
      }).length;
      // Completed/paid milestones on manager's contracts
      completedJobs = dashboard.milestones.filter((milestone) => {
        const cid = String(milestone?.contract?._id || milestone?.contract || "");
        return managerContractIds.has(cid) && isFinishedMilestone(milestone);
      }).length;
    } else {
      // Hustler: milestones assigned to them
      const userMilestones = dashboard.milestones.filter(
        (milestone) => isMilestoneForUser(milestone, userId)
      );
      pendingApprovals = userMilestones.filter(isActionableSubmission).length;
      pendingWork      = userMilestones.filter(isPendingWork).length;
      completedJobs    = userMilestones.filter(isFinishedMilestone).length;
    }

    const openDisputes = dashboard.disputedContracts.length;
    const unreadMessages = dashboard.conversations.reduce(
      (total, conversation) => total + Number(conversation?.unreadCount || 0), 0
    );
    const availableBalance = dashboard.wallets.reduce(
      (total, wallet) => total + Number(wallet?.availableBalance ?? wallet?.balance ?? 0), 0
    );
    const totalSpent = dashboard.transactions.reduce((total, transaction) => {
      const transactionType   = lower(transaction?.type);
      const transactionStatus = lower(transaction?.status);
      const amount = Number(transaction?.amount || 0);
      if (
        transactionStatus === "completed" &&
        ["debit", "commission", "withdrawal"].includes(transactionType)
      ) {
        return total + amount;
      }
      return total;
    }, 0);

    return {
      activeContracts,
      pendingApprovals,
      pendingWork,
      completedJobs,
      openDisputes,
      unreadMessages,
      availableBalance,
      totalSpent,
    };
  }, [dashboard.contracts, dashboard.conversations, dashboard.disputedContracts, dashboard.milestones, dashboard.transactions, dashboard.wallets, isManager, user?._id, user?.id]);

  const shortcuts = useMemo(() => {
    const baseShortcuts = [
      { label: "Browse Contracts", icon: "briefcase-outline", screen: "Contracts", params: { browseOnly: true } },
      { label: "Messages", icon: "chatbubble-ellipses-outline", screen: "Messages" },
      { label: "Notifications", icon: "notifications-outline", screen: "Notifications" },
    ];

    if (role === "manager") {
      return [
        { label: "Contracts", icon: "briefcase-outline", screen: "Contracts" },
        { label: "Applications", icon: "folder-open-outline", screen: "Applications" },
        { label: "Create Contract", icon: "add-circle-outline", screen: "CreateContract" },
        { label: "Messages", icon: "chatbubble-ellipses-outline", screen: "Messages" },
        { label: "Wallet", icon: "wallet-outline", screen: "Wallet" },
      ];
    }

    if (role === "admin") {
      return [
        { label: "Contracts", icon: "briefcase-outline", screen: "Contracts" },
        { label: "Notifications", icon: "notifications-outline", screen: "Notifications" },
        { label: "Messages", icon: "chatbubble-ellipses-outline", screen: "Messages" },
        { label: "More", icon: "grid-outline", screen: "More" },
      ];
    }

    return [
      { label: "Browse Contracts", icon: "briefcase-outline",          screen: "Contracts",    params: { browseOnly: true } },
      { label: "My Applications",  icon: "document-text-outline",       screen: "Applications" },
      { label: "My Tasks",         icon: "checkbox-outline",             screen: "Tasks" },
      { label: "Messages",         icon: "chatbubble-ellipses-outline",  screen: "Messages" },
      { label: "Wallet",           icon: "wallet-outline",               screen: "Wallet" },
      { label: "Notifications",    icon: "notifications-outline",        screen: "Notifications" },
    ];
  }, [role]);

  const recentContracts = useMemo(() => {
    const allSorted = sortNewest(dashboard.contracts);
    if (!isManager && role !== "admin") {
      const userId = user?._id || user?.id;
      // Contracts where hustler has a milestone directly assigned
      const hustlerMilestoneContractIds = new Set(
        dashboard.milestones
          .filter((m) => isMilestoneForUser(m, userId))
          .map((m) => String(m?.contract?._id || m?.contract || ""))
          .filter(Boolean)
      );
      // Also include multi-worker contracts where the hustler is in acceptedHustlers
      // (milestone may not be assigned yet if contract is newly accepted)
      const hustlerContracts = allSorted.filter((c) => {
        const contractId = String(c._id || c.id || "");
        if (hustlerMilestoneContractIds.has(contractId)) return true;
        // Check acceptedHustlers array populated by server's attachMultiWorkerInfo
        if (Array.isArray(c.acceptedHustlers)) {
          return c.acceptedHustlers.some(
            (h) => matchesId(h, userId) || matchesId(h?._id, userId)
          );
        }
        // Fallback: contract.seller field
        return matchesId(c.seller, userId) || matchesId(c.seller?._id, userId);
      });
      return hustlerContracts.slice(0, 3);
    }
    return allSorted.slice(0, 3);
  }, [dashboard.contracts, dashboard.milestones, isManager, role, user?._id, user?.id]);

  // For managers: show milestones on their contracts awaiting review (submitted work).
  // For hustlers: show their own assigned milestones.
  const recentWork = useMemo(() => {
    if (isManager) {
      const managerContractIds = new Set(
        dashboard.contracts.map((c) => String(c._id || c.id || "")).filter(Boolean)
      );
      return sortNewest(
        dashboard.milestones.filter((milestone) => {
          const cid = String(milestone?.contract?._id || milestone?.contract || "");
          const ws  = lower(milestone?.workStatus || milestone?.status);
          return (
            managerContractIds.has(cid) &&
            (ws === "work_submitted" || ws === "submitted" || ws === "needs_revision" || ws === "needs revision")
          );
        })
      ).slice(0, 3);
    }
    return sortNewest(
      dashboard.milestones.filter(
        (milestone) => isMilestoneForUser(milestone, user?._id || user?.id)
      )
    ).slice(0, 3);
  }, [dashboard.contracts, dashboard.milestones, isManager, user?._id, user?.id]);
  const recentActivity = useMemo(() => {
    const activityFromNotifications = dashboard.notifications.map((notification) => ({
      key: `notification-${notification._id || notification.id || notification.createdAt}`,
      title: buildActivityLabel(notification),
      message: notification.message || notification.title || "Update received",
      time: notification.createdAt || notification.updatedAt || null,
    }));

    const activityFromTransactions = dashboard.transactions.map((transaction) => ({
      key: `transaction-${transaction._id || transaction.id || transaction.createdAt}`,
      title: buildActivityLabel(transaction),
      message:
        transaction.type === "payment" || lower(transaction.status) === "completed"
          ? `${formatMoney(transaction.amount, transaction.currency || dashboard.wallets[0]?.currency || "KSH")} ${transaction.direction === "credit" ? "received" : "processed"}`
          : transaction.description || transaction.memo || "Recent update",
      time: transaction.createdAt || transaction.updatedAt || null,
    }));

    return sortNewest([...activityFromNotifications, ...activityFromTransactions]).slice(0, 3);
  }, [dashboard.notifications, dashboard.transactions, dashboard.wallets]);

  const greetingTitle =
    `Hello, ${user?.firstName || "there"}`;

  const greetingSubtitle =
    isManager
      ? "Manage your contracts, workers, and payments."
      : role === "admin"
        ? "Monitor the platform activity, support, and account health."
        : "Track your contracts, tasks, and payouts in one place.";

  const managerProfileCompletion = useMemo(() => {
    if (role !== "manager") return null;

    const skillCount = Array.isArray(user?.skills)
      ? user.skills.filter(Boolean).length
      : String(user?.skills || "")
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean).length;

    const items = [
      {
        label: "Profile",
        detail: `${user?.firstName || user?.lastName ? "Name set" : "Add your name"}`,
        done: Boolean(user?.firstName && user?.lastName && user?.location),
      },
      {
        label: "KYC",
        detail: `${user?.idNumber ? "ID added" : "ID needed"}`,
        done: Boolean(user?.idNumber),
      },
      {
        label: "Skills",
        detail: skillCount ? `${skillCount} listed` : "Add what you offer",
        done: skillCount > 0,
      },
      {
        label: "Profile Photo",
        detail: user?.avatar ? "Photo set" : "Add a photo",
        done: Boolean(user?.avatar),
      },
    ];

    const doneCount = items.filter((item) => item.done).length;
    const completion = Math.round((doneCount / items.length) * 100);

    return { completion, doneCount, total: items.length, items };
  }, [role, user]);

  const attentionItems = useMemo(
    () => [
      {
        label: "Pending approvals",
        value: stats.pendingApprovals,
        hint: "Work submitted by hustlers awaiting your review.",
        icon: "checkbox-outline",
        // Navigate to Contracts tab — manager reviews work inside ContractDetails
        onPress: () => {
          const parent = navigation.getParent?.();
          (parent ?? navigation).navigate("Contracts");
        },
      },
      {
        label: "Open disputes",
        value: stats.openDisputes,
        hint: "Contracts with active disputes.",
        icon: "alert-circle-outline",
        onPress: () => {
          const parent = navigation.getParent?.();
          (parent ?? navigation).navigate("Contracts");
        },
      },
      {
        label: "Unread messages",
        value: stats.unreadMessages || dashboard.unreadCount,
        hint: "New messages from your workers.",
        icon: "chatbubble-ellipses-outline",
        onPress: () => {
          const parent = navigation.getParent?.();
          (parent ?? navigation).navigate("Messages");
        },
      },
      {
        label: "Applications",
        value: 0, // loaded lazily — tapping navigates to the full screen
        hint: "Review new applicants for your contracts.",
        icon: "folder-open-outline",
        onPress: () => navigation.navigate("Applications"),
      },
    ],
    [dashboard.unreadCount, navigation, stats.openDisputes, stats.pendingApprovals, stats.unreadMessages]
  );

  const openShortcut = (screen, params) => {
    if (screen === "CreateContract") {
      navigation.navigate("CreateContract");
      return;
    }

    if (screen === "Applications") {
      navigation.navigate("Applications", { refreshToken: Date.now(), ...(params || {}) });
      return;
    }

    if (screen === "Notifications" || screen === "Wallet") {
      navigation.navigate(screen);
      return;
    }

    navigation.navigate(screen, params);
  };

  const openParentScreen = (screen, params) => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate(screen, params);
      return;
    }

    navigation.navigate(screen, params);
  };

  return (
    <ScreenShell
      title={greetingTitle}
      subtitle={greetingSubtitle}
      rightAction={<NotificationBell navigation={navigation} />}
      scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard({ isRefresh: true })} /> }}
    >
      <View style={styles.hero}>
        <View style={styles.heroMetaRow}>
          <MetaPill label="Role" value={formatStatusLabel(role)} />
          <MetaPill label="Unread" value={loading ? "..." : String(dashboard.unreadCount + stats.unreadMessages)} />
          <MetaPill label="Updated" value={dashboard.refreshedAt ? dashboard.refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"} />
        </View>
      </View>

      {managerProfileCompletion && managerProfileCompletion.completion < 100 ? (
        <View style={[styles.profilePanel, managerProfileCompletion.completion === 100 && styles.profilePanelComplete]}>
          <View style={styles.profilePanelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelKicker}>Get set up</Text>
              <Text style={styles.panelTitle}>Profile completion</Text>
              <Text style={styles.panelText}>A few quick details help people trust your account.</Text>
            </View>
            <View style={styles.completionBlock}>
              <Text style={styles.completionValue}>{managerProfileCompletion.completion}%</Text>
              <Text style={styles.completionLabel}>
                {managerProfileCompletion.doneCount}/{managerProfileCompletion.total} done
              </Text>
            </View>
          </View>

          <View style={styles.completionBar}>
            <View style={[styles.completionFill, { width: `${managerProfileCompletion.completion}%` }]} />
          </View>

          <View style={styles.completionGrid}>
            {managerProfileCompletion.items.map((item) => (
              <View key={item.label} style={[styles.completionItem, item.done && styles.completionItemDone]}>
                <View style={styles.completionItemTop}>
                  <Text style={styles.completionItemTitle}>{item.label}</Text>
                  <Text style={styles.completionItemStatus}>{item.done ? "Done" : "Pending"}</Text>
                </View>
                <Text style={styles.completionItemText}>{item.detail}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>Some data needs another refresh</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <Pressable style={styles.retryButton} onPress={() => loadDashboard({ isRefresh: true })} disabled={refreshing}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing..." : "Retry"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Quick stats" />
        <View style={styles.grid}>
            {isManager ? (
              <>
                <StatCard
                  label="Escrow balance"
                  value={loading ? "..." : formatMoney(stats.availableBalance, dashboard.wallets[0]?.currency || "KSH")}
                  hint="Live funds available in escrow."
                />
                <StatCard
                  label="Active contracts"
                  value={loading ? "..." : String(stats.activeContracts)}
                  hint="Contracts still in motion."
                />
                <StatCard
                  label="Pending reviews"
                  value={loading ? "..." : String(stats.pendingApprovals)}
                  hint="Needs your attention right now."
                  accent
                />
                <StatCard
                  label="Total spent"
                  value={loading ? "..." : formatMoney(stats.totalSpent, dashboard.wallets[0]?.currency || "KSH")}
                  hint="Completed payouts and charges."
                />
              </>
            ) : (
              <>
                <StatCard
                  label="Active contracts"
                  value={loading ? "..." : String(stats.activeContracts)}
                  hint="Live contracts that are not closed yet."
                />
                <StatCard
                  label="Pending work"
                  value={loading ? "..." : String(stats.pendingWork)}
                  hint="Tasks waiting for your next step."
                  accent
                />
                <StatCard
                  label="Completed jobs"
                  value={loading ? "..." : String(stats.completedJobs)}
                  hint="Jobs you've already finished."
                />
                <StatCard
                  label="Available balance"
                  value={loading ? "..." : formatMoney(stats.availableBalance, dashboard.wallets[0]?.currency || "KSH")}
                  hint="Across your loaded wallet accounts."
                />
              </>
            )}
          </View>
        </View>

      {role === "manager" ? (
        <View style={styles.section}>
          <SectionHeader title="Needs attention" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attentionRow}>
            {attentionItems.map((item) => (
              <Pressable key={item.label} style={styles.attentionCard} onPress={item.onPress}>
                <View style={styles.attentionTop}>
                  <View style={styles.attentionIcon}>
                    <Ionicons name={item.icon} size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.attentionCount}>
                    {item.value > 0 ? item.value : "—"}
                  </Text>
                </View>
                <Text style={styles.attentionLabel}>{item.label}</Text>
                <Text style={styles.attentionHint}>{item.hint}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Shortcuts" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsRow}>
          {shortcuts.map((shortcut) => (
            <Pressable key={shortcut.label} style={styles.shortcutCard} onPress={() => openShortcut(shortcut.screen, shortcut.params)}>
              <View style={styles.shortcutIcon}>
                <Ionicons name={shortcut.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.shortcutText}>{shortcut.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent contracts" actionLabel="View all" onAction={() => openShortcut("Contracts")} />
        {loading ? (
          <LoadingCard title="Loading contracts" message="Pulling the latest contracts." />
        ) : recentContracts.length ? (
          <View style={styles.listCard}>
            {recentContracts.map((contract) => (
              <Pressable
                key={contract._id || contract.id}
                style={styles.listRow}
                onPress={() => openParentScreen("ContractDetails", { contractId: contract._id || contract.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{contract.title || "Untitled contract"}</Text>
                  <Text style={styles.listMeta}>
                    Budget: {formatMoney(contract.amount, contract.currency || "KSH")}
                  </Text>
                  {contract.jobCategory
                    ? <Text style={styles.listMeta}>Category: {contract.jobCategory}</Text>
                    : null}
                </View>
                <Text style={styles.listBadge}>{formatStatusLabel(contract.status)}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyCard title="No contracts yet" message={isManager ? "Create a contract to get started." : "Contracts you are assigned to will appear here."} />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={isManager ? "Pending approvals" : "My work"} />
        {loading ? (
          <LoadingCard title="Loading work" message="Fetching live work submissions and approval states." />
        ) : recentWork.length ? (
          <View style={styles.listCard}>
            {recentWork.map((item) => {
              const contractTitle = resolveMilestoneContractTitle(item);
              const ws = formatStatusLabel(item.workStatus || item.status || "pending");
              const ps = richPaymentLabel(item);
              return (
                <Pressable
                  key={item._id || item.id}
                  style={styles.listRow}
                  onPress={() => openParentScreen("TaskDetails", { milestoneId: item._id || item.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{item.title || "Task"}</Text>
                    <Text style={styles.listSubtitle} numberOfLines={1}>{contractTitle}</Text>
                    <Text style={styles.listMeta}>
                      {isManager ? `Work status: ${ws}` : `Submission: ${ws}`}
                    </Text>
                    <Text style={styles.listMeta}>Payment: {ps}</Text>
                  </View>
                  <Text style={styles.listBadge}>{ws}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyCard
            title={isManager ? "No pending approvals" : "No tasks yet"}
            message={
              isManager
                ? "When hustlers submit work on your contracts it will appear here."
                : "Your assigned tasks and approvals will show up here."
            }
          />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent activity" />
        {loading ? (
          <LoadingCard title="Loading activity" message="Fetching the latest updates from contracts, messages, and payments." />
        ) : recentActivity.length ? (
          <View style={styles.listCard}>
            {recentActivity.map((item) => (
              <View key={item.key} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listSubtitle} numberOfLines={2}>
                    {item.message}
                  </Text>
                  <Text style={styles.listMeta}>{item.time ? formatDate(item.time) : "Just now"}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyCard title="No recent activity" message="Your latest updates will appear here." />
        )}
      </View>
    </ScreenShell>
  );
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel ? (
          <Pressable onPress={onAction}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionDivider} />
    </View>
  );
}

function MetaPill({ label, value }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function LoadingCard({ title, message }) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function EmptyCard({ title, message }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function StatCard({ label, value, hint, accent = false }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  profilePanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  profilePanelComplete: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  profilePanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  panelKicker: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },
  panelText: {
    color: colors.muted,
    lineHeight: 21,
  },
  completionBlock: {
    alignItems: "flex-end",
  },
  completionValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
  },
  completionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  completionBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    overflow: "hidden",
  },
  completionFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3B82F6",
  },
  completionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  completionItem: {
    flexGrow: 1,
    minWidth: "48%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 16,
    padding: spacing(1.25),
    gap: 8,
  },
  completionItemDone: {
    backgroundColor: "#ECFDF5",
  },
  completionItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  completionItemTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  completionItemStatus: {
    color: "#15803D",
    fontWeight: "800",
    fontSize: 12,
  },
  completionItemText: {
    color: colors.muted,
    lineHeight: 19,
    fontSize: 13,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroKicker: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  heroTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    lineHeight: 30,
  },
  heroText: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: 6,
  },
  roleBadge: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleBadgeText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "capitalize",
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaPill: {
    minWidth: "48%",
    flexGrow: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  metaValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  errorCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: spacing(1.5),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  errorTitle: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 4,
  },
  errorText: {
    color: "#991B1B",
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
  },
  section: {
    gap: spacing(1),
  },
  sectionHeading: {
    gap: 8,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionAction: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  grid: {
    flexDirection: "row",
    gap: spacing(1),
    flexWrap: "wrap",
  },
  shortcutsRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: spacing(1),
  },
  shortcutCard: {
    width: 128,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.5),
    gap: 10,
    minHeight: 92,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing(1.5),
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    flex: 1,
    minWidth: "48%",
    minHeight: 98,
  },
  statCardAccent: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 24,
  },
  statHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.25),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.25),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: colors.accent,
  },
  listTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  listSubtitle: {
    color: colors.muted,
    marginTop: 3,
    lineHeight: 19,
  },
  listMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  listBadge: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    textTransform: "capitalize",
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    gap: 8,
    alignItems: "flex-start",
  },
  stateTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  stateText: {
    color: colors.muted,
    lineHeight: 22,
  },
  attentionRow: {
    gap: 10,
    paddingRight: spacing(1),
  },
  attentionCard: {
    width: 176,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.5),
    gap: 8,
  },
  attentionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  attentionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  attentionCount: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  attentionLabel: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  attentionHint: {
    color: colors.muted,
    lineHeight: 18,
    fontSize: 12,
  },
});
