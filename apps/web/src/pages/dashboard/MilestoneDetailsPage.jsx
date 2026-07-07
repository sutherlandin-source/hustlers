import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useMilestonesStore } from "../../state/useMilestonesStore.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export default function MilestoneDetailsPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const { milestoneId } = useParams();
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [proofLink, setProofLink] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const {
    milestone,
    milestoneLoading,
    milestoneError,
    submitMilestone,
    submitLoading,
    actionError,
    fetchMilestone,
  } = useMilestonesStore();

  useEffect(() => {
    fetchMilestone(milestoneId);
  }, [milestoneId]);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleSubmit = async () => {
    setActionMessage("");
    try {
      await submitMilestone(milestoneId, {
        notes: submissionNotes,
        proofLink: proofLink.trim() || null,
        proofFileName: selectedFile?.name || null,
      });
      setActionMessage("Milestone submitted for approval.");
      setSubmissionNotes("");
      setProofLink("");
      setSelectedFile(null);
      fetchMilestone(milestoneId);
    } catch (err) {
      console.error(err);
    }
  };

  const submitAllowed = milestone && ["pending", "rejected", "PENDING", "REJECTED"].includes(milestone.status);

  const isSubmittedOrCompleted = (m) => {
    if (!m) return false;
    const s = m.status || "";
    const ws = m.workStatus || "";
    return ws === "work_submitted" || ["submitted", "SUBMITTED", "approved", "APPROVED"].includes(s);
  };

  const getDisplayStatus = (m) => {
    if (!m) return "Not Started";
    if (isSubmittedOrCompleted(m)) return "Completed";
    if ((m.workStatus || "") === "in_progress" || ["in_progress", "IN_PROGRESS"].includes(m.status)) return "In Progress";
    return "Not Started";
  };

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Work Stage Details</h2>
          <p>Mark your work complete and review approval status for this stage.</p>
        </div>
        <Link to="/milestones" className="button-secondary">
          Back to work stages
        </Link>
      </header>

      {milestoneLoading && <Loader label="Loading work stage..." />}
      {milestoneError && <ErrorBanner error={milestoneError} />}

      {!milestoneLoading && !milestoneError && milestone && (
        <div className="contract-details-grid">
          <div className="card">
            <h3>{milestone.title}</h3>
            <p>{milestone.description}</p>
            <dl>
              <dt>Status</dt>
              <dd>{getDisplayStatus(milestone)}</dd>
              <dt>Payment</dt>
              <dd>{milestone.amount}</dd>
              <dt>Due date</dt>
              <dd>{formatDate(milestone.dueDate)}</dd>
              <dt>Job</dt>
              <dd>{milestone.contract?.title || "—"}</dd>
              <dt>Completed by</dt>
              <dd>{milestone.submittedBy || "Not completed"}</dd>
              <dt>Completed at</dt>
              <dd>{milestone.submittedAt ? new Date(milestone.submittedAt).toLocaleString() : "Not completed"}</dd>
              {milestone.rejectionReason && (
                <>
                  <dt>Rejection reason</dt>
                  <dd>{milestone.rejectionReason}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="card">
            <h4>Mark Work Complete</h4>
            {actionError && <ErrorBanner error={actionError} />}
            {actionMessage && <div className="success-banner">{actionMessage}</div>}

            <label>
              Completion notes
              <textarea
                value={submissionNotes}
                onChange={(event) => setSubmissionNotes(event.target.value)}
                rows="5"
                placeholder="Describe what you completed for this work stage"
              />
            </label>

            <label>
              Work sample link
              <input
                type="url"
                value={proofLink}
                onChange={(event) => setProofLink(event.target.value)}
                placeholder="Paste a work sample or delivery link"
              />
            </label>

            <label>
              Proof file
              <input type="file" onChange={handleFileChange} />
              {selectedFile && <p className="field-success">Selected file: {selectedFile.name}</p>}
            </label>

            {submitAllowed ? (
              <button className="button-primary" disabled={submitLoading} onClick={handleSubmit}>
                {submitLoading ? "Marking complete..." : "Mark Work Complete"}
              </button>
            ) : (
              <div className="info-message">
                {isSubmittedOrCompleted(milestone)
                  ? "Work has been submitted and is awaiting approval."
                  : milestone.status === "APPROVED" || milestone.status === "approved"
                  ? "This work stage has been approved."
                  : `This work stage is in status ${milestone.status || milestone.workStatus || 'unknown'}.`}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
