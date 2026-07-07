import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { milestonesService } from "../../services/milestonesService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

const MILESTONE_STATUS = {
  SUBMITTED: "submitted",
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function getInitials(user) {
  const first = user?.firstName || user?.name || "";
  const last = user?.lastName || "";
  return `${first[0] || "H"}${last[0] || ""}`.toUpperCase();
}

export default function TaskApprovalsPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    setLoading(true);
    setError("");
    try {
      const milestones = await milestonesService.list({ status: MILESTONE_STATUS.SUBMITTED });
      setSubmissions(milestones || []);
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
      setSelectedSubmission(null);
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

  const pendingReview = submissions.filter((s) => s.status === MILESTONE_STATUS.SUBMITTED);
  const totalValue = pendingReview.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

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
            <strong>{totalValue.toLocaleString()} KSH</strong>
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
            {pendingReview.map((submission) => (
              <div key={submission._id} className="approval-card">
                <div className="approval-card-header">
                  <div className="hustler-avatar">{getInitials(submission.contract?.seller)}</div>
                  <div className="card-details">
                    <div className="approval-title-row">
                      <h3>{submission.title}</h3>
                      <span className="status-pill status-submitted">Submitted</span>
                    </div>
                    <p className="hustler-info">
                      {submission.contract?.seller?.firstName || "Assigned hustler"} {submission.contract?.seller?.lastName || ""}
                    </p>
                    <p className="submission-timestamp">Submitted {formatDate(submission.submittedAt)}</p>
                  </div>
                </div>

                <div className="approval-card-body">
                  <div className="approval-meta-grid">
                    <div className="approval-item">
                      <div className="approval-label">Amount</div>
                      <div className="approval-value">
                        {submission.amount} {submission.contract?.currency || "KSH"}
                      </div>
                    </div>
                    <div className="approval-item">
                      <div className="approval-label">Contract</div>
                      <div className="approval-value">{submission.contract?.title || "Untitled contract"}</div>
                    </div>
                    <div className="approval-item">
                      <div className="approval-label">Payment</div>
                      <div className="approval-value">{(submission.paymentStatus || "pending").replace("_", " ")}</div>
                    </div>
                  </div>

                  <div className="approval-section">
                    <div className="approval-label">Task Description</div>
                    <p>{submission.description || "No description provided."}</p>
                  </div>

                  {(submission.completionNotes || submission.submissionData?.notes) && (
                    <div className="approval-section">
                      <div className="approval-label">Completion Notes</div>
                      <div className="completion-notes-box">
                        {submission.completionNotes || submission.submissionData?.notes}
                      </div>
                    </div>
                  )}

                  {submission.proofFiles?.length > 0 && (
                    <div className="approval-section">
                      <div className="approval-label">Proof Files</div>
                      <div className="proof-file-list">
                        {submission.proofFiles.map((file) => (
                          <span key={file}>{file}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission.submissionData?.workSampleUrl && (
                    <div className="work-sample-section">
                      <div className="work-sample-text">
                        <a href={submission.submissionData.workSampleUrl} target="_blank" rel="noopener noreferrer">
                          View Work Sample
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <div className="approval-actions">
                  <button className="button-approve" onClick={() => handleApprove(submission._id)} disabled={actionLoading}>
                    {actionLoading ? "Approving..." : "Approve Work"}
                  </button>
                  <button className="button-reject" onClick={() => setSelectedSubmission(submission._id)} disabled={actionLoading}>
                    Request Revision
                  </button>
                </div>

                {selectedSubmission === submission._id && (
                  <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
                    <div className="modal-content revision-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-header">
                        <h2 className="modal-title">Request Revision</h2>
                        <button className="modal-close" onClick={() => setSelectedSubmission(null)}>
                          Close
                        </button>
                      </div>
                      <div className="modal-body">
                        <div className="modal-field">
                          <label>Revision Reason *</label>
                          <textarea
                            value={revisionReason}
                            onChange={(e) => setRevisionReason(e.target.value)}
                            placeholder="Explain what needs to be improved or fixed..."
                          />
                          <small>Be specific so the hustler understands what needs improvement.</small>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="modal-button modal-button-secondary" onClick={() => setSelectedSubmission(null)} disabled={actionLoading}>
                          Cancel
                        </button>
                        <button
                          className="modal-button modal-button-primary"
                          onClick={() => handleRequestRevision(submission._id)}
                          disabled={actionLoading || !revisionReason.trim()}
                        >
                          {actionLoading ? "Sending..." : "Send Revision Request"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
