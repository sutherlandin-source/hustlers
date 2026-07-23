import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useContractsStore } from "../../state/useContractsStore.js";
import { ContractApplicationsService } from "../../services/contractApplicationsService.js";
import { contractsService } from "../../services/contractsService.js";
import { conversationsService } from "../../services/conversationsService.js";
import { reviewsService } from "../../services/reviewsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { getKycProfilePath, hasKycVerification, hasVerifiedKyc } from "../../utils/kyc.js";

const DEFAULT_REVIEW_FORM = {
  rating: 0,
  communication: 0,
  quality: 0,
  timeliness: 0,
  professionalism: 0,
  reviewText: "",
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatMoney(amount, currency = "KSH") {
  const numericAmount = Number(amount || 0);
  return `${currency} ${numericAmount.toLocaleString()}`;
}

function isContractFinalized(contract) {
  const metadata = contract?.metadata || {};
  return Boolean(
    contract?.status === "completed" ||
      contract?.completedAt ||
      contract?.finalApprovedAt ||
      metadata?.disputePaymentReleasedAt ||
      metadata?.disputeOutcome === "release_full_payment"
  );
}

function formatEscrowStatus(contractOrStatus, prepared = false) {
  const status = typeof contractOrStatus === "object" ? (isContractFinalized(contractOrStatus) ? "released" : contractOrStatus?.escrowStatus) : contractOrStatus;
  const labels = {
    waiting_for_funding: "Waiting For Funding",
    funded: "Funded",
    in_progress: "In Progress",
    awaiting_approval: "Awaiting Approval",
    released: "Payment Released",
  };
  return labels[status] || (prepared ? "Funded" : "No Escrow Yet");
}

function getContractProgressLabel(contract) {
  if (isContractFinalized(contract) || contract?.escrowStatus === "released") return "Completed";
  if (contract?.escrowStatus === "awaiting_approval") return "Awaiting Approval";
  if (contract?.escrowStatus === "in_progress") return "In Progress";
  if (contract?.escrowStatus === "funded") return "Funded";
  if (contract?.escrowStatus === "waiting_for_funding") return "Waiting For Funding";
  return "Not Started";
}

function getContractPaymentStructure(contract) {
  const value = contract?.paymentType || contract?.contractType;
  return value === "staged" ? "staged" : "single";
}

function getWorkerName(worker) {
  return worker?.name || `${worker?.firstName || ""} ${worker?.lastName || ""}`.trim() || worker?.email || "Hustler";
}

function getAssignedTeam(contract) {
  if (!contract || typeof contract !== "object") return [];
  const assigned = (Array.isArray(contract?.assignedHustlers) ? contract.assignedHustlers : []).filter(Boolean);
  if (assigned.length) return assigned;
  const accepted = (Array.isArray(contract?.acceptedHustlers) ? contract.acceptedHustlers : []).filter(Boolean);
  if (accepted.length) return accepted;
  if (!contract?.seller) return [];
  return [{
    _id: contract.seller._id || contract.seller,
    name: getWorkerName(contract.seller),
  }];
}

function getMilestones(contract) {
  if (!contract || typeof contract !== "object") return [];
  return Array.isArray(contract?.milestones) ? contract.milestones : [];
}

function getLatestMilestoneForWorker(contract, workerId) {
  const normalizedWorkerId = String(workerId || "");
  return [...getMilestones(contract)]
    .filter((milestone) => {
      const assignedTo = milestone?.assignedTo?._id || milestone?.assignedTo?.id || milestone?.assignedTo;
      const submittedBy = milestone?.submittedBy?._id || milestone?.submittedBy?.id || milestone?.submittedBy;
      return String(assignedTo || submittedBy || "") === normalizedWorkerId;
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
}

function getWorkerWorkStatus(milestone) {
  const status = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  if (status === "rejected") return "Rejected";
  if (status === "approved" || status === "completed") return "Approved";
  if (status === "work_submitted" || status === "submitted") return "Submitted";
  if (status === "needs_revision") return "Revision Requested";
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

function getWorkerPaymentStatus(milestone) {
  const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();
  if (paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded") return "Refunded to Manager";
  if (paymentStatus === "pending" && String(milestone?.workStatus || milestone?.status || "").toLowerCase() === "rejected") {
    return "Payment Secured";
  }
  return paymentStatus === "pending" ? "Payment Secured" : "Payment Secured";
}

function getPersonalContractStatus(milestone, fallbackStatus = "") {
  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();

  if (workStatus === "approved" && paymentStatus === "released") return "Completed";
  if (workStatus === "rejected") return "Rejected";
  if (workStatus === "needs_revision") return "Revision Requested";
  if (workStatus === "submitted" || workStatus === "work_submitted") return "Awaiting Approval";
  if (workStatus === "in_progress") return "In Progress";
  return fallbackStatus || "Not Started";
}

function getMilestonePaymentAmount(milestone, fallback = 0) {
  const grossAmount = Number(milestone?.amount || fallback || 0);
  const commissionAmount = Number(milestone?.commissionAmount || Number((grossAmount * 0.025).toFixed(2)));
  const netAmount = Number(milestone?.netAmount || Number((grossAmount - commissionAmount).toFixed(2)));
  return { grossAmount, commissionAmount, netAmount };
}

function getContractWorkerSummary(contract) {
  try {
    const team = getAssignedTeam(contract).filter(Boolean);
    const payout = contract?.payoutSummary || {};
    const amount = Number(contract?.amount || 0);
    const workerRows = team.map((worker) => {
      const workerId = worker?._id || worker?.id || worker;
      const milestone = getLatestMilestoneForWorker(contract, workerId);
      const payment = getMilestonePaymentAmount(milestone, payout.grossPerHustler || amount / Math.max(1, team.length) || 0);
      return {
        worker,
        milestone,
        ...payment,
        isRejected: String(milestone?.workStatus || milestone?.status || "").toLowerCase() === "rejected",
        isApproved: ["approved", "completed"].includes(String(milestone?.workStatus || milestone?.status || "").toLowerCase()),
        canRate: ["approved", "completed"].includes(String(milestone?.workStatus || milestone?.status || "").toLowerCase()) && String(milestone?.paymentStatus || "").toLowerCase() === "released",
      };
    });

    const hasRejected = workerRows.some((row) => row.isRejected);
    const allApprovedAndReleased = workerRows.length > 0 && workerRows.every((row) => row.isApproved && row.canRate);
    const anyInProgress = workerRows.some((row) => ["in_progress", "submitted", "work_submitted", "needs_revision"].includes(String(row.milestone?.workStatus || row.milestone?.status || "").toLowerCase()));
    const anyPending = workerRows.some((row) => !row.milestone || String(row.milestone?.workStatus || row.milestone?.status || "").toLowerCase() === "pending");

    let contractState = "Action Required";
    if (allApprovedAndReleased) contractState = "Completed";
    else if (anyInProgress || anyPending) contractState = "In Progress";
    else if (hasRejected) contractState = "Action Required";

    return { workerRows, hasRejected, allApprovedAndReleased, anyInProgress, anyPending, contractState };
  } catch {
    return { workerRows: [], hasRejected: false, allApprovedAndReleased: false, anyInProgress: false, anyPending: false, contractState: "In Progress" };
  }
}

function getPaymentSummaryRows(contract) {
  try {
    const summary = getContractWorkerSummary(contract);
    const released = summary.workerRows
      .filter((row) => row.canRate)
      .map((row) => ({
        name: getWorkerName(row.worker),
        amount: row.netAmount,
      }));
    const pending = summary.workerRows
      .filter((row) => !row.canRate)
      .map((row) => ({
        name: getWorkerName(row.worker),
        amount: row.netAmount,
      }));
    return { released, pending };
  } catch {
    return { released: [], pending: [] };
  }
}

function StarRating({ label, value, onChange }) {
  return (
    <div className="review-rating-row">
      <span>{label}</span>
      <div className="star-rating" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={score <= value ? "star-button active" : "star-button"}
            onClick={() => onChange(score)}
            aria-label={`${score} star${score === 1 ? "" : "s"}`}
            aria-checked={value === score}
            role="radio"
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function getReviewTargetName(target) {
  return target?.name || "hustler";
}

export default function ContractDetailsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?._id || user?.id;
  const { contractId } = useParams();
  const { contract, contractLoading, contractError, fetchContract } = useContractsStore();
  const currentBasePath = location.pathname.startsWith("/manager") ? "/manager" : "/dashboard";
  const isAdminView = location.pathname.startsWith("/admin");
  const isHustler = currentBasePath === "/dashboard";
  const isManager = currentBasePath === "/manager";
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState("");
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [escrowError, setEscrowError] = useState("");
  const [escrowSuccess, setEscrowSuccess] = useState("");
  const [finalApprovalLoading, setFinalApprovalLoading] = useState(false);
  const [finalApprovalError, setFinalApprovalError] = useState("");
  const [finalApprovalSuccess, setFinalApprovalSuccess] = useState("");
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [activeReviewTargetId, setActiveReviewTargetId] = useState("");
  const [reviewForm, setReviewForm] = useState(DEFAULT_REVIEW_FORM);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");

  useEffect(() => {
    fetchContract(contractId);
  }, [contractId]);

  useEffect(() => {
    let mounted = true;

    const loadApplicationState = async () => {
      if (!contractId || !userId || !isHustler) return;

      try {
        const response = await ContractApplicationsService.getMyApplications();
        if (!mounted) return;

        const applications = Array.isArray(response?.data) ? response.data : [];
        const existingApplication = applications.find((application) => {
          const applicationContractId = application?.contractId?._id || application?.contractId || application?.contract?._id || application?.contract;
          return String(applicationContractId) === String(contractId);
        });

        const existingStatus = String(existingApplication?.status || "").toLowerCase();
        // A rejected or cancelled application allows the hustler to reapply
        const isReapplyable = existingStatus === "rejected" || existingStatus === "cancelled";
        setHasApplied(Boolean(existingApplication) && !isReapplyable);
        setApplicationStatus(existingStatus);
      } catch {
        if (mounted) setHasApplied(false);
        if (mounted) setApplicationStatus("");
      }
    };

    loadApplicationState();

    return () => {
      mounted = false;
    };
  }, [contractId, userId, isHustler]);

  const isAssigned = contract && (contract.seller?._id === userId || contract.seller === userId);
  const canApply = isHustler && !isAssigned && ["pending", "active"].includes(contract?.status);
  const isContractBuyer = contract && (contract.buyer?._id === userId || contract.buyer === userId);
  const contractPaymentType = getContractPaymentStructure(contract);
  const milestones = getMilestones(contract);
  const assignedTeam = getAssignedTeam(contract);
  const workerSummary = getContractWorkerSummary(contract);
  const assignedWorkerIds = assignedTeam.map((worker) => String(worker?._id || worker?.id || ""));
  const isAssignedWorker = assignedWorkerIds.includes(String(userId));
  const isAppliedOrAcceptedApplicant = ["pending", "applied", "accepted", "approved", "active", "in_progress"].includes(String(applicationStatus || "").toLowerCase());
  const canOpenChat = Boolean(contract && (isContractBuyer || isAssignedWorker || isManager || contract?.userCanOpenChat || isAppliedOrAcceptedApplicant));
  const contractStatus = String(contract?.status || "").toLowerCase();
  const hasSubmittedWork = milestones.some((stage) => ["submitted", "work_submitted"].includes(String(stage?.status || stage?.workStatus || "").toLowerCase()));
  const canViewContractActions = (isManager && isContractBuyer) || isAssigned || isAssignedWorker || isAppliedOrAcceptedApplicant || canApply;
  const canOpenDispute = Boolean(
    contract &&
      (contract.userCanOpenDispute || isContractBuyer || isAssignedWorker || isAppliedOrAcceptedApplicant) &&
      (["active", "assigned", "approved", "disputed"].includes(contractStatus) || hasSubmittedWork)
  );
  const disputeId = contract?.userDisputeId || contract?.metadata?.userDisputeId || contract?.metadata?.disputeId || contract?.disputeId || "";
  const disputePath = disputeId
    ? `${currentBasePath}/disputes/${disputeId}`
    : `${currentBasePath}/contracts/${contractId}/dispute`;
  const disputeButtonLabel = disputeId ? "View Dispute" : "Open Dispute";
  const payoutSummary = contract?.payoutSummary || {};
  const showWorkerBreakdown = isManager || isAdminView;
  const personalMilestone = isHustler ? getLatestMilestoneForWorker(contract, userId) : null;
  const personalContractStatus = isHustler
    ? getPersonalContractStatus(personalMilestone, workerSummary.contractState || contract?.status)
    : workerSummary.contractState;
  const reviewEligibility = contract?.reviewEligibility || {};
  const reviewTargets = Array.isArray(reviewEligibility.targets) ? reviewEligibility.targets.filter(Boolean) : [];
  const reviewableTargets = reviewTargets.filter((target) => target.reviewable);
  const pendingReviewTargets = reviewTargets.filter((target) => target.reviewable && !target.reviewed);
  const activeReviewTarget =
    reviewTargets.find((target) => String(target._id || target.id) === String(activeReviewTargetId)) ||
    pendingReviewTargets[0] ||
    reviewableTargets[0] ||
    reviewTargets[0] ||
    null;
  const hasIdentityDetails = hasKycVerification(user);
  const hasApprovedKyc = hasVerifiedKyc(user);
  const hasReviewAccess = (isManager && isContractBuyer) || isHustler;
  const canUseReviewPanel = hasReviewAccess && (reviewTargets.some((target) => target.reviewable) || reviewTargets.some((target) => target.reviewed));
  const canSubmitReview = canUseReviewPanel && reviewTargets.some((target) => target.reviewable && !target.reviewed);
  const hasSubmittedReview = reviewTargets.length > 0 && reviewTargets.every((target) => !target.reviewable || target.reviewed);
  const reviewButtonLabel = isHustler ? "Review Manager" : "Rate Hustler";
  const reviewFormTitle = isHustler ? "Review" : "Rate";
  const reviewTargetLabel = activeReviewTarget?.name || (isHustler ? "manager" : "hustler");
  const approvedMilestones = milestones.filter((stage) => stage.status === "approved");
  const canSubmitApplication = canApply && hasReadTerms && hasApprovedKyc && !hasApplied && !applyLoading;
  const isFinalApprovalReady =
    contract?.escrowPrepared &&
    contract?.escrowStatus !== "released" &&
    milestones.length > 0 &&
    (contractPaymentType === "staged" ? approvedMilestones.length === milestones.length : approvedMilestones.length > 0);

  useEffect(() => {
    if (import.meta.env?.DEV) {
      console.log("[ContractDetailsPage] currentUser", user);
      console.log("[ContractDetailsPage] assignedHustlers", contract?.assignedHustlers);
      console.log("[ContractDetailsPage] calculated isAssignedWorker", {
        userId,
        assignedWorkerIds,
        isAssignedWorker,
      });
    }
  }, [user, contract, userId, assignedWorkerIds, isAssignedWorker]);

  useEffect(() => {
    if (!reviewTargets.length) {
      setActiveReviewTargetId("");
      return;
    }

    if (!activeReviewTargetId) {
      const nextTarget = pendingReviewTargets[0] || reviewableTargets[0] || reviewTargets[0];
      setActiveReviewTargetId(nextTarget?._id || nextTarget?.id || "");
    }
  }, [reviewTargets, reviewableTargets, pendingReviewTargets, activeReviewTargetId]);

  const handleApply = async () => {
    if (!hasReadTerms || hasApplied) {
      return;
    }
    if (!hasApprovedKyc) {
      navigate(getKycProfilePath(location.pathname), {
        state: { from: location.pathname },
        replace: true,
      });
      return;
    }
    setApplyLoading(true);
    setApplyError("");
    setApplySuccess("");
    try {
      await ContractApplicationsService.applyForContract(contractId, {
        coverLetter: `Application for ${contract?.title || "this job"}`,
        proposedRate: contract?.amount,
        estimatedDuration: "",
      });
      setApplySuccess("Application submitted successfully!");
      setHasApplied(true);
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setApplyError(err?.message || "Failed to apply for this job. Please try again.");
      console.error(err);
    } finally {
      setApplyLoading(false);
    }
  };

  const handlePrepareEscrow = async () => {
    if (!hasIdentityDetails) {
      navigate(getKycProfilePath(location.pathname), {
        state: { from: location.pathname },
        replace: true,
      });
      return;
    }
    setEscrowLoading(true);
    setEscrowError("");
    setEscrowSuccess("");
    try {
      await contractsService.prepareEscrow(contractId, contract.amount);
      setEscrowSuccess("Escrow prepared successfully!");
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setEscrowError(err?.message || "Failed to prepare escrow. Please try again.");
      console.error(err);
    } finally {
      setEscrowLoading(false);
    }
  };

  const handleFinalApproval = async () => {
    if (!hasIdentityDetails) {
      navigate(getKycProfilePath(location.pathname), {
        state: { from: location.pathname },
        replace: true,
      });
      return;
    }
    setFinalApprovalLoading(true);
    setFinalApprovalError("");
    setFinalApprovalSuccess("");
    try {
      await contractsService.finalApprove(contractId);
      setFinalApprovalSuccess("Final approval complete. Payment released to the hustler.");
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setFinalApprovalError(err?.message || "Failed to complete final approval.");
      console.error(err);
    } finally {
      setFinalApprovalLoading(false);
    }
  };

  const updateReviewScore = (field) => (score) => {
    setReviewForm((current) => ({ ...current, [field]: score }));
  };

  const updateReviewText = (event) => {
    setReviewForm((current) => ({ ...current, reviewText: event.target.value }));
  };

  const openReviewForTarget = (target) => {
    if (!target?.reviewable && !target?.reviewed) {
      setReviewError("This specific submission is not ready for review yet.");
      return;
    }
    setActiveReviewTargetId(target?._id || target?.id || "");
    setReviewFormOpen(true);
    setReviewError("");
    setReviewSuccess("");
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    setReviewError("");
    setReviewSuccess("");

    if (!canSubmitReview || !activeReviewTarget?._id || activeReviewTarget?.reviewed || !activeReviewTarget?.reviewable) {
      setReviewError(reviewEligibility.blockedReason || "This contract is not ready for review.");
      return;
    }

    const missingScore = ["rating", "communication", "quality", "timeliness", "professionalism"].some((field) => !reviewForm[field]);
    if (missingScore) {
      setReviewError("Please select a score for every rating category.");
      return;
    }

    setReviewLoading(true);
    try {
      await reviewsService.create({
        contractId,
        revieweeId: activeReviewTarget?._id,
        ...reviewForm,
      });
      setReviewSuccess("Review submitted");
      setReviewForm(DEFAULT_REVIEW_FORM);
      setReviewFormOpen(false);
      setActiveReviewTargetId("");
      await fetchContract(contractId);
    } catch (err) {
      setReviewError(err?.message || "Unable to submit this review.");
    } finally {
      setReviewLoading(false);
    }
  };

  const [chatError, setChatError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const backPath = `${currentBasePath}/contracts`;
  const applicationLetterTitle = `Application received for ${contract?.title || "this job"}`;
  const applicationLetterBody = `Thank you for applying. Your application has been received successfully and is now awaiting approval from the manager. Please wait for the manager to review your profile and respond.`;

  const getStatusColor = (status) => {
    const statusColors = {
      pending: "#f59e0b",
      active: "#10b981",
      completed: "#0ea5e9",
      cancelled: "#6b7280",
      disputed: "#ef4444",
      terminated: "#8b5cf6",
    };
    const s = (status || "").toString().toLowerCase();
    // Treat work_submitted and submitted as completed for UI
    if (s === "work_submitted" || s === "submitted") return statusColors["completed"];
    return statusColors[s] || "#6b7280";
  };

  const handleOpenChat = async () => {
    setChatError("");
    try {
      const conversation = await conversationsService.openForContract(contractId);
      const conversationId = conversation._id || conversation.id;
      if (conversationId) {
        const chatBase = currentBasePath;
        navigate(`${chatBase}/chat/${conversationId}`);
        setUnreadCount(0);
      }
    } catch (err) {
      setChatError(err?.message || "Unable to open chat for this contract.");
      console.error(err);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadUnread = async () => {
      if (!contractId) return;
      try {
        const cnt = await conversationsService.getUnreadForContract(contractId);
        if (mounted) setUnreadCount(cnt || 0);
      } catch (e) {
        // ignore
      }
    };
    loadUnread();
    return () => {
      mounted = false;
    };
  }, [contractId]);

  let pageContent;
  try {
    pageContent = (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Job Details</h2>
          <p>Review the job details and track work stage progress.</p>
        </div>
        {!isAdminView && (
          <Link to={backPath} className="button-secondary">
            Back to jobs
          </Link>
        )}
      </header>

      {contractLoading && <Loader label="Loading job..." />}
      {contractError && <ErrorBanner error={contractError} />}

      {!contractLoading && !contractError && contract && (
        <div className="contract-details-container">
          {/* Main Details Card */}
          <div className="details-card">
            <div className="details-header">
              <div className="details-title-section">
                <h3 className="details-title">{contract.title}</h3>
                <span 
                  className="status-badge details-status" 
                  style={{ backgroundColor: getStatusColor(isHustler ? (personalContractStatus === "Completed" ? "completed" : personalContractStatus === "Rejected" ? "disputed" : contract.status) : contract.status) }}
                >
                  {isHustler ? personalContractStatus : contract.status}
                </span>
              </div>
            </div>

            <p className="details-description">{contract.description}</p>

            {/* Contract Info Grid */}
            <div className="contract-info-grid">
              <div className="info-item">
                <div className="info-label">Contract Type</div>
                <div className="info-value">
                  <span className="type-label">
                    {contractPaymentType === "single" ? "Single Payment Contract" : "Staged Payment Contract"}
                  </span>
                </div>
              </div>
              <div className="info-item">
                <div className="info-label">Amount</div>
                <div className="info-value">
                  <span className="amount-highlight">
                    {contract.currency} {contract.amount}
                  </span>
                </div>
              </div>

              {(payoutSummary?.netPerHustler !== undefined || payoutSummary?.grossPerHustler !== undefined) && (
                <div className="info-item">
                  <div className="info-label">Payment per hustler</div>
                  <div className="info-value">
                    <span className="amount-highlight">
                      {formatMoney(payoutSummary?.netPerHustler ?? payoutSummary?.grossPerHustler ?? 0, contract.currency)}
                    </span>
                    <div className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                      After commission
                    </div>
                  </div>
                </div>
              )}

              <div className="info-item">
                <div className="info-label">Status</div>
                <div className="info-value">
                  <span 
                    className="status-badge-small" 
                    style={{ backgroundColor: getStatusColor(isHustler ? (personalContractStatus === "Completed" ? "completed" : personalContractStatus === "Rejected" ? "disputed" : contract.status) : (workerSummary.contractState === "Completed" ? "completed" : workerSummary.contractState === "Action Required" ? "disputed" : contract.status)) }}
                  >
                    {isHustler ? personalContractStatus : workerSummary.contractState}
                  </span>
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Project Manager</div>
                <div className="info-value">
                  {contract.buyer?.firstName ? `${contract.buyer.firstName} ${contract.buyer.lastName}` : contract.buyer?.name || "—"}
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Assigned Team</div>
                <div className="info-value">
                  {assignedTeam.length ? `${assignedTeam.length}/${contract.workerSlots || contract.numWorkers || 1} hustler${assignedTeam.length === 1 ? "" : "s"} assigned` : "Not assigned"}
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Start Date</div>
                <div className="info-value">{formatDate(contract.startDate)}</div>
              </div>

              <div className="info-item">
                <div className="info-label">Currency</div>
                <div className="info-value">{contract.currency || "USD"}</div>
              </div>
            </div>

            {showWorkerBreakdown && (assignedTeam.length > 0 || payoutSummary.isMultiWorker) && (
              <div className="multi-contract-panel">
                <div className="multi-contract-panel-header">
                  <h4>Assigned hustlers</h4>
                  {isAdminView && (
                    <button
                      type="button"
                      className="button-secondary action-button contract-close-group"
                      onClick={() => navigate(-1)}
                    >
                      Close
                    </button>
                  )}
                </div>
                <div className="assigned-worker-summary-list">
                  {workerSummary.workerRows.length ? (
                    workerSummary.workerRows.map(({ worker, milestone, grossAmount, commissionAmount, netAmount, canRate }) => (
                      <div key={worker?._id || worker?.id || worker?.name || milestone?._id || "worker"} className="assigned-worker-summary-item">
                        <div className="assigned-worker-summary-header">
                          <strong>{getWorkerName(worker)}</strong>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span className="status-badge-small" style={{ backgroundColor: getStatusColor(milestone?.workStatus || milestone?.status || "pending") }}>
                              Work: {getWorkerWorkStatus(milestone)}
                            </span>
                            <span className="status-badge-small" style={{ backgroundColor: getStatusColor(milestone?.paymentStatus === "released" ? "completed" : milestone?.paymentStatus === "refunded" ? "cancelled" : "assigned") }}>
                              Payment: {getWorkerPaymentStatus(milestone)}
                            </span>
                          </div>
                        </div>
                        <div className="assigned-worker-summary-grid">
                          <div><span>Gross</span><strong>{formatMoney(grossAmount, contract.currency)}</strong></div>
                          <div><span>Commission</span><strong>{formatMoney(commissionAmount, contract.currency)}</strong></div>
                          <div><span>Net</span><strong>{formatMoney(netAmount, contract.currency)}</strong></div>
                          <div><span>Submission</span><strong>{formatDate(milestone?.submittedAt)}</strong></div>
                          <div><span>Rejection reason</span><strong>{milestone?.rejectionReason || "—"}</strong></div>
                        </div>
                        {canRate ? (
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => openReviewForTarget({ ...worker, reviewable: true, reviewed: false })}
                          >
                            Rate Hustler
                          </button>
                        ) : (
                          <span className="muted">Rating unavailable</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="muted">No hustlers accepted yet</span>
                  )}
                </div>
              </div>
            )}

            {showWorkerBreakdown && (
            <div className="multi-contract-panel">
              <div className="multi-contract-panel-header">
                <h4>Payment Summary</h4>
              </div>
              {(() => {
                const summaryRows = getPaymentSummaryRows(contract);
                return (
                  <div className="payment-summary-columns">
                    <div className="payment-summary-column">
                      <h5>Released</h5>
                      {summaryRows.released.length ? summaryRows.released.map((row) => (
                        <div key={row.name} className="payment-summary-row">
                          <span>{row.name}</span>
                          <strong>{formatMoney(row.amount, contract.currency)}</strong>
                        </div>
                      )) : <span className="muted">None yet</span>}
                    </div>
                    <div className="payment-summary-column">
                      <h5>Pending</h5>
                      {summaryRows.pending.length ? summaryRows.pending.map((row) => (
                        <div key={row.name} className="payment-summary-row">
                          <span>{row.name}</span>
                          <strong>{formatMoney(row.amount, contract.currency)}</strong>
                        </div>
                      )) : <span className="muted">None</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
            )}

            {/* Action Buttons Section */}
            {canViewContractActions && (
              <div className="actions-section">
                {isHustler && canApply && (
                  <div className="terms-card">
                    <h4>Terms &amp; Conditions</h4>
                    <ul>
                      <li>Review the full job details before applying.</li>
                      <li>Make sure the scope, payment, and timeline fit your availability.</li>
                      <li>By applying, you agree to follow the contract terms set by the manager.</li>
                    </ul>
                    <label className="terms-confirmation">
                      <input
                        type="checkbox"
                        checked={hasReadTerms}
                        onChange={(event) => setHasReadTerms(event.target.checked)}
                        disabled={hasApplied || applyLoading}
                      />
                      <span>I have read and understand the terms.</span>
                    </label>
                    {!hasReadTerms && !hasApplied && (
                      <p className="submission-notes">Please agree to the terms before applying.</p>
                    )}
                  </div>
                )}

                {!hasIdentityDetails && (isManager || isHustler) && (
                  <div className="security-notice">
                    <span className="notice-icon">KYC</span>
                    <p>
                      Complete your identity details in <Link to={`${currentBasePath}/profile`}>Profile</Link>
                      {" "}before applying, funding escrow, or releasing payment.
                    </p>
                  </div>
                )}

                {isHustler && hasIdentityDetails && !hasApprovedKyc && (
                  <div className="security-notice">
                    <span className="notice-icon">Review</span>
                    <p>
                      Your identity details are saved, but you must wait for admin verification before applying for this job.
                    </p>
                  </div>
                )}

                {isManager && isContractBuyer && !contract?.seller && !contract?.escrowPrepared && (
                  <div className="action-group">
                    <Link
                      to={`/manager/contracts/${contract._id || contract.id}/edit`}
                      className="button-secondary action-button"
                    >
                      Edit Contract
                    </Link>
                  </div>
                )}

                {/* Apply Button for Hustlers */}
                {canApply && (
                  <div className="action-group">
                    {applyError && <ErrorBanner error={applyError} />}
                    {(applySuccess || hasApplied) && (
                      <div className="application-letter">
                        <div className="application-letter-header">
                          <span className="application-letter-badge">System Letter</span>
                          <span className="application-letter-date">{new Date().toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</span>
                        </div>
                        <h4>{applicationLetterTitle}</h4>
                        <p>{applicationLetterBody}</p>
                      </div>
                    )}
                    {!hasApplied && !applySuccess && (
                      <div className="application-letter">
                        <div className="application-letter-header">
                          <span className="application-letter-badge">System Letter</span>
                          <span className="application-letter-date">{new Date().toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</span>
                        </div>
                        <h4>{applicationLetterTitle}</h4>
                        <p>{applicationLetterBody}</p>
                      </div>
                    )}
                    <button 
                      onClick={handleApply} 
                      disabled={!canSubmitApplication}
                      className={hasApplied ? "button-secondary action-button action-button-inactive" : "button-primary action-button"}
                    >
                      {hasApplied ? "Applied" : !hasApprovedKyc ? "Verification Required" : !hasReadTerms ? "Agree to Terms" : applyLoading ? "Applying..." : "Apply now"}
                    </button>
                  </div>
                )}

                {/* Escrow Button for Managers */}
                {isManager && isContractBuyer && !contract?.escrowPrepared && (
                  <div className="action-group">
                    {escrowError && <ErrorBanner error={escrowError} />}
                    {escrowSuccess && (
                      <div className="success-message">
                        {escrowSuccess}
                      </div>
                    )}
                    <button 
                      onClick={handlePrepareEscrow} 
                      disabled={escrowLoading || !["assigned", "active"].includes(contract?.status)}
                      className="button-success action-button"
                    >
                      {escrowLoading
                        ? "Funding Escrow..."
                        : `Fund Escrow (${contract?.amount} ${contract?.currency})`}
                    </button>
                  </div>
                )}

                {/* Escrow Confirmation */}
                {isManager && isContractBuyer && contract?.escrowPrepared && (
                  <div className="escrow-confirmed">
                    <span>Payment summary is shown below for each assigned hustler.</span>
                  </div>
                )}

                {isManager && isContractBuyer && contract?.escrowPrepared && contract?.escrowStatus !== "released" && (
                  <div className="action-group">
                    {finalApprovalError && <ErrorBanner error={finalApprovalError} />}
                    {finalApprovalSuccess && <div className="success-message">{finalApprovalSuccess}</div>}
                    <button
                      onClick={handleFinalApproval}
                      disabled={finalApprovalLoading || !isFinalApprovalReady}
                      className="button-success action-button"
                    >
                      {finalApprovalLoading
                        ? "Releasing Payment..."
                        : "Final Approval & Release Payment"}
                    </button>
                    {!isFinalApprovalReady && (
                      <p className="submission-notes">
                        {contractPaymentType === "staged"
                          ? "All stages must be approved before final payment release."
                          : "Final work must be approved before payment release."}
                      </p>
                    )}
                  </div>
                )}

                {canUseReviewPanel && (
                  <div className="action-group review-action-panel">
                    {reviewError && <ErrorBanner error={reviewError} />}
                    {reviewSuccess && <div className="success-message">{reviewSuccess}</div>}

                    {isManager && reviewTargets.length > 0 ? (
                      <div className="review-form">
                        <div className="review-form-header">
                          <h4>Rate hustlers</h4>
                          {hasSubmittedReview && pendingReviewTargets.length === 0 && (
                            <div className="review-submitted-label">All ratings submitted</div>
                          )}
                        </div>
                        <div className="hustler-rating-list">
                          {reviewTargets.map((target) => {
                            const targetId = String(target._id || target.id || "");
                            const isTargetActive = activeReviewTarget && String(activeReviewTarget._id || activeReviewTarget.id || "") === targetId;
                            const isReviewed = Boolean(target.reviewed);
                            return (
                              <div key={targetId || target.name} className={`hustler-rating-item ${isReviewed ? "is-reviewed" : ""}`}>
                                <div>
                                  <strong>{getReviewTargetName(target)}</strong>
                                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                                    {isReviewed ? "Rating submitted" : "Pending rating"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className={isReviewed ? "button-secondary" : "button-primary"}
                                  onClick={() => openReviewForTarget(target)}
                                  disabled={reviewLoading || isReviewed || !target.reviewable || !hasReviewAccess}
                                >
                                  {isReviewed ? "Rated" : `Rate ${getReviewTargetName(target)}`}
                                </button>
                                {isTargetActive && reviewFormOpen && !isReviewed && (
                                  <form className="review-form review-form-inline" onSubmit={handleSubmitReview}>
                                    <div className="review-form-header">
                                      <h4>{reviewFormTitle} {reviewTargetLabel}</h4>
                                      <button type="button" className="button-secondary" onClick={() => setReviewFormOpen(false)} disabled={reviewLoading}>
                                        Cancel
                                      </button>
                                    </div>
                                    <StarRating label="Overall rating" value={reviewForm.rating} onChange={updateReviewScore("rating")} />
                                    <StarRating label="Communication" value={reviewForm.communication} onChange={updateReviewScore("communication")} />
                                    <StarRating label="Quality of work" value={reviewForm.quality} onChange={updateReviewScore("quality")} />
                                    <StarRating label="Timeliness" value={reviewForm.timeliness} onChange={updateReviewScore("timeliness")} />
                                    <StarRating label="Professionalism" value={reviewForm.professionalism} onChange={updateReviewScore("professionalism")} />
                                    <label className="form-label">
                                      <span className="label-text">Review text</span>
                                      <textarea
                                        value={reviewForm.reviewText}
                                        onChange={updateReviewText}
                                        maxLength={2000}
                                        rows={4}
                                        placeholder="Share concise feedback about this hustler's work."
                                      />
                                    </label>
                                    <button type="submit" className="button-primary" disabled={reviewLoading || !canSubmitReview}>
                                      {reviewLoading ? "Submitting..." : "Submit Review"}
                                    </button>
                                  </form>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : hasSubmittedReview ? (
                      <div className="review-submitted-label">Review Submitted</div>
                    ) : (
                      <>
                        {!reviewFormOpen && (
                          <button
                            type="button"
                            onClick={() => openReviewForTarget(activeReviewTarget || reviewTargets[0])}
                            disabled={!canSubmitReview}
                            className="button-primary action-button"
                          >
                            {reviewButtonLabel}
                          </button>
                        )}
                        {reviewFormOpen && (
                          <form className="review-form" onSubmit={handleSubmitReview}>
                            <div className="review-form-header">
                              <h4>{reviewFormTitle} {reviewTargetLabel}</h4>
                              <button type="button" className="button-secondary" onClick={() => setReviewFormOpen(false)} disabled={reviewLoading}>
                                Cancel
                              </button>
                            </div>
                            <StarRating label="Overall rating" value={reviewForm.rating} onChange={updateReviewScore("rating")} />
                            <StarRating label="Communication" value={reviewForm.communication} onChange={updateReviewScore("communication")} />
                            <StarRating label="Quality of work" value={reviewForm.quality} onChange={updateReviewScore("quality")} />
                            <StarRating label="Timeliness" value={reviewForm.timeliness} onChange={updateReviewScore("timeliness")} />
                            <StarRating label="Professionalism" value={reviewForm.professionalism} onChange={updateReviewScore("professionalism")} />
                            <label className="form-label">
                              <span className="label-text">Review text</span>
                              <textarea
                                value={reviewForm.reviewText}
                                onChange={updateReviewText}
                                maxLength={2000}
                                rows={4}
                                placeholder="Share concise feedback about the completed work."
                              />
                            </label>
                            <button type="submit" className="button-primary" disabled={reviewLoading || !canSubmitReview}>
                              {reviewLoading ? "Submitting..." : "Submit Review"}
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                )}

                {(isManager && isContractBuyer) || isAssigned || isAssignedWorker ? (
                  <div className="action-group">
                    {chatError && <ErrorBanner error={chatError} />}
                    <button
                      onClick={handleOpenChat}
                      className="button-secondary action-button"
                      disabled={!canOpenChat}
                    >
                      Open Contract Messages
                      {unreadCount > 0 && <span className="unread-badge" style={{ marginLeft: 8 }}>{unreadCount}</span>}
                    </button>
                  </div>
                ) : null}

                {(canOpenDispute || Boolean(disputeId)) && (
                  <div className="action-group">
                    <Link to={disputePath} className="button-secondary action-button">
                      {disputeButtonLabel}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Work Stages Card (only for staged contracts) */}
          {contractPaymentType !== "single" ? (
            <div className="details-card work-stages-card">
              <h3 className="section-title">Work Steps</h3>
              {Array.isArray(contract.milestones) && contract.milestones.length ? (
                <div className="milestones-list">
                  {contract.milestones.map((stage, idx) => (
                    <div key={stage._id || stage.id} className="milestone-item">
                      <div className="milestone-header">
                        <div className="milestone-number">{idx + 1}</div>
                        <div className="milestone-info">
                          <h4 className="milestone-title">{stage.title}</h4>
                          <p className="milestone-description">{stage.description}</p>
                        </div>
                        <span 
                          className="status-badge-small milestone-status" 
                          style={{ backgroundColor: getStatusColor(stage.status || stage.workStatus) }}
                        >
                          {stage.status || stage.workStatus}
                        </span>
                      </div>
                      <div className="milestone-details">
                        <div className="milestone-detail-item">
                          <span className="detail-label">Payment:</span>
                          <span className="detail-value">{stage.amount} {contract.currency || 'KES'}</span>
                        </div>
                        <div className="milestone-detail-item">
                          <span className="detail-label">Due:</span>
                          <span className="detail-value">{formatDate(stage.dueDate)}</span>
                        </div>
                        {stage.assignedTo && (
                          <div className="milestone-detail-item">
                            <span className="detail-label">Assigned to:</span>
                            <span className="detail-value">{getWorkerName(stage.assignedTo)}</span>
                          </div>
                        )}
                      </div>

                      {/* Manager View: Hustler Status Section */}
                      {isManager && (
                        <div className="hustler-status-section">
                          <div className="status-section-header">
                            <span className="status-icon">👤</span>
                            <strong>Hustler Status</strong>
                          </div>

                          {stage.status === "pending" && (
                            <div className="status-content pending-status">
                              <p className="status-info">Awaiting hustler submission</p>
                            </div>
                          )}

                          {(stage.status === "submitted" || stage.workStatus === "work_submitted") && stage.submissionData && (
                            <div className="status-content submitted-status">
                              <div className="submission-detail">
                                <span className="detail-label">Submitted on:</span>
                                <span className="detail-value">{formatDate(stage.submittedAt)}</span>
                              </div>
                              {stage.submissionData.notes && (
                                <div className="submission-detail">
                                  <span className="detail-label">Completion Notes:</span>
                                  <p className="submission-notes">{stage.submissionData.notes}</p>
                                </div>
                              )}
                              {stage.submissionData.workSampleUrl && (
                                <div className="submission-detail">
                                  <span className="detail-label">Work Sample:</span>
                                  <a 
                                    href={stage.submissionData.workSampleUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="work-sample-link"
                                  >
                                    View Work Sample →
                                  </a>
                                </div>
                              )}
                              <p className="submission-status">Pending Your Review</p>
                            </div>
                          )}

                          {(stage.status === "approved" || stage.workStatus === "approved") && (
                            <div className="status-content approved-status">
                              <p className="status-check">Work Approved</p>
                              <div className="approval-detail">
                                <span className="detail-label">Approved on:</span>
                                <span className="detail-value">{formatDate(stage.approvedAt)}</span>
                              </div>
                              {stage.paymentStatus === "released" && (
                                <div className="payment-released">
                                  <span>Payment released after final contract approval.</span>
                                </div>
                              )}
                              {stage.paymentStatus === "refunded" && (
                                <div className="payment-released">
                                  <span>Refunded to manager after dispute review.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {(stage.status === "rejected" || stage.workStatus === "rejected") && (
                            <div className="status-content rejected-status">
                              <p className="status-rejected">Work Rejected</p>
                              {stage.rejectionReason && (
                                <div className="rejection-reason">
                                  <span className="detail-label">Reason:</span>
                                  <p className="reason-text">{stage.rejectionReason}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-milestones">
                  <p>No work steps are attached to this job yet.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="details-card work-stages-card">
              <h3 className="section-title">Single Payment</h3>
              <div className="single-payment-overview">
                <p>This is a single-payment job. No work steps are required.</p>
                <div className="progress-summary">
                  <div className="info-label">Progress</div>
                  <div className="info-value">
                    <strong>
                      {getContractProgressLabel(contract)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
    );
  } catch (renderError) {
    console.error("ContractDetailsPage render failed", renderError);
    pageContent = <ErrorBanner error={renderError?.message || "Unable to render contract details"} />;
  }
  return pageContent;
}
