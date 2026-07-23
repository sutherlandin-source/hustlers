import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { milestonesService } from "../../services/milestonesService.js";
import { contractsService } from "../../services/contractsService.js";
import { conversationsService } from "../../services/conversationsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

const MILESTONE_STATUS = {
  SUBMITTED: "submitted",
};

const REJECTION_REASONS = [
  { value: "poor_quality", label: "Poor quality" },
  { value: "incomplete_work", label: "Incomplete work" },
  { value: "missed_deadline", label: "Missed deadline" },
  { value: "policy_violation", label: "Policy violation" },
  { value: "other", label: "Other" },
];

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatMoney(amount, currency = "KSH") {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function getInitials(user) {
  const first = user?.firstName || user?.name || "";
  const last = user?.lastName || "";
  return `${first[0] || "H"}${last[0] || ""}`.toUpperCase();
}

function getSubmissionHustler(submission) {
  return submission?.submittedBy || submission?.assignedTo || submission?.contract?.seller || {};
}

function getSubmissionContractId(submission) {
  return submission?.contract?._id || submission?.contract?.id || submission?.contract || submission?.contractId || submission?._id;
}

function isAdminReleasedContract(contract) {
  return String(contract?.metadata?.disputeOutcome || "").toLowerCase() === "release_full_payment" || Boolean(contract?.metadata?.disputePaymentReleasedAt);
}

function getStatusLabel(submission) {
  return String(submission?.status || submission?.workStatus || "submitted").replace(/_/g, " ");
}

function getPaymentStatusLabel(submission) {
  const paymentStatus = String(submission?.paymentStatus || "").toLowerCase();
  if (paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded") return "Refunded to Manager";
  const contractStatus = String(submission?.contract?.status || "").toLowerCase();
  const disputeId = submission?.contract?.userDisputeId || submission?.contract?.metadata?.userDisputeId || submission?.contract?.metadata?.disputeId || submission?.contract?.disputeId || submission?.paymentMetadata?.disputeId;
  if (paymentStatus === "pending" && (contractStatus === "disputed" || Boolean(disputeId))) return "Payment On Hold";
  return "Payment Secured";
}

function getStatusTone(submission) {
  const status = String(submission?.status || submission?.workStatus || "submitted").toLowerCase();
  if (["approved", "completed"].includes(status)) return "status-active";
  if (["rejected", "needs_revision"].includes(status)) return "status-cancelled";
  return "status-submitted";
}

function getPaymentStatusTone(submission) {
  const paymentStatus = getPaymentStatusLabel(submission);
  if (paymentStatus === "Payment Released") return "status-active";
  if (paymentStatus === "Refunded to Manager") return "status-cancelled";
  if (paymentStatus === "Payment On Hold") return "status-cancelled";
  return "status-submitted";
}

function getSubmissionRating(user) {
  return Number(user?.averageRating || 0).toFixed(1);
}

function computeAssignedWorkers(contract, milestones) {
  const contractAssigned = Array.isArray(contract?.acceptedHustlers) ? contract.acceptedHustlers.length : 0;
  if (contractAssigned) return contractAssigned;

  const milestoneAssigned = new Set(
    (Array.isArray(milestones) ? milestones : [])
      .map((milestone) => {
        const assigned = milestone?.assignedTo?._id || milestone?.assignedTo || milestone?.submittedBy?._id || milestone?.submittedBy;
        return assigned ? String(assigned) : "";
      })
      .filter(Boolean)
  ).size;

  if (milestoneAssigned) return milestoneAssigned;

  return Number(contract?.numWorkers || contract?.workerSlots || contract?.workersRequired || contract?.assignedWorkers || 0);
}

function buildContractSummary(contract, groupedSubmissions, allMilestones) {
  const milestones = Array.isArray(allMilestones) ? allMilestones : [];
  const totalMilestones = milestones.length || groupedSubmissions.length;
  const submittedCount = milestones.length
    ? milestones.filter((milestone) => String(milestone.status || milestone.workStatus || "").toLowerCase() === MILESTONE_STATUS.SUBMITTED).length
    : groupedSubmissions.length;
  const approvedCount = milestones.filter((milestone) => String(milestone.status || milestone.workStatus || "").toLowerCase() === "approved").length;
  const pendingCount = milestones.filter((milestone) => String(milestone.status || milestone.workStatus || "").toLowerCase() === "pending").length;
  const progress = totalMilestones ? Math.round((approvedCount / totalMilestones) * 100) : 0;

  return {
    title: contract?.title || "Untitled contract",
    budget: contract?.amount ?? groupedSubmissions.reduce((sum, submission) => sum + (Number(submission.amount) || 0), 0),
    currency: contract?.currency || "KSH",
    assignedWorkers: computeAssignedWorkers(contract, milestones),
    submittedCount,
    approvedCount,
    pendingCount,
    progress,
    totalMilestones,
  };
}

export default function TaskApprovalsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contractGroups, setContractGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeContractId, setActiveContractId] = useState(null);
  const [activeSubmission, setActiveSubmission] = useState(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [rejectReasonType, setRejectReasonType] = useState("poor_quality");
  const [rejectComments, setRejectComments] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const pendingReview = useMemo(
    () => contractGroups.flatMap((group) => group.submissions || []),
    [contractGroups]
  );
  const activeContractGroup = useMemo(
    () => contractGroups.find((group) => group.contractId === activeContractId) || null,
    [activeContractId, contractGroups]
  );
  const totalValue = pendingReview.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  useEffect(() => {
    loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSubmissions = async () => {
    setLoading(true);
    setError("");
    try {
      const milestones = await milestonesService.list({ status: MILESTONE_STATUS.SUBMITTED });
      const submitted = Array.isArray(milestones) ? milestones : [];

      const grouped = submitted.reduce((groups, submission) => {
        const contractId = String(getSubmissionContractId(submission) || "unknown");
        if (!groups[contractId]) {
          groups[contractId] = {
            contractId,
            contract: submission.contract || {},
            submissions: [],
            latestSubmittedAt: submission.submittedAt || submission.updatedAt || submission.createdAt,
          };
        }

        groups[contractId].submissions.push(submission);
        const submittedAt = submission.submittedAt || submission.updatedAt || submission.createdAt;
        if (new Date(submittedAt || 0) > new Date(groups[contractId].latestSubmittedAt || 0)) {
          groups[contractId].latestSubmittedAt = submittedAt;
        }

        return groups;
      }, {});

      const groups = await Promise.all(
        Object.values(grouped).map(async (group) => {
          const contractId = group.contractId;
          let contract = group.contract || {};
          let allMilestones = [];

          if (contractId && contractId !== "unknown") {
            try {
              contract = await contractsService.get(contractId);
            } catch {
              // keep the fallback contract object from the submission record
            }

            try {
              const contractMilestones = await milestonesService.list({ contractId });
              allMilestones = Array.isArray(contractMilestones) ? contractMilestones : [];
            } catch {
              // keep the submitted milestones only
            }
          }

          return {
            ...group,
            contract,
            allMilestones,
            summary: buildContractSummary(contract, group.submissions, allMilestones),
          };
        })
      );

      const visibleGroups = groups.filter((group) => !isAdminReleasedContract(group.contract));
      visibleGroups.sort((left, right) => new Date(right.latestSubmittedAt || 0) - new Date(left.latestSubmittedAt || 0));
      setContractGroups(visibleGroups);
    } catch (err) {
      setError(err?.message || "Failed to load submissions");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submissionId) => {
    setActionLoading(true);
    setError("");
    try {
      await milestonesService.approve(submissionId);
      setSuccessMessage("Work approved. If all tasks are approved, escrow payment is released automatically.");
      setActiveSubmission(null);
      setTimeout(() => {
        loadSubmissions();
        setSuccessMessage("");
      }, 1500);
    } catch (err) {
      setError(err?.message || "Failed to approve work");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevision = async (submissionId) => {
    if (!revisionReason.trim()) {
      setError("Please provide a revision reason");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      await milestonesService.requestRevision(submissionId, revisionReason);
      setSuccessMessage("Revision requested.");
      setRevisionReason("");
      setActiveSubmission(null);
      setTimeout(() => {
        loadSubmissions();
        setSuccessMessage("");
      }, 1500);
    } catch (err) {
      setError(err?.message || "Failed to request revision");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectWork = async (submissionId) => {
    if (!rejectReasonType) {
      setError("Please select a rejection reason.");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      await milestonesService.rejectWork(submissionId, rejectReasonType, rejectComments);
      setSuccessMessage("Work rejected.");
      setRejectReasonType("poor_quality");
      setRejectComments("");
      setActiveSubmission(null);
      setTimeout(() => {
        loadSubmissions();
        setSuccessMessage("");
      }, 1500);
    } catch (err) {
      setError(err?.message || "Failed to reject work");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMessageWorker = async (submission) => {
    const hustler = getSubmissionHustler(submission);
    const hustlerId = hustler?._id || hustler?.id;
    const contractId = getSubmissionContractId(submission);
    if (!hustlerId) return;

    setActionLoading(true);
    setError("");
    try {
      const conversation = await conversationsService.createConversation({
        participants: [user?._id || user?.userId || user?.id, hustlerId],
        ...(contractId ? { contractId } : {}),
      });
      navigate(`/manager/chat/${conversation._id || conversation.id}`, { replace: true });
    } catch (err) {
      setError(err?.message || "Failed to open conversation with worker");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const openContractSubmissions = (group) => {
    setActiveContractId(group.contractId);
    setActiveSubmission(null);
    setRevisionReason("");
  };

  return (
    <section className="manager-approvals-container">
      <div className="approvals-shell">
        <div className="approvals-page-header">
          <div>
            <p className="page-eyebrow">Manager Review</p>
            <h1>Work Submissions</h1>
            <p>Review submitted work, approve stages, or request revisions. Payment releases automatically when all contract work is approved.</p>
          </div>
          <button className="refresh-button approvals-refresh" onClick={loadSubmissions} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="approvals-summary-grid">
          <div className="summary-tile">
            <span>Pending Review</span>
            <strong>{pendingReview.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Submitted Value</span>
            <strong>{formatMoney(totalValue)}</strong>
          </div>
          <div className="summary-tile">
            <span>Reviewer</span>
            <strong>{user?.firstName || "Manager"}</strong>
          </div>
        </div>

        {error && <ErrorBanner error={error} />}
        {successMessage && <div className="success-message">{successMessage}</div>}

        {loading && <Loader label="Loading submissions..." />}

        {!loading && pendingReview.length === 0 && (
          <div className="empty-tasks-state approvals-empty">
            <div className="empty-icon">0</div>
            <div className="empty-message">
              <h3>No pending submissions</h3>
              <p>All submitted work has been reviewed.</p>
            </div>
          </div>
        )}

        {!loading && pendingReview.length > 0 && (
          <div className="approvals-grid">
            {contractGroups.map((group) => {
              const contract = group.contract || {};
              const summary = group.summary || {};

              return (
                <article key={group.contractId} className="approval-contract-group">
                  <div className="approval-contract-group-header">
                    <div>
                      <p className="page-eyebrow">Contract</p>
                      <h2>{summary.title}</h2>
                      <p>{summary.submittedCount} submitted, {summary.approvedCount} approved, {summary.pendingCount} pending</p>
                    </div>
                    <div className="approval-contract-group-meta">
                      <span>{formatMoney(summary.budget, summary.currency).split(" ")[0]}</span>
                      <strong>{formatMoney(summary.budget, summary.currency).replace(`${summary.currency} `, "")}</strong>
                    </div>
                  </div>

                  <div className="approval-contract-summary-grid">
                    <div className="approval-summary-chip">
                      <span>Assigned workers</span>
                      <strong>{summary.assignedWorkers}</strong>
                    </div>
                    <div className="approval-summary-chip">
                      <span>Submitted</span>
                      <strong>{summary.submittedCount}</strong>
                    </div>
                    <div className="approval-summary-chip">
                      <span>Approved</span>
                      <strong>{summary.approvedCount}</strong>
                    </div>
                    <div className="approval-summary-chip">
                      <span>Pending</span>
                      <strong>{summary.pendingCount}</strong>
                    </div>
                  </div>

                  <div className="approval-progress-block">
                    <div className="approval-progress-header">
                      <span>Progress</span>
                      <strong>{summary.progress}%</strong>
                    </div>
                    <div className="approval-progress-track">
                      <div className="approval-progress-fill" style={{ width: `${summary.progress}%` }} />
                    </div>
                  </div>

                  <div className="approval-contract-actions">
                    <button
                      type="button"
                      className="button-secondary submission-view-button"
                      onClick={() => openContractSubmissions(group)}
                    >
                      View Submissions
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {activeContractGroup && (
        <div className="modal-overlay" onClick={() => setActiveContractId(null)}>
          <div className="modal-content contract-submissions-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{activeContractGroup.summary?.title || "Contract submissions"}</h2>
                <p className="modal-subtitle">
                  {activeContractGroup.summary?.submittedCount || 0} submitted, {activeContractGroup.summary?.approvedCount || 0} approved, {activeContractGroup.summary?.pendingCount || 0} pending
                </p>
              </div>
              <button className="modal-close" onClick={() => setActiveContractId(null)}>
                Close
              </button>
            </div>

            <div className="submission-contract-summary">
              <div className="submission-contract-summary-item">
                <span>Budget</span>
                <strong>{formatMoney(activeContractGroup.summary?.budget, activeContractGroup.summary?.currency)}</strong>
              </div>
              <div className="submission-contract-summary-item">
                <span>Assigned workers</span>
                <strong>{activeContractGroup.summary?.assignedWorkers || 0}</strong>
              </div>
              <div className="submission-contract-summary-item">
                <span>Progress</span>
                <strong>{activeContractGroup.summary?.progress || 0}%</strong>
              </div>
            </div>

            <div className="submission-grid">
              {activeContractGroup.submissions.map((submission) => {
                const hustler = getSubmissionHustler(submission);

                return (
                  <article key={submission._id} className="submission-grid-card">
                    <div className="submission-grid-card-top">
                      <div className="submission-worker">
                        <div className="hustler-avatar">
                          {hustler?.avatar ? <img src={hustler.avatar} alt={hustler.firstName || hustler.name || "Worker"} /> : getInitials(hustler)}
                        </div>
                        <div>
                          <h3>{hustler?.firstName || hustler?.name || "Assigned hustler"} {hustler?.lastName || ""}</h3>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <span className={`status-pill ${getStatusTone(submission)}`}>{getStatusLabel(submission)}</span>
                        <span className={`status-pill ${getPaymentStatusTone(submission)}`}>{getPaymentStatusLabel(submission)}</span>
                      </div>
                    </div>

                    <div className="submission-grid-meta">
                      <div>
                        <span>Payment</span>
                        <strong>{formatMoney(submission.amount, activeContractGroup.contract?.currency || "KSH")}</strong>
                      </div>
                      <div>
                        <span>Submitted</span>
                        <strong>{formatDate(submission.submittedAt)}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button-secondary submission-view-button"
                      onClick={() => {
                        setActiveSubmission(submission);
                        setRevisionReason("");
                      }}
                    >
                      View Submission
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeSubmission && (
        <div className="modal-overlay" onClick={() => setActiveSubmission(null)}>
          <div className="modal-content submission-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Submission Details</h2>
              <button className="modal-close" onClick={() => setActiveSubmission(null)}>
                Close
              </button>
            </div>

            <div className="submission-modal-body">
              <div className="submission-modal-grid">
                <div className="submission-modal-field">
                  <label>Worker</label>
                  <strong>{getSubmissionHustler(activeSubmission)?.firstName || "Assigned hustler"} {getSubmissionHustler(activeSubmission)?.lastName || ""}</strong>
                </div>
                <div className="submission-modal-field">
                  <label>Status</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <strong className={`status-pill ${getStatusTone(activeSubmission)}`}>{getStatusLabel(activeSubmission)}</strong>
                    <strong className={`status-pill ${getPaymentStatusTone(activeSubmission)}`}>{getPaymentStatusLabel(activeSubmission)}</strong>
                  </div>
                </div>
                <div className="submission-modal-field">
                  <label>Submitted</label>
                  <strong>{formatDate(activeSubmission.submittedAt)}</strong>
                </div>
                <div className="submission-modal-field">
                  <label>Payment</label>
                  <strong>{formatMoney(activeSubmission.amount, activeSubmission.contract?.currency || "KSH")}</strong>
                </div>
                <div className="submission-modal-field">
                  <label>Payment Status</label>
                  <strong className={`status-pill ${getPaymentStatusTone(activeSubmission)}`}>{getPaymentStatusLabel(activeSubmission)}</strong>
                </div>
              </div>

              <div className="submission-modal-section">
                <label>Task Description</label>
                <div className="submission-detail-box">{activeSubmission.description || "No description provided."}</div>
              </div>

              {(activeSubmission.completionNotes || activeSubmission.submissionData?.notes) && (
                <div className="submission-modal-section">
                  <label>Completion Notes</label>
                  <div className="submission-detail-box">
                    {activeSubmission.completionNotes || activeSubmission.submissionData?.notes}
                  </div>
                </div>
              )}

              <div className="submission-modal-section">
                <label>Attachments</label>
                {activeSubmission.proofFiles?.length ? (
                  <div className="submission-attachment-list">
                    {activeSubmission.proofFiles.map((file) => (
                      <span key={file}>{file}</span>
                    ))}
                  </div>
                ) : activeSubmission.submissionData?.workSampleUrl ? (
                  <a href={activeSubmission.submissionData.workSampleUrl} target="_blank" rel="noopener noreferrer">
                    View work sample
                  </a>
                ) : (
                  <div className="submission-detail-box">No attachments provided.</div>
                )}
              </div>

              <div className="submission-modal-section">
                <label>Revision Reason</label>
                <textarea
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  placeholder="Explain what needs to be improved or fixed..."
                  rows={4}
                />
                <small>Use this if the work needs changes before approval.</small>
              </div>

              <div className="submission-modal-section">
                <label>Reject Work</label>
                <div className="submission-modal-grid">
                  <div className="submission-modal-field">
                    <label>Rejection reason *</label>
                    <select value={rejectReasonType} onChange={(event) => setRejectReasonType(event.target.value)}>
                      {REJECTION_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="submission-modal-field">
                    <label>Comments</label>
                    <textarea
                      value={rejectComments}
                      onChange={(event) => setRejectComments(event.target.value)}
                      placeholder="Optional notes for the worker..."
                      rows={4}
                    />
                  </div>
                </div>
                <small>Rejecting work keeps escrow secured until any dispute is resolved.</small>
              </div>

              <div className="submission-modal-actions">
                <button type="button" className="button-primary" onClick={() => handleApprove(activeSubmission._id)} disabled={actionLoading}>
                  {actionLoading ? "Approving..." : "Approve Work"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleRequestRevision(activeSubmission._id)}
                  disabled={actionLoading || !revisionReason.trim()}
                >
                  {actionLoading ? "Sending..." : "Request Revision"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleRejectWork(activeSubmission._id)}
                  disabled={actionLoading || !rejectReasonType}
                >
                  {actionLoading ? "Rejecting..." : "Reject Work"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleMessageWorker(activeSubmission)}
                  disabled={actionLoading}
                >
                  Message Worker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
