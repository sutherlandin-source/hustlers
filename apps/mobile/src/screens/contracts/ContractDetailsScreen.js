import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";
import { formatStatusLabel, matchesId } from "../../utils/status.js";

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function moneyExact(amount, currency = "KSH") {
  const numeric = Number(amount || 0);
  return `${currency} ${numeric.toFixed(2)}`;
}

function getApplicationContractId(application) {
  const contract = application?.contractId || application?.contract || {};
  return contract?._id || contract?.id || application?.contractId?._id || application?.contractId || application?.contract;
}

function formatApplicationStatus(status) {
  const normalized = lower(status).replace(/_/g, " ");
  if (!normalized) return "Not Applied";
  if (normalized === "pending") return "Pending Review";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "cancelled") return "Cancelled";
  return formatStatusLabel(status);
}

function hasKycVerification(user) {
  return Boolean(String(user?.idNumber || "").trim() && String(user?.mpesaNumber || "").trim());
}

function hasVerifiedKyc(user) {
  // Server requires verificationStatus === "approved" before allowing applications.
  // "pending" + filled KYC fields is NOT enough — admin must have approved.
  const verificationStatus = lower(user?.verificationStatus);
  return verificationStatus === "approved";
}

function normalizeMilestones(contractPayload, milestonePayload) {
  if (Array.isArray(contractPayload?.milestones) && contractPayload.milestones.length) {
    return contractPayload.milestones;
  }

  if (Array.isArray(milestonePayload?.milestones)) return milestonePayload.milestones;
  if (Array.isArray(milestonePayload)) return milestonePayload;
  return [];
}

function getWorkerStatus(milestone, contractStatus = "") {
  const workStatus = lower(milestone?.workStatus || milestone?.status || contractStatus || "pending");
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);

  if (workStatus === "approved" || paymentStatus === "payment released" || paymentStatus === "released") return "Approved";
  if (paymentStatus === "refunded" || paymentStatus === "refunded_to_manager") return "Refunded";
  if (workStatus === "rejected" || workStatus === "needs revision" || workStatus === "needs_revision") return "Rejected";
  if (workStatus === "work_submitted" || workStatus === "submitted") return "Submitted";
  if (workStatus === "in_progress") return "In Progress";
  if (workStatus === "accepted") return "Accepted";
  if (workStatus === "pending") return "Pending";
  return formatStatusLabel(workStatus);
}

function getPaymentStatus(milestone, workStatus) {
  const paymentStatus = lower(milestone?.paymentStatus || milestone?.paymentState);
  if (paymentStatus === "payment released" || paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded" || paymentStatus === "refunded_to_manager" || paymentStatus === "refunded to manager") return "Refunded to Manager";
  if (paymentStatus === "payment secured" || paymentStatus === "secured") return "Payment Secured";
  if (paymentStatus === "on hold" || paymentStatus === "on_hold") return "Payment On Hold";
  if (paymentStatus === "not released") return "Not Released";
  if (paymentStatus) return formatStatusLabel(paymentStatus);
  if (workStatus === "Approved") return "Payment Released";
  if (workStatus === "Refunded") return "Refunded to Manager";
  if (workStatus === "Rejected") return "Not Released";
  return "Payment Secured";
}

function workerStatusDot(status) {
  const normalized = lower(status);
  if (normalized === "approved") return styles.dotApproved;
  if (normalized === "rejected") return styles.dotRejected;
  if (normalized === "submitted") return styles.dotSubmitted;
  if (normalized === "in progress") return styles.dotInProgress;
  return styles.dotNeutral;
}

function buildWorkerRows(contract, milestones) {
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
    workerMap.set(String(workerId), {
      worker,
      milestone: null,
    });
  });

  contractMilestones.forEach((milestone) => {
    const worker = milestone?.assignedTo || milestone?.submittedBy || null;
    const workerId = worker?._id || worker?.id || worker;
    if (!workerId) return;
    const existing = workerMap.get(String(workerId));
    const nextTimestamp = toTimestamp(milestone?.updatedAt || milestone?.submittedAt || milestone?.approvedAt || milestone?.createdAt);
    const existingTimestamp = existing ? toTimestamp(existing.milestone?.updatedAt || existing.milestone?.submittedAt || existing.milestone?.approvedAt || existing.milestone?.createdAt) : -1;

    if (!existing || nextTimestamp >= existingTimestamp) {
      workerMap.set(String(workerId), {
        worker,
        milestone,
      });
    }
  });

  return {
    contractMilestones,
    workerRows: Array.from(workerMap.values()),
  };
}

function summarizeWorkerRow(row, contract, workersRequired) {
  const milestone = row.milestone || {};
  const workStatus = getWorkerStatus(milestone, contract?.status);
  const paymentStatus = getPaymentStatus(milestone, workStatus);
  const currency = contract?.currency || milestone?.currency || "KSH";
  const payoutGross = Number(contract?.payoutSummary?.grossPerHustler);
  const payoutCommission = Number(contract?.payoutSummary?.commissionPerHustler);
  const payoutNet = Number(contract?.payoutSummary?.netPerHustler);
  const fallbackGross = Number(contract?.amount || 0) / Math.max(workersRequired, 1);
  const gross = Number.isFinite(Number(milestone?.grossAmount))
    ? Number(milestone.grossAmount)
    : Number.isFinite(Number(milestone?.amount))
      ? Number(milestone.amount)
      : Number.isFinite(payoutGross)
        ? payoutGross
        : Number.isFinite(fallbackGross)
          ? fallbackGross
          : 0;
  const commission = Number.isFinite(Number(milestone?.commissionAmount))
    ? Number(milestone.commissionAmount)
    : Number.isFinite(payoutCommission)
      ? payoutCommission
      : Number((Number(gross || 0) * 0.025).toFixed(2));
  const net = Number.isFinite(Number(milestone?.netAmount))
    ? Number(milestone.netAmount)
    : Number.isFinite(payoutNet)
      ? payoutNet
      : Number((Number(gross || 0) - Number(commission || 0)).toFixed(2));

  return {
    ...row,
    workStatus,
    paymentStatus,
    currency,
    gross,
    commission,
    net,
    isApproved: workStatus === "Approved",
    isRejected: workStatus === "Rejected",
    isSubmitted: workStatus === "Submitted",
    isOwner: Boolean(row.isOwner),
    submittedAt: milestone?.submittedAt || null,
    approvedAt: milestone?.approvedAt || null,
    rejectedAt: milestone?.rejectedAt || milestone?.updatedAt || null,
    rejectionReason: milestone?.rejectionReason || "",
    rejectionComments: milestone?.rejectionComments || "",
  };
}

function getDisputeState(contract) {
  const status = lower(contract?.status);
  const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
  const disputeReleasedAt = contract?.metadata?.disputePaymentReleasedAt;
  const disputeRemainingWorkers = contract?.metadata?.disputeRemainingWorkers;
  const disputedAt = contract?.disputedAt;

  // release_payment — only show Resolved once all workers are paid out
  if (disputeOutcome === "release_full_payment" || disputeReleasedAt) {
    const stillPending = typeof disputeRemainingWorkers === "number" && disputeRemainingWorkers > 0;
    if (stillPending) {
      return {
        label: "Partially Resolved",
        detail: `Payment released for some workers. ${disputeRemainingWorkers} worker${disputeRemainingWorkers === 1 ? "" : "s"} still pending.`,
      };
    }
    return {
      label: "Resolved",
      detail: "Payment released after dispute review",
    };
  }

  // refund_manager — server now writes "refund_manager"; keep "refund_to_escrow" as fallback for old records
  if (disputeOutcome === "refund_manager" || disputeOutcome === "refund_to_escrow") {
    return {
      label: "Resolved",
      detail: "Refunded to manager after dispute review",
    };
  }

  // split_payment
  if (disputeOutcome === "split") {
    return {
      label: "Resolved",
      detail: "Escrow split between manager and hustler after dispute review",
    };
  }

  // close — admin closed without financial action
  if (disputeOutcome === "closed") {
    return {
      label: "Closed",
      detail: "Dispute closed by admin",
    };
  }

  if (status === "disputed" || disputedAt) {
    return {
      label: "Open",
      detail: "A dispute exists for this contract",
    };
  }

  return null;
}

function hasOpenDispute(contract) {
  const status = lower(contract?.status);
  const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
  const disputeReleasedAt = contract?.metadata?.disputePaymentReleasedAt;
  const resolvedOutcomes = ["release_full_payment", "refund_manager", "refund_to_escrow", "split", "closed"];
  const isResolved = resolvedOutcomes.includes(disputeOutcome) || Boolean(disputeReleasedAt);
  return (status === "disputed" || contract?.disputedAt) && !isResolved;
}

function isAdminReleasedContract(contract) {
  const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
  const resolvedOutcomes = ["release_full_payment", "refund_manager", "refund_to_escrow", "split", "closed"];
  return resolvedOutcomes.includes(disputeOutcome) || Boolean(contract?.metadata?.disputePaymentReleasedAt);
}

export default function ContractDetailsScreen({ route, navigation }) {
  const { contractId } = route.params || {};
  const { user, role, accessToken } = useAuth();
  const isManager = String(role || "").toLowerCase() === "manager";
  const isHustler = String(role || "").toLowerCase() === "hustler";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [contract, setContract] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [applicationRecord, setApplicationRecord] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState("");
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [openChatLoading, setOpenChatLoading] = useState(false);
  const [openChatError, setOpenChatError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const hasApprovedKyc = hasVerifiedKyc(user);

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!contractId || !accessToken) {
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
        const promises = [
          apiRequest(`/contracts/${contractId}`, { token: accessToken }),
          apiRequest("/milestones", {
            token: accessToken,
            query: isHustler
              ? { contractId, sellerOnly: true, limit: 50 }
              : { contractId, limit: 50 },
          }).catch(() => ({ milestones: [] })),
        ];

        if (isHustler) {
          promises.push(apiRequest("/applications/hustler/my", { token: accessToken }).catch(() => ({ applications: [] })));
        }

        const [contractPayload, milestonePayload, applicationPayload] = await Promise.all(promises);

        setContract(contractPayload?.contract || contractPayload || null);
        setMilestones(normalizeMilestones(contractPayload?.contract || contractPayload, milestonePayload));
        if (isHustler) {
          const applications = Array.isArray(applicationPayload?.applications)
            ? applicationPayload.applications
            : Array.isArray(applicationPayload)
              ? applicationPayload
              : [];
          const match = applications.find((application) => String(getApplicationContractId(application)) === String(contractId));
          setApplicationRecord(match || null);
          // Only pre-tick terms if the application is active (not cancelled or rejected)
          const matchStatus = lower(match?.status);
          const isReapplyable = matchStatus === "cancelled" || matchStatus === "rejected";
          setHasAgreedToTerms(Boolean(match) && !isReapplyable);
        } else {
          setApplicationRecord(null);
        }
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Unable to load contract");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, contractId, isHustler]
  );

  useEffect(() => {
    load();
  }, [load]);

  const currentUserId = user?._id || user?.id;
  const { workerRows: rawWorkerRows } = useMemo(() => buildWorkerRows(contract, milestones), [contract, milestones]);
  const applicationStatusLabel = useMemo(() => formatApplicationStatus(applicationRecord?.status), [applicationRecord]);
  const hasApplication = Boolean(applicationRecord && !["cancelled", "rejected"].includes(lower(applicationRecord.status)));
  const canApply =
    isHustler &&
    !isManager &&
    ["pending", "active"].includes(lower(contract?.status)) &&
    (!applicationRecord || ["cancelled", "rejected"].includes(lower(applicationRecord.status)));

  const workersRequired = Number(contract?.numWorkers || contract?.metadata?.numWorkers || rawWorkerRows.length || 1);
  const workersAssigned = rawWorkerRows.length;
  const remainingPositions = Math.max(0, workersRequired - workersAssigned);
  const acceptedCount = rawWorkerRows.filter((row) => getWorkerStatus(row.milestone, contract?.status) === "Accepted").length;
  const submittedCount = rawWorkerRows.filter((row) => getWorkerStatus(row.milestone, contract?.status) === "Submitted").length;
  const approvedCount = rawWorkerRows.filter((row) => getWorkerStatus(row.milestone, contract?.status) === "Approved").length;
  const rejectedCount = rawWorkerRows.filter((row) => getWorkerStatus(row.milestone, contract?.status) === "Rejected").length;
  const completedCount = rawWorkerRows.filter((row) => row.milestone?.paymentStatus && lower(row.milestone.paymentStatus) === "released").length;
  const allWorkersSettled =
    rawWorkerRows.length > 0 &&
    rawWorkerRows.every((row) => {
      const paymentStatus = lower(row.paymentStatus);
      return paymentStatus === "payment released" || paymentStatus === "refunded to manager";
    });

  const teamRows = useMemo(
    () =>
      rawWorkerRows
        .map((row) => {
          return summarizeWorkerRow(
            {
              ...row,
              isOwner:
                matchesId(row.worker, currentUserId) ||
                matchesId(row.worker?._id, currentUserId) ||
                matchesId(row.milestone?.assignedTo, currentUserId) ||
                matchesId(row.milestone?.assignedTo?._id, currentUserId) ||
                matchesId(row.milestone?.submittedBy, currentUserId) ||
                matchesId(row.milestone?.submittedBy?._id, currentUserId),
            },
            contract,
            workersRequired
          );
        })
        .filter((row) => {
          if (isManager) return true;
          // Hustler: only show their own row
          return (
            matchesId(row.worker, currentUserId) ||
            matchesId(row.worker?._id, currentUserId) ||
            matchesId(row.milestone?.assignedTo, currentUserId) ||
            matchesId(row.milestone?.assignedTo?._id, currentUserId) ||
            matchesId(row.milestone?.submittedBy, currentUserId) ||
            matchesId(row.milestone?.submittedBy?._id, currentUserId)
          );
        }),
    [contract, currentUserId, isManager, rawWorkerRows, workersRequired]
  );

  const currentUserRow = teamRows.find((row) => row.isOwner) || null;
  const payoutNet = Number(contract?.payoutSummary?.netPerHustler);
  const payoutGross = Number(contract?.payoutSummary?.grossPerHustler);
  const fallbackPayment = Number(contract?.amount || 0) / Math.max(workersRequired, 1);
  const paymentPerWorker = Number.isFinite(payoutNet) && payoutNet > 0 ? payoutNet : Number.isFinite(payoutGross) && payoutGross > 0 ? payoutGross : Number.isFinite(fallbackPayment) ? fallbackPayment : 0;
  const paymentSummary = useMemo(() => {
    const released = teamRows.filter((row) => row.paymentStatus === "Payment Released");
    const totalReleased = released.reduce((total, row) => total + Number(row.net || 0), 0);
    return { released, totalReleased };
  }, [teamRows]);

  const disputeState = useMemo(() => getDisputeState(contract), [contract]);

  const contractStatusLabel = useMemo(() => {
    if (!contract) return "Pending";
    if (isManager) {
      if (hasOpenDispute(contract)) return "Action Required";
      if (
        contract.status === "completed" ||
        contract.status === "terminated" ||
        (completedCount === workersAssigned && workersAssigned > 0) ||
        allWorkersSettled ||
        (["disputed", "terminated"].includes(lower(contract?.status)) && !hasOpenDispute(contract))
      ) return "Completed";
      if (rejectedCount > 0 && approvedCount > 0) return "Action Required";
      if (submittedCount > 0 || contract.status === "disputed") return "In Progress";
      if (workersAssigned > 0) return "Assigned";
      return "Active";
    }

    if (currentUserRow) {
      if (currentUserRow.paymentStatus === "Payment Released") return "Completed";
      if (currentUserRow.paymentStatus === "Refunded to Manager" || currentUserRow.workStatus === "Refunded") return "Refunded";
      if (currentUserRow.workStatus === "Rejected" && isAdminReleasedContract(contract)) return "Refunded";
      return currentUserRow.workStatus;
    }

    // No milestone row yet — fall back to contract-level status, but translate
    // post-dispute states into something meaningful for the hustler
    const disputeOutcome = lower(contract?.metadata?.disputeOutcome);
    if (disputeOutcome === "refund_manager" || disputeOutcome === "refund_to_escrow") return "Refunded";
    if (disputeOutcome === "split") return "Settled";
    if (disputeOutcome === "closed") return "Closed";
    if (disputeOutcome === "release_full_payment") return "Completed";
    return formatStatusLabel(contract.status);
  }, [approvedCount, allWorkersSettled, completedCount, contract, currentUserRow, isManager, rejectedCount, submittedCount, workersAssigned]);

  const openSubmission = (milestoneId, workerId) => {
    if (!milestoneId) return;
    navigation.navigate("TaskDetails", {
      milestoneId,
      workerId: workerId || undefined,
    });
  };

  const handleEditContract = () => {
    navigation.navigate("CreateContract", { contractId });
  };

  const handleDeleteContract = async () => {
    if (!contractId || !accessToken || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await apiRequest(`/contracts/${contractId}`, {
        token:  accessToken,
        method: "DELETE",
      });
      // Go back to contracts list after deletion
      navigation.navigate("Tabs", { screen: "Contracts" });
    } catch (err) {
      setDeleteError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not delete this contract. Please try again."
      );
      setDeleteLoading(false);
    }
  };



  const openContractChat = async () => {
    if (!contractId || !accessToken) return;
    setOpenChatLoading(true);
    setOpenChatError("");
    try {
      const result = await apiRequest(`/conversations/contract/${contractId}`, {
        token: accessToken,
        method: "POST",
      });
      const conversation =
        result?.conversation ||
        result?.data?.conversation ||
        result;
      const convId = conversation?._id || conversation?.id;
      if (convId) {
        navigation.navigate("Chat", {
          conversationId: String(convId),
          title: contract?.title || "Contract Chat",
        });
      } else {
        setOpenChatError("Could not open chat. Try again.");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "";
      // Contract has no assigned worker yet — fall back to the Messages tab
      if (err?.response?.status === 409 || msg.toLowerCase().includes("assigned hustler")) {
        setOpenChatError("Chat will be available once a worker is assigned to this contract.");
      } else {
        setOpenChatError(msg || "Could not open chat.");
      }
    } finally {
      setOpenChatLoading(false);
    }
  };

  const handleApply = async () => {
    if (!contractId || !accessToken) return;
    if (!hasApprovedKyc) {
      setApplyError("Your account must be approved by an admin before applying.");
      return;
    }
    if (!hasAgreedToTerms) {
      setApplyError("Please agree to the terms before applying.");
      return;
    }

    setApplyLoading(true);
    setApplyError("");
    setApplySuccess("");
    const requestBody = {
      coverLetter: `Application for ${contract?.title || "this job"}`,
      proposedRate: contract?.amount,
      estimatedDuration: "",
    };

    if (__DEV__) {
      console.log("[ContractDetailsScreen] apply request", {
        endpoint: `/applications/${contractId}`,
        method: "POST",
        contractId,
        userId: user?._id || user?.id,
        body: requestBody,
      });
    }

    try {
      const payload = await apiRequest(`/applications/${contractId}`, {
        token: accessToken,
        method: "POST",
        body: requestBody,
      });
      const submittedApplication = payload?.application || payload || null;
      setApplicationRecord(submittedApplication);
      setHasAgreedToTerms(true);
      setApplySuccess("Application submitted successfully!");
      setTimeout(() => {
        load({ isRefresh: true });
      }, 600);
    } catch (err) {
      if (__DEV__) {
        console.log("[ContractDetailsScreen] apply error", {
          contractId,
          userId: user?._id || user?.id,
          status: err?.response?.status,
          response: err?.response?.data,
          message: err?.message,
        });
      }
      setApplyError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.response?.data?.stack ||
          err?.message ||
          "Failed to submit application"
      );
    } finally {
      setApplyLoading(false);
    }
  };

  return (
    <ScreenShell
      title={contract?.title || "Contract details"}
      subtitle={contract?.description || "Review the live contract information, worker status, and payment progress."}
      showBack
      onBackPress={() => navigation.goBack()}
      scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} /> }}
    >
      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading contract</Text>
          <Text style={styles.stateText}>Fetching the contract, assigned workers, submissions, and payment details.</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Contract unavailable</Text>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : contract ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Contract status</Text>
                <Text style={styles.heroTitle}>{contractStatusLabel}</Text>
              </View>
              <Text style={styles.statusBadge}>{contractStatusLabel}</Text>
            </View>

            <View style={styles.chipRow}>
              <Chip label="Type" value={contract.paymentType || contract.contractType || "Single Payment"} />
              <Chip label="Currency" value={contract.currency || "KSH"} />
              <Chip label="Assigned" value={workersAssigned ? `${workersAssigned}/${workersRequired}` : "Not assigned"} />
            </View>
          </View>

          <Section title="Contract Overview">
            <Detail label="Title" value={contract.title || "Untitled contract"} />
            <Detail label="Description" value={contract.description || "No description available"} />
            <Detail label="Contract type" value={contract.contractType || contract.paymentType || "Single Payment Contract"} />
            <Detail label="Total amount" value={formatMoney(contract.amount, contract.currency || "KSH")} />
            <Detail label="Payment type" value={contract.paymentType || "Single Payment"} />
            <Detail label="Created date" value={formatDate(contract.createdAt)} />
            <Detail label="Start date" value={formatDate(contract.startDate)} />
            <Detail label="Contract status" value={contractStatusLabel} />
            <Detail label="Project manager" value={getDisplayName(contract.buyer)} />
          </Section>

          {!isManager ? (
            <Section title="Manager Information">
              <Detail label="Manager" value={getDisplayName(contract.buyer)} />
              <Detail label="Location" value={contract?.buyer?.location || contract?.buyer?.workLocation || "Not shared"} />
              <Detail label="Rating" value={Number(contract?.buyer?.averageRating || 0) > 0 ? `${Number(contract.buyer.averageRating).toFixed(1)} / 5` : "Not available"} />
            </Section>
          ) : null}

          {!isManager ? (
            <Section title="Application Status">
              <Detail label="Status" value={applicationStatusLabel} />
              <Detail
                label="Applied on"
                value={applicationRecord?.appliedAt ? formatDate(applicationRecord.appliedAt) : "Not applied yet"}
              />
              <Detail
                label="Proposed rate"
                value={applicationRecord?.proposedRate !== undefined && applicationRecord?.proposedRate !== null ? moneyExact(applicationRecord.proposedRate, contract.currency || "KSH") : "Not specified"}
              />
              <Detail label="Cover letter" value={applicationRecord?.coverLetter || "No cover letter provided"} />
              {applicationRecord?.rejectionReason ? <Detail label="Rejection reason" value={applicationRecord.rejectionReason} /> : null}
            </Section>
          ) : null}

          <Section title="Team Information">
            <Detail label="Workers required" value={String(workersRequired)} />
            <Detail label="Workers assigned" value={String(workersAssigned)} />
            <Detail label="Remaining positions" value={String(remainingPositions)} />
            <Detail label="Accepted hustlers" value={String(acceptedCount)} />
          </Section>

          <Section title={isManager ? "Assigned Workers" : "Your Assignment"}>
            {teamRows.length ? (
              teamRows.map((row) => {
                const milestoneId = row.milestone?._id || row.milestone?.id;
                const workerId = row.worker?._id || row.worker?.id || row.worker;
                return (
                  <View key={row.worker?._id || row.worker?.id || row.worker?.email || row.workStatus} style={styles.workerCard}>
                    <View style={styles.workerHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workerName}>{getDisplayName(row.worker)}</Text>
                        <Text style={styles.workerMeta}>{row.isOwner ? "Your assignment" : "Assigned worker"}</Text>
                      </View>
                      <View style={[styles.workerBadge, row.isRejected && styles.badgeRejected, row.isApproved && styles.badgeApproved, row.isSubmitted && styles.badgeSubmitted]}>
                        <Text style={styles.workerBadgeText}>{row.workStatus}</Text>
                      </View>
                    </View>

                    <View style={styles.paymentGrid}>
                      <MiniRow label="Gross" value={moneyExact(row.gross, row.currency)} />
                      <MiniRow label="Commission" value={moneyExact(row.commission, row.currency)} />
                      <MiniRow label="Net" value={moneyExact(row.net, row.currency)} />
                      <MiniRow label="Payment status" value={row.paymentStatus} />
                    </View>

                    <View style={styles.statusStack}>
                      <StatusLine label="Work status" value={row.workStatus} />
                      <StatusLine label="Payment status" value={row.paymentStatus} />
                      <StatusLine label="Submitted" value={formatDate(row.submittedAt)} />
                      <StatusLine label="Approved" value={formatDate(row.approvedAt)} />
                      {row.isRejected ? <StatusLine label="Rejected" value={formatDate(row.rejectedAt)} /> : null}
                    </View>

                    {row.isRejected && row.rejectionReason ? <Text style={styles.rejectionText}>Reason: {row.rejectionReason}</Text> : null}
                    {row.isRejected && row.rejectionComments ? <Text style={styles.rejectionText}>Notes: {row.rejectionComments}</Text> : null}

                    {isManager && contract?.status !== "completed" && !isAdminReleasedContract(contract) ? (
                      <View style={styles.actionRow}>
                        <Pressable style={styles.primaryButton} onPress={() => openSubmission(milestoneId)}>
                          <Text style={styles.primaryButtonText}>{milestoneId ? "Open Submission" : "No Submission Yet"}</Text>
                        </Pressable>
                        {milestoneId ? (
                          <Pressable style={styles.secondaryButton} onPress={() => openSubmission(milestoneId)}>
                            <Text style={styles.secondaryButtonText}>Review and Approve</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : contract?.status === "completed" || isAdminReleasedContract(contract) ? (
                      <View style={styles.actionRow}>
                        <Pressable style={styles.secondaryButton} onPress={() => openSubmission(milestoneId, workerId)}>
                          <Text style={styles.secondaryButtonText}>Submission History</Text>
                        </Pressable>
                      </View>
                    ) : milestoneId ? (
                      <Pressable style={styles.primaryButton} onPress={() => openSubmission(milestoneId)}>
                        <Text style={styles.primaryButtonText}>Open Your Work</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No assigned workers found for this contract.</Text>
            )}
          </Section>

          {!isManager && canApply ? (
            <Section title="Apply for this Job">
              {applyError ? <Text style={styles.applyErrorText}>{applyError}</Text> : null}
              {applySuccess ? <Text style={styles.successText}>{applySuccess}</Text> : null}
              {!hasApprovedKyc ? <Text style={styles.warningText}>Your account must be approved by an admin before you can apply. Check your profile for verification status.</Text> : null}
              <View style={styles.termsCopy}>
                <Text style={styles.termsHeading}>Terms &amp; Conditions</Text>
                <Text style={styles.termsBody}>Review the full job details before applying.</Text>
                <Text style={styles.termsBody}>By applying, you agree to follow the contract terms set by the manager.</Text>
              </View>
              <Pressable
                style={[styles.termsRow, (applyLoading || !hasApprovedKyc) && styles.termsRowDisabled]}
                onPress={() => {
                  if (!applyLoading && hasApprovedKyc) {
                    setHasAgreedToTerms((value) => !value);
                  }
                }}
              >
                <View style={[styles.checkbox, hasAgreedToTerms && styles.checkboxChecked]}>
                  {hasAgreedToTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <Text style={styles.termsText}>I have read and understand the contract terms.</Text>
              </Pressable>
              {!hasAgreedToTerms && !applyLoading && hasApprovedKyc ? (
                <Text style={styles.termsHint}>Please agree to the terms to enable the apply button.</Text>
              ) : null}
              <Pressable
                style={[styles.primaryButton, (!hasAgreedToTerms || applyLoading || !hasApprovedKyc) && styles.buttonDisabled]}
                onPress={handleApply}
                disabled={!hasAgreedToTerms || applyLoading || !hasApprovedKyc}
              >
                {applyLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Apply Now</Text>
                )}
              </Pressable>
            </Section>
          ) : null}

          {/* Show success confirmation after apply — visible even after canApply flips false */}
          {!isManager && !canApply && applySuccess ? (
            <Section title="Application Submitted">
              <Text style={styles.successText}>{applySuccess}</Text>
            </Section>
          ) : null}

          {!isManager && hasApplication ? (
            <Section title="Application Update">
              <Detail label="Application status" value={applicationStatusLabel} />
              {applicationStatusLabel === "Pending Review" ? <Detail label="Status note" value="Your application is awaiting manager review." /> : null}
              {applicationStatusLabel === "Accepted" ? <Detail label="Status note" value="You have been selected for this contract." /> : null}
              {applicationStatusLabel === "Rejected" ? <Detail label="Status note" value="This application was not accepted." /> : null}
            </Section>
          ) : null}

          <Section title="Payment Summary">
            <Detail label="Escrow status" value={formatStatusLabel(contract.escrowStatus)} />
            <Detail label="Payment per worker" value={moneyExact(paymentPerWorker, contract.currency || "KSH")} hint="After commission" />
            <Detail label="Total released" value={moneyExact(paymentSummary.totalReleased, contract.currency || "KSH")} />
            <Text style={styles.summaryLabel}>Worker payments</Text>
            {teamRows.length ? (
              teamRows.map((row) => (
                <View key={`payment-${row.worker?._id || row.worker?.id || row.worker?.email}`} style={styles.paymentWorkerCard}>
                  <Text style={styles.workerName}>{getDisplayName(row.worker)}</Text>
                  <Text style={styles.paymentAmount}>{moneyExact(row.net, row.currency)}</Text>
                  <Text style={styles.paymentState}>{row.paymentStatus}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No worker payments available yet.</Text>
            )}
          </Section>

          {disputeState ? (
            <Section title="Disputes">
              <Detail label="Dispute status" value={disputeState.label} />
              <Detail label="Details" value={disputeState.detail} />
              {contract.userDisputeId ? <Detail label="Dispute ref" value={String(contract.userDisputeId)} /> : null}
              {/* Navigate to full dispute screen if a dispute exists */}
              {contract.disputeId || contract.userDisputeId ? (
                <ActionButton
                  title="View Dispute Details"
                  onPress={() => navigation.navigate("Dispute", {
                    disputeId: contract.disputeId || contract.userDisputeId,
                    contractTitle: contract.title,
                  })}
                />
              ) : null}
            </Section>
          ) : null}

          <View style={styles.actions}>
            {/* ── Manager: Edit contract (draft/open only) ── */}
            {isManager && (lower(contract?.status) === "draft" || lower(contract?.status) === "open" || lower(contract?.status) === "pending") ? (
              <ActionButton
                secondary
                title="Edit Contract"
                onPress={handleEditContract}
              />
            ) : null}

            {/* ── Manager: Add work stage ── */}
            {isManager && lower(contract?.status) !== "completed" && lower(contract?.status) !== "cancelled" && lower(contract?.status) !== "terminated" ? (
              <ActionButton
                secondary
                title="Add Work Stage"
                onPress={() => navigation.navigate("CreateMilestone")}
              />
            ) : null}

            {/* ── Manager: Delete draft contract ── */}
            {isManager && (lower(contract?.status) === "draft" || lower(contract?.status) === "pending") ? (
              <>
                {deleteError ? (
                  <Text style={[styles.chatErrorText, { color: colors.danger }]}>{deleteError}</Text>
                ) : null}
                <ActionButton
                  secondary
                  title={deleteLoading ? "Deleting…" : "Delete Draft"}
                  onPress={handleDeleteContract}
                  disabled={deleteLoading}
                />
              </>
            ) : null}

            <ActionButton
              title={openChatLoading ? "Opening chat…" : "Open Contract Messages"}
              onPress={openContractChat}
              disabled={openChatLoading}
            />
            {openChatError ? (
              <Text style={styles.chatErrorText}>{openChatError}</Text>
            ) : null}
            {currentUserRow?.milestone?._id || currentUserRow?.milestone?.id ? (
              <ActionButton
                secondary
                title={isManager ? "Open Work Review" : "View Assigned Work"}
                onPress={() => openSubmission(currentUserRow.milestone._id || currentUserRow.milestone.id)}
              />
            ) : null}
            {/* Raise dispute — available to both hustlers and managers when no open dispute exists */}
            {!hasOpenDispute(contract) && lower(contract?.status) !== "completed" && lower(contract?.status) !== "cancelled" ? (
              <ActionButton
                secondary
                title="Raise a Dispute"
                onPress={() => navigation.navigate("RaiseDispute", {
                  contractId: contractId,
                  contractTitle: contract?.title,
                })}
              />
            ) : null}
            {/* View dispute — when contract is already disputed */}
            {hasOpenDispute(contract) && contract?.disputeId ? (
              <ActionButton
                title="View Open Dispute"
                onPress={() => navigation.navigate("Dispute", {
                  disputeId: contract.disputeId,
                  contractTitle: contract.title,
                })}
              />
            ) : null}
            {/* Leave a Review — hustler reviews the manager after payment released */}
            {isHustler && currentUserRow?.paymentStatus === "Payment Released" ? (
              <ActionButton
                title="Leave a Review"
                onPress={() => {
                  const managerId  = contract?.buyer?._id || contract?.buyer?.id || contract?.buyer;
                  const managerName = getDisplayName(contract?.buyer) || "Manager";
                  navigation.navigate("Reviews", {
                    userId:     String(managerId || ""),
                    userName:   managerName,
                    contractId: contractId,
                    revieweeId: String(managerId || ""),
                    canReview:  true,
                  });
                }}
              />
            ) : null}
            {/* Leave a Review — manager reviews each hustler after payment released */}
            {isManager && (lower(contract?.status) === "completed" || teamRows.some((row) => row.paymentStatus === "Payment Released")) ? (
              teamRows
                .filter((row) => row.paymentStatus === "Payment Released")
                .map((row) => {
                  const hustlerId   = row.worker?._id || row.worker?.id || String(row.worker || "");
                  const hustlerName = getDisplayName(row.worker) || "Worker";
                  return hustlerId ? (
                    <ActionButton
                      key={`review-${hustlerId}`}
                      title={`Review ${hustlerName}`}
                      onPress={() =>
                        navigation.navigate("Reviews", {
                          userId:     hustlerId,
                          userName:   hustlerName,
                          contractId: contractId,
                          revieweeId: hustlerId,
                          canReview:  true,
                        })
                      }
                    />
                  ) : null;
                })
            ) : null}
          </View>
        </>
      ) : null}
    </ScreenShell>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionDivider} />
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function Chip({ label, value }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

function Detail({ label, value, hint }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={styles.detailValue}>{value || "-"}</Text>
        {hint ? <Text style={styles.detailHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

function MiniRow({ label, value }) {
  return (
    <View style={styles.miniRow}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value || "-"}</Text>
    </View>
  );
}

function StatusLine({ label, value }) {
  return (
    <View style={styles.statusLine}>
      <Text style={styles.statusLineLabel}>{label}</Text>
      <Text style={styles.statusLineValue}>{value || "-"}</Text>
    </View>
  );
}

function ActionButton({ title, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      style={[styles.actionButton, secondary && styles.actionButtonSecondary, disabled && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  heroLabel: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    textTransform: "capitalize",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minWidth: 92,
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
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.75),
    gap: spacing(1),
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    textAlign: "right",
  },
  detailHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    textAlign: "right",
  },
  workerCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.5),
    gap: spacing(1),
  },
  workerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  workerName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  workerMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  workerBadge: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeApproved: {
    backgroundColor: "#DCFCE7",
  },
  badgeRejected: {
    backgroundColor: "#FEE2E2",
  },
  badgeSubmitted: {
    backgroundColor: "#EDE9FE",
  },
  workerBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  miniRow: {
    minWidth: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  miniLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  miniValue: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
  statusStack: {
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  statusLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  statusLineLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusLineValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  rejectionText: {
    color: colors.muted,
    lineHeight: 21,
  },
  applyErrorText: {
    color: "#B91C1C",
    lineHeight: 21,
    fontWeight: "600",
  },
  successText: {
    color: "#166534",
    lineHeight: 21,
  },
  warningText: {
    color: "#92400E",
    lineHeight: 21,
  },
  termsHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  termsRowDisabled: {
    opacity: 0.5,
  },
  termsCopy: {
    gap: 6,
  },
  termsHeading: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  termsBody: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: 13,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    lineHeight: 12,
  },
  termsText: {
    flex: 1,
    color: colors.text,
    lineHeight: 20,
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
  },
  summaryLabel: {
    color: colors.text,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  paymentWorkerCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  paymentAmount: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
  },
  paymentState: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    gap: spacing(1),
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  actionButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: "#fff",
    fontWeight: "800",
  },
  actionTextSecondary: {
    color: colors.text,
  },
  dotApproved: {
    backgroundColor: "#22C55E",
  },
  dotRejected: {
    backgroundColor: "#EF4444",
  },
  dotSubmitted: {
    backgroundColor: "#8B5CF6",
  },
  dotInProgress: {
    backgroundColor: "#F59E0B",
  },
  dotNeutral: {
    backgroundColor: "#94A3B8",
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  chatErrorText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
