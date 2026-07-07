import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import { milestonesService } from "../../services/milestonesService.js";
import Loader from "../../components/Loader.jsx";

export default function ManagerMilestonesPage() {
  const { user } = useAuth();
  const { milestones, milestonesLoading, milestonesError, fetchMilestones } = useDataStore();
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const userId = user?._id || user?.id;

  useEffect(() => {
    fetchMilestones();
  }, []);

  const milestoneList = Array.isArray(milestones) ? milestones : milestones?.milestones ?? [];
  
  const managerStages = milestoneList.filter((m) => {
    return m?.contract?.buyer?._id === userId || m?.contract?.buyer === userId;
  });

  const pendingStages = managerStages.filter((m) => ["PENDING", "SUBMITTED", "pending", "submitted"].includes(m.status));
  const approvedStages = managerStages.filter((m) => ["APPROVED", "approved"].includes(m.status));
  const rejectedStages = managerStages.filter((m) => ["REJECTED", "rejected"].includes(m.status));

  const handleApprove = async (milestoneId) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await milestonesService.approve(milestoneId);
      setActionSuccess("Milestone approved successfully!");
      await fetchMilestones();
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setActionError(err.message || "Failed to approve milestone");
      console.error("Approve error:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (milestoneId) => {
    if (!rejectReason.trim()) {
      setActionError("Please provide a rejection reason");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await milestonesService.reject(milestoneId, rejectReason);
      setActionSuccess("Milestone rejected successfully!");
      await fetchMilestones();
      setSelectedMilestone(null);
      setRejectReason("");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setActionError(err.message || "Failed to reject milestone");
      console.error("Reject error:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const renderMilestoneCard = (milestone, showApprovalButtons = false) => (
    <article key={milestone._id || milestone.id} className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ flex: 1 }}>
          <h3>{milestone.title}</h3>
          <p style={{ color: "#666", marginTop: "8px" }}>{milestone.description}</p>
          <div style={{ marginTop: "12px", fontSize: "14px" }}>
            <p>
              <strong>Payment:</strong> {milestone.contract?.currency || "KES"} {milestone.amount || "0"}
            </p>
            <p>
              <strong>Job:</strong> {milestone.contract?.title}
            </p>
            {milestone.submittedBy && (
              <p>
                <strong>Submitted by:</strong> {milestone.submittedBy.firstName} {milestone.submittedBy.lastName}
              </p>
            )}
            {milestone.submissionData && (
              <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
                <p>
                  <strong>Completion Notes:</strong>
                </p>
                <p>{milestone.submissionData.notes}</p>
                {milestone.submissionData.proofLink && (
                  <p>
                    <strong>Work Sample:</strong> <a href={milestone.submissionData.proofLink}>{milestone.submissionData.proofLink}</a>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <span
          style={{
            backgroundColor: milestone.status === "APPROVED" ? "#4CAF50" : milestone.status === "REJECTED" ? "#F44336" : "#FFA500",
            color: "white",
            padding: "6px 12px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: "bold",
            marginLeft: "12px",
          }}
        >
          {milestone.status}
        </span>
      </div>

      {showApprovalButtons && (
        <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
          <button 
            className="button-primary" 
            onClick={() => handleApprove(milestone._id || milestone.id)}
            disabled={actionLoading}
          >
            {actionLoading ? "Processing..." : "Approve"}
          </button>
          <button
            className="button-secondary"
            onClick={() => setSelectedMilestone(milestone._id || milestone.id)}
            disabled={actionLoading}
            style={{ backgroundColor: "#F44336", color: "white", border: "none" }}
          >
            Reject
          </button>
        </div>
      )}

      {selectedMilestone === (milestone._id || milestone.id) && (
        <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
          <label>
            Rejection reason:
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why you're rejecting this work stage..."
              style={{ marginTop: "8px", width: "100%", minHeight: "80px" }}
              disabled={actionLoading}
            />
          </label>
          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <button 
              className="button-secondary" 
              onClick={() => handleReject(milestone._id || milestone.id)}
              disabled={actionLoading}
            >
              {actionLoading ? "Processing..." : "Confirm Rejection"}
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                setSelectedMilestone(null);
                setRejectReason("");
              }}
              disabled={actionLoading}
              style={{ backgroundColor: "#999" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Work Stage Reviews</h2>
          <p>Review completed work stages and approve work. Payment releases only after final contract approval.</p>
        </div>
      </header>

      {milestonesError && <div className="error-banner">{milestonesError.message}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}
      {actionSuccess && <div style={{ padding: "12px 16px", backgroundColor: "#4CAF50", color: "white", borderRadius: "4px", marginBottom: "16px" }}>{actionSuccess}</div>}

      {milestonesLoading ? (
        <Loader />
      ) : (
        <>
          {pendingStages.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ marginBottom: "16px", color: "#FFA500" }}>⏳ Pending Review ({pendingStages.length})</h3>
              <div className="card-list">{pendingStages.map((m) => renderMilestoneCard(m, true))}</div>
            </div>
          )}

          {approvedStages.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ marginBottom: "16px", color: "#4CAF50" }}>✓ Approved ({approvedStages.length})</h3>
              <div className="card-list">{approvedStages.map((m) => renderMilestoneCard(m, false))}</div>
            </div>
          )}

          {rejectedStages.length > 0 && (
            <div>
              <h3 style={{ marginBottom: "16px", color: "#F44336" }}>✗ Rejected ({rejectedStages.length})</h3>
              <div className="card-list">{rejectedStages.map((m) => renderMilestoneCard(m, false))}</div>
            </div>
          )}

          {managerStages.length === 0 && (
            <div className="card">
              <h3>No work stages</h3>
              <p>Work stages will appear here once workers complete and submit their work for approval.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
