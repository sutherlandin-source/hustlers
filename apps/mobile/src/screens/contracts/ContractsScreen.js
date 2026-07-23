import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "../../components/ScreenShell.js";
import { useAuth } from "../../context/AuthContext.js";
import { apiRequest } from "../../services/api.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel, matchesId } from "../../utils/status.js";
import { colors, spacing } from "../../theme.js";

const MANAGER_FILTERS = ["All", "Active", "Assigned", "In Progress", "Action Required", "Completed", "Cancelled"];
const HUSTLER_FILTERS = ["All", "Applied", "In Progress", "Completed", "Cancelled"];

function formatApplicationStatus(status) {
  const normalized = lower(status).replace(/_/g, " ");
  if (!normalized) return "Not Applied";
  if (normalized === "pending") return "Pending Review";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "cancelled") return "Cancelled";
  return formatStatusLabel(status);
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeArray(payload, key) {
  const value = payload?.[key];
  return Array.isArray(value) ? value : Array.isArray(payload) ? payload : [];
}

function getContractId(application) {
  const contract = application?.contractId || application?.contract || {};
  return contract?._id || contract?.id || application?.contractId?._id || application?.contractId || application?.contract;
}

function workerStatusLabel(milestone) {
  const workStatus = lower(milestone?.workStatus || milestone?.status);
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);

  if (workStatus === "approved" || paymentStatus === "payment released" || paymentStatus === "released") return "Approved";
  if (paymentStatus === "refunded" || paymentStatus === "refunded_to_manager" || paymentStatus === "refunded to manager") return "Refunded";
  if (workStatus === "rejected" || workStatus === "needs revision" || workStatus === "needs_revision") return "Rejected";
  if (workStatus === "work_submitted" || workStatus === "submitted") return "Submitted";
  if (workStatus === "in_progress") return "In Progress";
  if (workStatus === "accepted") return "Accepted";
  if (workStatus === "pending") return "Pending";
  return formatStatusLabel(milestone?.status || milestone?.workStatus || milestone?.paymentStatus || "pending");
}

function workerPaymentLabel(milestone) {
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);
  if (paymentStatus === "payment released" || paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded" || paymentStatus === "refunded to manager" || paymentStatus === "refunded_to_manager") return "Refunded to Manager";
  if (paymentStatus === "payment secured" || paymentStatus === "secured") return "Payment Secured";
  if (paymentStatus === "on hold" || paymentStatus === "on_hold") return "Payment On Hold";
  if (paymentStatus) return formatStatusLabel(paymentStatus);
  if (workerStatusLabel(milestone) === "Refunded") return "Refunded to Manager";
  if (workerStatusLabel(milestone) === "Rejected") return "Not Released";
  return "Payment Secured";
}

function statusGroupFromContract(contract, summary) {
  const rawStatus = lower(contract?.status);
  const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
  const disputeReleasedAt = contract?.metadata?.disputePaymentReleasedAt;
  const resolvedOutcomes = ["release_full_payment", "refund_manager", "refund_to_escrow", "split", "closed"];
  const disputeResolved = resolvedOutcomes.includes(disputeOutcome) || Boolean(disputeReleasedAt);
  const hasOpenDispute = (rawStatus === "disputed" || contract?.disputedAt) && !disputeResolved;
  const hasWorkers = summary.workersAssigned > 0;
  const allWorkersSettled =
    hasWorkers &&
    Array.isArray(summary.workerRows) &&
    summary.workerRows.length > 0 &&
    summary.workerRows.every((row) => {
      const paymentStatus = lower(row.paymentStatus);
      return paymentStatus === "payment released" || paymentStatus === "refunded to manager";
    });

  if (hasOpenDispute) return "Action Required";
  if (
    rawStatus === "completed" ||
    rawStatus === "terminated" ||
    summary.progress === 100 ||
    allWorkersSettled ||
    (disputeResolved && (rawStatus === "disputed" || rawStatus === "terminated"))
  ) return "Completed";
  if (rawStatus === "cancelled") return "Cancelled";
  if (rawStatus === "assigned" || rawStatus === "approved" || rawStatus === "applied") return "Assigned";
  if (rawStatus === "active" || rawStatus === "in_progress" || rawStatus === "disputed") return "In Progress";
  if (summary.approvedCount > 0 && summary.rejectedCount > 0) return "Action Required";
  if (summary.approvedCount > 0 || summary.submittedCount > 0 || summary.rejectedCount > 0) return "In Progress";
  if (hasWorkers) return "Assigned";
  return "Active";
}

function getStatusStyle(status) {
  const normalized = lower(status);
  if (normalized === "completed") return styles.badgeCompleted;
  if (normalized === "cancelled") return styles.badgeCancelled;
  if (normalized === "in progress") return styles.badgeInProgress;
  if (normalized === "action required") return styles.badgeActionRequired;
  if (normalized === "assigned") return styles.badgeAssigned;
  if (normalized === "active") return styles.badgeActive;
  if (normalized === "accepted") return styles.badgeAssigned;
  if (normalized === "pending" || normalized === "pending review") return styles.badgeActive;
  if (normalized === "rejected") return styles.badgeCancelled;
  if (normalized === "refunded") return styles.badgeRefunded;
  if (normalized === "settled") return styles.badgeSettled;
  return styles.badgeNeutral;
}

function getWorkerDotStyle(status) {
  const normalized = lower(status);
  if (normalized === "approved" || normalized === "completed") return styles.workerDotApproved;
  if (normalized === "rejected") return styles.workerDotRejected;
  if (normalized === "submitted" || normalized === "in progress") return styles.workerDotSubmitted;
  return styles.workerDotNeutral;
}

function getApplicationRowStyle(status) {
  const normalized = lower(status);
  if (normalized === "accepted") return { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" };
  if (normalized === "rejected" || normalized === "cancelled") return { borderColor: "#FECACA", backgroundColor: "#FFF5F5" };
  return { borderColor: colors.border, backgroundColor: "#F8FAFC" };
}

function buildSummary(contract, milestones, currentUserId) {
  const contractId = contract?._id || contract?.id;
  const contractMilestones = milestones.filter((milestone) => {
    const milestoneContractId = milestone?.contract?._id || milestone?.contract?.id || milestone?.contract || milestone?.contractId;
    return String(milestoneContractId || "") === String(contractId || "");
  });

  const sourceWorkers = [
    ...(Array.isArray(contract?.assignedHustlers) ? contract.assignedHustlers : []),
    ...(Array.isArray(contract?.acceptedHustlers) ? contract.acceptedHustlers : []),
  ];

  const workerMap = new Map();

  sourceWorkers.forEach((worker) => {
    const workerId = worker?._id || worker?.id || worker;
    if (!workerId || workerMap.has(String(workerId))) return;
    workerMap.set(String(workerId), { worker, milestone: null });
  });

  contractMilestones.forEach((milestone) => {
    const worker = milestone?.assignedTo || milestone?.submittedBy || null;
    const workerId = worker?._id || worker?.id || worker;
    if (!workerId) return;
    workerMap.set(String(workerId), { worker, milestone });
  });

  const rawWorkerRows = Array.from(workerMap.values());
  const workersRequired = Number(contract?.numWorkers || contract?.metadata?.numWorkers || rawWorkerRows.length || 1);
  const workersAssigned = rawWorkerRows.length;
  const remainingPositions = Math.max(0, workersRequired - workersAssigned);

  const approvedCount = rawWorkerRows.filter(({ milestone }) => {
    const workStatus = lower(milestone?.workStatus || milestone?.status);
    const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);
    return workStatus === "approved" || paymentStatus === "payment released" || paymentStatus === "released";
  }).length;

  const submittedCount = rawWorkerRows.filter(({ milestone }) => {
    const workStatus = lower(milestone?.workStatus || milestone?.status);
    return workStatus === "submitted" || workStatus === "work_submitted";
  }).length;

  const rejectedCount = rawWorkerRows.filter(({ milestone }) => {
    const workStatus = lower(milestone?.workStatus || milestone?.status);
    return workStatus === "rejected" || workStatus === "needs revision" || workStatus === "needs_revision";
  }).length;

  const derivedProgress =
    typeof contract?.progress === "number"
      ? contract.progress
      : typeof contract?.metadata?.progress === "number"
        ? contract.metadata.progress
        : workersRequired > 0
          ? Math.min(100, Math.round(((approvedCount + submittedCount * 0.5) / workersRequired) * 100))
          : 0;

  const statusGroup = statusGroupFromContract(contract, {
    workersAssigned,
    approvedCount,
    submittedCount,
    rejectedCount,
    progress: derivedProgress,
  });

  const paymentPerWorker =
    contract?.payoutSummary?.netPerHustler ??
    contract?.payoutSummary?.grossPerHustler ??
    contract?.amount / Math.max(workersRequired, 1) ??
    0;

  const currency = contract?.currency || "KSH";
  const workerRows = rawWorkerRows.map(({ worker, milestone }) => ({
    worker,
    milestone,
    workStatus: workerStatusLabel(milestone),
    paymentStatus: workerPaymentLabel(milestone),
  }));

  const selectedWorkerRow =
    workerRows.find(({ worker, milestone }) => matchesId(worker, currentUserId) || matchesId(milestone?.assignedTo, currentUserId) || matchesId(milestone?.submittedBy, currentUserId)) ||
    null;

  return {
    contract,
    contractId,
    contractMilestones,
    workerRows,
    workersRequired,
    workersAssigned,
    remainingPositions,
    approvedCount,
    submittedCount,
    rejectedCount,
    progress: derivedProgress,
    statusGroup,
    statusLabel: formatStatusLabel(statusGroup),
    paymentPerWorker,
    currency,
    selectedWorkerRow,
  };
}

export default function ContractsScreen({ navigation, route }) {
  const { user, role, accessToken } = useAuth();
  const isManager = role === "manager";
  const browseOnly = Boolean(route?.params?.browseOnly) && role === "hustler";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [contracts, setContracts] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [applications, setApplications] = useState([]);
  const [appliedContractIds, setAppliedContractIds] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadContracts = useCallback(
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

      try {
        // browseOnly: hustler is discovering open contracts → fetch pending contracts from
        // the whole platform (no sellerOnly filter). The client-side browseOnly filter
        // then shows only status=pending contracts the hustler hasn't applied for yet.
        //
        // normal hustler ("My Contracts"): sellerOnly=true scopes to contracts where they
        // are the seller or have an accepted application.
        //
        // manager: fetch their own contracts (client-side filtered by buyer id).
        const query = isManager
          ? { limit: 50 }
          : browseOnly
          ? { status: "pending", limit: 50 }
          : { sellerOnly: true, limit: 20 };

        const [payload, milestonePayload] = await Promise.all([
          apiRequest("/contracts", { token: accessToken, query }),
          apiRequest("/milestones", {
            token: accessToken,
            query: isManager ? { limit: 20 } : { sellerOnly: true, limit: 20 },
          }).catch(() => ({ milestones: [] })),
        ]);
        const loadedContracts = normalizeArray(payload, "contracts");
        const visibleContracts =
          isManager && (user?._id || user?.id)
            ? loadedContracts.filter((contract) => matchesId(contract?.buyer, user?._id || user?.id) || matchesId(contract?.buyer?._id || contract?.buyer?.id || contract?.buyer, user?._id || user?.id))
            : loadedContracts;

        setContracts(visibleContracts);
        setMilestones(normalizeArray(milestonePayload, "milestones"));

        if (!isManager) {
          const applicationsPayload = await apiRequest("/applications/hustler/my", { token: accessToken }).catch(() => ({ applications: [] }));
          const applications = normalizeArray(applicationsPayload, "applications");
          setApplications(applications);
          setAppliedContractIds(
            applications
              .map((application) => {
                const contractId = getContractId(application) || application?.contractId || application?.contract;
                return String(contractId || "");
              })
              .filter(Boolean)
          );
        } else {
          setApplications([]);
          setAppliedContractIds([]);
        }
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load contracts");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, browseOnly, isManager, user?._id, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      loadContracts({ isRefresh: true });
    }, [loadContracts])
  );

  useEffect(() => {
    if (browseOnly) {
      setStatusFilter("Active");
    }
  }, [browseOnly]);

  const summaries = useMemo(
    () => contracts.map((contract) => buildSummary(contract, milestones, user?._id || user?.id)),
    [contracts, milestones, user?._id, user?.id]
  );

  const applicationByContractId = useMemo(() => {
    const map = new Map();
    applications.forEach((application) => {
      const contractId = String(getContractId(application) || "");
      if (!contractId) return;
      map.set(contractId, application);
    });
    return map;
  }, [applications]);

  const filteredSummaries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return summaries.filter((summary) => {
      const contract = summary.contract;
      if (browseOnly) {
        const currentUserInContract =
          matchesId(summary.selectedWorkerRow?.worker, user?._id || user?.id) ||
          matchesId(summary.selectedWorkerRow?.milestone?.assignedTo, user?._id || user?.id) ||
          matchesId(summary.selectedWorkerRow?.milestone?.submittedBy, user?._id || user?.id);
        const isAlreadyApplied = appliedContractIds.includes(summary.contractId);
        const rawStatus = lower(contract?.status);
        if (rawStatus !== "pending" || currentUserInContract || isAlreadyApplied) {
          return false;
        }
      } else if (!isManager) {
        const isApplied = appliedContractIds.includes(summary.contractId);
        const isAssigned = Boolean(summary.selectedWorkerRow);
        if (!isApplied && !isAssigned) {
          return false;
        }
      }
      const searchableText = [
        contract?.title,
        contract?.description,
        contract?.jobCategory,
        contract?.workLocation,
        getDisplayName(contract?.buyer || contract?.seller),
        applicationByContractId.get(summary.contractId)?.status,
        ...summary.workerRows.map(({ worker }) => getDisplayName(worker)),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);

      // Hustler filter mapping
      let matchesStatus = true;
      if (!browseOnly && !isManager) {
        if (statusFilter === "All") {
          matchesStatus = true;
        } else if (statusFilter === "Applied") {
          // Has application but not yet assigned
          matchesStatus = appliedContractIds.includes(summary.contractId) && !summary.selectedWorkerRow;
        } else if (statusFilter === "In Progress") {
          matchesStatus = summary.statusGroup === "In Progress" || summary.statusGroup === "Assigned";
        } else if (statusFilter === "Completed") {
          matchesStatus = summary.statusGroup === "Completed";
        } else if (statusFilter === "Cancelled") {
          matchesStatus = summary.statusGroup === "Cancelled";
        } else {
          matchesStatus = summary.statusGroup === statusFilter;
        }
      } else {
        matchesStatus = browseOnly ? summary.statusGroup === "Active" : statusFilter === "All" || summary.statusGroup === statusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [appliedContractIds, applicationByContractId, browseOnly, isManager, search, statusFilter, summaries, user?._id, user?.id]);

  const openParentScreen = (screen, params) => {
    navigation.navigate(screen, params);
  };

  const renderManagerCard = (summary) => {
    const { contract, workerRows, workersRequired, workersAssigned, remainingPositions, paymentPerWorker, currency, progress, statusLabel } = summary;

    return (
      <Pressable
        key={contract._id || contract.id}
        style={styles.card}
        onPress={() => openParentScreen("ContractDetails", { contractId: contract._id || contract.id })}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{contract.title || "Untitled contract"}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {contract.description || "No description available"}
            </Text>
          </View>
          <Text style={[styles.badge, getStatusStyle(summary.statusGroup)]}>{statusLabel}</Text>
        </View>

        <View style={styles.chipRow}>
          <Chip label="Budget" value={formatMoney(contract.amount, currency)} />
          <Chip label="Workers" value={`${workersAssigned}/${workersRequired} assigned`} />
          <Chip label="Remaining" value={String(remainingPositions)} />
          <Chip label="Payment / worker" value={`${formatMoney(paymentPerWorker, currency)} each`} />
          <Chip label="Type" value={formatStatusLabel(contract.paymentType || contract.contractType || "single")} />
          <Chip label="Created" value={formatDate(contract.createdAt)} />
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>Work progress</Text>
            <Text style={styles.progressValue}>{progress}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
          </View>
        </View>

        <View style={styles.workerSection}>
          <View style={styles.workerSectionHeader}>
            <Text style={styles.workerSectionTitle}>Worker statuses</Text>
            <Text style={styles.workerSectionHint}>
              {summary.approvedCount} approved, {summary.rejectedCount} rejected
            </Text>
          </View>
          {workerRows.length ? (
            workerRows.slice(0, 3).map(({ worker, milestone, workStatus, paymentStatus }, index) => {
              const amount = milestone?.amount || contract.amount / Math.max(workersRequired, 1);
              return (
                <View key={`${contract._id || contract.id}-worker-${index}`} style={styles.workerRow}>
                  <View style={[styles.workerDot, getWorkerDotStyle(workStatus)]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workerName}>{getDisplayName(worker)}</Text>
                    <Text style={styles.workerMeta}>Work: {workStatus}</Text>
                    <Text style={styles.workerMeta}>Payment: {paymentStatus}</Text>
                  </View>
                  <Text style={styles.workerMoney}>{formatMoney(amount, currency)}</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyInline}>No assigned workers yet.</Text>
          )}
          {workerRows.length > 3 ? <Text style={styles.workerMore}>+{workerRows.length - 3} more workers</Text> : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{getDisplayName(contract.buyer || contract.seller)}</Text>
          <Text style={styles.footerHint}>Tap for details</Text>
        </View>

        <View style={styles.actionRow}>
          <ActionButton title="Open Contract Details" onPress={() => openParentScreen("ContractDetails", { contractId: contract._id || contract.id })} />
          <ActionButton secondary title="View Applications" onPress={() => openParentScreen("Applications", { contractId: contract._id || contract.id })} />
        </View>
      </Pressable>
    );
  };

  const renderHustlerCard = (summary) => {
    const { contract, currency, selectedWorkerRow, statusLabel, paymentPerWorker } = summary;
    const application = applicationByContractId.get(summary.contractId) || null;
    const applicationStatus = application ? formatApplicationStatus(application.status) : null;
    const workStatus = selectedWorkerRow ? selectedWorkerRow.workStatus : null;
    const paymentStatus = selectedWorkerRow ? selectedWorkerRow.paymentStatus : null;

    // Derive the most meaningful status to show on the badge
    const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
    const cardStatus =
      selectedWorkerRow?.paymentStatus === "Payment Released"
        ? "Completed"
        : selectedWorkerRow?.paymentStatus === "Refunded to Manager" || selectedWorkerRow?.workStatus === "Refunded"
        ? "Refunded"
        : !selectedWorkerRow && disputeOutcome === "split"
        ? "Settled"
        : !selectedWorkerRow && (disputeOutcome === "refund_manager" || disputeOutcome === "refund_to_escrow")
        ? "Refunded"
        : !selectedWorkerRow && disputeOutcome === "release_full_payment"
        ? "Completed"
        : workStatus || applicationStatus || statusLabel;

    const isAssigned = Boolean(selectedWorkerRow);
    const isApplied = Boolean(application);
    // isPaid: true when payment was released (green cash icon)
    // isRefunded: true when payment was sent back to manager (distinct icon)
    const isPaid = selectedWorkerRow?.paymentStatus === "Payment Released";
    const isRefunded = selectedWorkerRow?.paymentStatus === "Refunded to Manager" || selectedWorkerRow?.workStatus === "Refunded";

    return (
      <Pressable
        key={contract._id || contract.id}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
        onPress={() => openParentScreen("ContractDetails", { contractId: contract._id || contract.id })}
        accessibilityRole="button"
        accessibilityLabel={`Open contract: ${contract.title || "Untitled"}`}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{contract.title || "Untitled contract"}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {contract.description || "No description"}
            </Text>
          </View>
          <Text style={[styles.badge, getStatusStyle(cardStatus)]}>{cardStatus}</Text>
        </View>

        {/* Key info chips */}
        <View style={styles.chipRow}>
          {contract.jobCategory ? (
            <Chip label="Category" value={contract.jobCategory} />
          ) : null}
          {contract.workLocation ? (
            <Chip label="Location" value={contract.workLocation} />
          ) : null}
          <Chip
            label={isAssigned ? "Your payout" : "Budget"}
            value={formatMoney(isAssigned ? paymentPerWorker : contract.amount, currency)}
          />
          {contract.deadline ? (
            <Chip label="Deadline" value={formatDate(contract.deadline)} />
          ) : null}
          {contract.numWorkers > 1 ? (
            <Chip label="Positions" value={String(contract.numWorkers)} />
          ) : null}
        </View>

        {/* Application status row */}
        {isApplied && !isAssigned ? (
          <View style={[styles.statusRow, getApplicationRowStyle(application?.status)]}>
            <Ionicons
              name={lower(application?.status) === "accepted" ? "checkmark-circle-outline" : lower(application?.status) === "rejected" ? "close-circle-outline" : "time-outline"}
              size={15}
              color={lower(application?.status) === "accepted" ? colors.success : lower(application?.status) === "rejected" ? colors.danger : colors.warning}
            />
            <Text style={styles.statusText}>Application: {applicationStatus}</Text>
            {application?.createdAt ? (
              <Text style={styles.statusMeta}>· {formatDate(application.createdAt)}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Work status row (when assigned to this hustler) */}
        {isAssigned ? (
          <View style={styles.workStatusBlock}>
            <View style={styles.workStatusRow}>
              <View style={[styles.workerDot, getWorkerDotStyle(workStatus)]} />
              <Text style={styles.statusText}>Work: {workStatus}</Text>
            </View>
            <View style={styles.workStatusRow}>
              <Ionicons
                name={isPaid ? "cash-outline" : isRefunded ? "return-down-back-outline" : "lock-closed-outline"}
                size={14}
                color={isPaid ? colors.success : isRefunded ? "#D97706" : colors.muted}
              />
              <Text style={[styles.statusText, isPaid && styles.statusTextPaid, isRefunded && styles.statusTextRefunded]}>
                Payment: {paymentStatus}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{getDisplayName(contract.buyer || contract.seller) || "Manager"}</Text>
          <Text style={styles.footerHint}>Tap to view details →</Text>
        </View>
      </Pressable>
    );
  };

  const activeSummaryCount = summaries.filter((item) => item.statusGroup === "Active").length;
  const assignedSummaryCount = summaries.filter((item) => item.statusGroup === "Assigned").length;
  const inProgressSummaryCount = summaries.filter((item) => item.statusGroup === "In Progress").length;
  const completedSummaryCount = summaries.filter((item) => item.statusGroup === "Completed").length;

  return (
    <ScreenShell
      title={isManager ? "My Contracts" : browseOnly ? "Browse Contracts" : "My Contracts"}
      subtitle={
        isManager
          ? "Review created contracts, worker progress, and payouts at a glance."
          : browseOnly
            ? "Browse new open contracts posted by managers."
            : "Track the contracts you applied for and their current status."
      }
      scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => loadContracts({ isRefresh: true })} /> }}
    >
      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contracts, workers, or locations"
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Text style={styles.searchHint}>Find contracts by title, description, manager, location, or worker name.</Text>
      </View>

      {isManager ? (
        <>
          <View style={styles.filterRow}>
            {MANAGER_FILTERS.map((filter) => {
              const active = statusFilter === filter;
              return (
                <Pressable
                  key={filter}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatusFilter(filter)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.summaryRow}>
            <InfoStat label="All" value={String(summaries.length)} />
            <InfoStat label="Active" value={String(activeSummaryCount)} />
            <InfoStat label="Assigned" value={String(assignedSummaryCount)} />
            <InfoStat label="In Progress" value={String(inProgressSummaryCount)} />
            <InfoStat label="Completed" value={String(completedSummaryCount)} />
          </View>
        </>
      ) : browseOnly ? (
        <View style={styles.summaryRow}>
          <InfoStat label="Open" value={String(filteredSummaries.length)} />
          <InfoStat label="Available" value={String(summaries.filter((item) => item.statusGroup === "Active").length)} />
        </View>
      ) : null}

      {!browseOnly && !isManager ? (
        <>
          <View style={styles.filterRow}>
            {HUSTLER_FILTERS.map((filter) => {
              const active = statusFilter === filter;
              return (
                <Pressable
                  key={filter}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatusFilter(filter)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.summaryRow}>
            <InfoStat label="Applied" value={String(appliedContractIds.length)} />
            <InfoStat label="Assigned" value={String(summaries.filter((s) => Boolean(s.selectedWorkerRow)).length)} />
            <InfoStat label="Completed" value={String(summaries.filter((s) => s.statusGroup === "Completed").length)} />
          </View>
        </>
      ) : null}

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading contracts</Text>
          <Text style={styles.stateText}>Fetching live contract data from the backend.</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : filteredSummaries.length ? (
        <View style={styles.listStack}>{filteredSummaries.map((summary) => (isManager ? renderManagerCard(summary) : renderHustlerCard(summary)))}</View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No contracts found</Text>
          <Text style={styles.emptyText}>
            {browseOnly
              ? search
                ? "Try a different search term."
                : "Open contracts posted by managers will appear here."
              : search || statusFilter !== "All"
                ? "Try changing your search or filter."
                : "You haven't applied to any contracts yet."}
          </Text>
          {!browseOnly && !isManager && !search && statusFilter === "All" ? (
            <Pressable
              style={styles.browseButton}
              onPress={() => navigation.navigate("ContractDetails", { browseOnly: true })}
            >
              <Ionicons name="search-outline" size={16} color="#fff" />
              <Text style={styles.browseButtonText}>Browse open contracts</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </ScreenShell>
  );
}

function InfoStat({ label, value }) {
  return (
    <View style={styles.infoStat}>
      <Text style={styles.infoStatLabel}>{label}</Text>
      <Text style={styles.infoStatValue}>{value}</Text>
    </View>
  );
}

function Chip({ label, value }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({ title, onPress, secondary = false }) {
  return (
    <Pressable style={[styles.actionButton, secondary && styles.actionButtonSecondary]} onPress={onPress}>
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.5),
    gap: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchHint: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: colors.text,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoStat: {
    minWidth: "18%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing(1.25),
    gap: 4,
  },
  infoStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  listStack: {
    gap: spacing(1),
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
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },
  headerRow: {
    flexDirection: "row",
    gap: spacing(1),
    alignItems: "flex-start",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  badge: {
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    textTransform: "capitalize",
  },
  badgeCompleted: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
  },
  badgeCancelled: {
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
  },
  badgeInProgress: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
  },
  badgeActionRequired: {
    backgroundColor: "#FFEDD5",
    color: "#C2410C",
  },
  badgeAssigned: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
  },
  badgeActive: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
  },
  badgeNeutral: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
  },
  // Dispute resolution badge colours
  badgeRefunded: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
  },
  badgeSettled: {
    backgroundColor: "#EDE9FE",
    color: "#6D28D9",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  chipLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  chipValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  progressBlock: {
    gap: 8,
  },
  progressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  progressLabel: {
    color: colors.muted,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  progressValue: {
    color: colors.text,
    fontWeight: "800",
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  workerSection: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing(1.25),
    gap: 10,
  },
  workerSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  workerSectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  workerSectionHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  workerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  workerDotApproved: {
    backgroundColor: "#22C55E",
  },
  workerDotRejected: {
    backgroundColor: "#EF4444",
  },
  workerDotSubmitted: {
    backgroundColor: "#8B5CF6",
  },
  workerDotNeutral: {
    backgroundColor: "#94A3B8",
  },
  workerName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
  workerMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  workerMoney: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 12,
  },
  workerMore: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  emptyInline: {
    color: colors.muted,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },
  footerHint: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
  },
  actionRow: {
    gap: 8,
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  actionButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  actionButtonTextSecondary: {
    color: colors.text,
  },
  statusRow: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statusText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  statusMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  statusTextPaid: {
    color: colors.success,
  },
  statusTextRefunded: {
    color: "#D97706",
  },
  workStatusBlock: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  workStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  browseButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});

