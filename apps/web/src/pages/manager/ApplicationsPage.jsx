/**
 * ApplicationsPage
 * Manager interface for reviewing contract applications
 */

import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import ContractApplicationsService from "../../services/contractApplicationsService.js";
import { contractsService } from "../../services/contractsService.js";
import useApplicationStore from "../../state/useApplicationStore.js";

function formatMoney(amount, currency = "KSH") {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function getApplicationContract(application) {
  return application?.contract || application?.contractId || {};
}

function getApplicationContractId(application) {
  const contract = getApplicationContract(application);
  return contract?._id || application?.contractId?._id || application?.contractId || application?.contract;
}

function getApplicantName(application) {
  const hustler = application?.hustlerId || {};
  return hustler.name || hustler.email || "Unknown applicant";
}

function isContractFunded(contract) {
  return Boolean(contract?.escrowPrepared) || ["funded", "in_progress", "awaiting_approval", "released"].includes(contract?.escrowStatus);
}

export default function ApplicationsPage() {
  const { user } = useAuth();
  const {
    acceptApplication,
    rejectApplication,
    getPendingApplications,
    loading,
    error,
    successMessage,
    clearMessages,
  } = useApplicationStore();

  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [selectedContractApplications, setSelectedContractApplications] = useState([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState(null); // 'accepted' | 'rejected' | null
  const [fundingNotice, setFundingNotice] = useState(null);

  const applicationGroups = useMemo(() => {
    const map = new Map();
    applications.forEach((app) => {
      const contract = getApplicationContract(app);
      const contractId = String(getApplicationContractId(app) || app._id);
      if (!map.has(contractId)) {
        map.set(contractId, {
          contract,
          contractId,
          applications: [],
          latestAppliedAt: app.appliedAt || app.createdAt || app.created_at,
        });
      }
      const group = map.get(contractId);
      group.applications.push(app);
      const appliedAt = app.appliedAt || app.createdAt || app.created_at;
      if (new Date(appliedAt || 0) > new Date(group.latestAppliedAt || 0)) {
        group.latestAppliedAt = appliedAt;
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.latestAppliedAt || 0) - new Date(a.latestAppliedAt || 0));
  }, [applications]);

  // Load applications for all contracts
  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setApplicationsLoading(true);
    try {
      // Minimal fix: load all contracts owned by this manager, then fetch applications per contract
      const managerId = user?._id || user?.userId || user?.id;
      const contracts = await contractsService.list({ buyerId: managerId });
      const appsByContract = await Promise.all(
        contracts.map(async (c) => {
          try {
            const res = await ContractApplicationsService.getContractApplications(c._id);
            const apps = res?.data || [];
            // attach contract object for rendering
            return apps.map((a) => ({ ...a, contract: c }));
          } catch (err) {
            return [];
          }
        })
      );

      // flatten and sort by appliedAt desc
      const flattened = appsByContract.flat().sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
      setApplications(flattened);
    } catch (err) {
      console.error("Error loading applications:", err);
      setApplications([]);
    } finally {
      setApplicationsLoading(false);
    }
  };

  const openApplicationDetails = async (application, contractApplications = []) => {
    try {
      const details = await ContractApplicationsService.getApplicationDetails(
        application._id
      );
      let applicationDetails = details.data;
      const contractId = getApplicationContractId(applicationDetails);
      if (contractId) {
        try {
          let freshContract = await contractsService.get(contractId);
          if (applicationDetails.status === "accepted" && !isContractFunded(freshContract)) {
            try {
              await contractsService.prepareEscrow(contractId, Number(freshContract.amount || 0));
              freshContract = await contractsService.get(contractId);
            } catch (err) {
              console.warn("Accepted contract still needs escrow funding", err);
            }
          }
          applicationDetails = {
            ...applicationDetails,
            contract: freshContract,
            contractId: freshContract,
          };
        } catch (err) {
          console.warn("Failed to refresh contract funding status", err);
        }
      }
      setSelectedApplication(applicationDetails);
      setSelectedContractApplications(contractApplications.length ? contractApplications : [applicationDetails]);
      setActionStatus(applicationDetails.status || null);
      const contract = getApplicationContract(applicationDetails);
      const needsFunding =
        applicationDetails.status === "accepted" &&
        !isContractFunded(contract);
      setFundingNotice(needsFunding ? applicationDetails : null);
      setShowDetailsModal(true);
    } catch (err) {
      console.error("Error loading application details:", err);
    }
  };

  // Handle view applications for one contract
  const handleViewContractApplications = async (group) => {
    try {
      const contractId = group.contract?._id || group.contractId;
      let freshContract = group.contract || {};
      let contractApplications = group.applications || [];

      if (contractId) {
        try {
          freshContract = await contractsService.get(contractId);
        } catch (err) {
          console.warn("Failed to refresh contract", err);
        }

        try {
          const res = await ContractApplicationsService.getContractApplications(contractId);
          contractApplications = (res?.data || [])
            .map((app) => ({ ...app, contract: freshContract, contractId: freshContract }))
            .sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0));
        } catch (err) {
          console.warn("Failed to refresh contract applications", err);
        }
      }

      const firstActionable =
        contractApplications.find((app) => app.status === "pending") ||
        contractApplications.find((app) => app.status === "accepted") ||
        contractApplications[0];

      if (firstActionable) {
        await openApplicationDetails(firstActionable, contractApplications);
      }
    } catch (err) {
      console.error("Error loading contract applications:", err);
    }
  };

  const handleViewDetails = async (application) => {
    const contractId = String(getApplicationContractId(application) || "");
    const group = applicationGroups.find((item) => String(item.contractId) === contractId);
    if (group) {
      await handleViewContractApplications(group);
      return;
    }
    await openApplicationDetails(application);
  };

  // Handle accept application
  const handleAccept = async () => {
    try {
      setActionLoading(true);
      const acceptedApplication = await acceptApplication(selectedApplication._id);
      // reflect acceptance in UI without changing backend logic
      setActionStatus("accepted");
      setSelectedApplication((s) => ({ ...(s || {}), ...(acceptedApplication || {}), status: "accepted" }));
      setSelectedContractApplications((items) =>
        items.map((item) =>
          item._id === selectedApplication._id
            ? { ...item, ...(acceptedApplication || {}), status: "accepted" }
            : item
        )
      );
      setFundingNotice(acceptedApplication?.escrowFunded === false ? acceptedApplication : null);
      const contractId = getApplicationContractId(selectedApplication);
      if (contractId) {
        try {
          const response = await ContractApplicationsService.getContractApplications(contractId);
          const refreshedApplications = response?.data || [];
          setSelectedContractApplications(refreshedApplications);
        } catch (err) {
          console.warn("Failed to refresh selected contract applications", err);
        }
      }
      // keep modal open but disable actions
      setActionLoading(false);
      // refresh list in background
      loadApplications();
    } catch (err) {
      console.error("Error accepting application:", err);
      setActionLoading(false);
    }
  };

  // Handle reject application
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setRejectionError("Please provide a reason for rejection");
      return;
    }

    try {
      setActionLoading(true);
      await rejectApplication(selectedApplication._id, rejectionReason);
      // reflect rejection in UI
      setActionStatus("rejected");
      setSelectedApplication((s) => ({ ...(s || {}), status: "rejected", rejectionReason }));
      setSelectedContractApplications((items) =>
        items.map((item) => (item._id === selectedApplication._id ? { ...item, status: "rejected", rejectionReason } : item))
      );
      setShowRejectModal(false);
      setRejectionReason("");
      setRejectionError("");
      setFundingNotice(null);
      setActionLoading(false);
      // refresh list in background
      loadApplications();
    } catch (err) {
      console.error("Error rejecting application:", err);
      setRejectionError(err.error?.message || "Failed to reject application");
    }
  };

  if (applicationsLoading) {
    return <Loader />;
  }
  return (
    <div className="applications-container">
      <div className="applications-header">
        <h1>My Applications</h1>
        <p>Review applicants, accept the right hustler, and secure escrow before work starts.</p>
      </div>

      {error && <ErrorBanner message={error} />}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      {applicationGroups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">0</div>
          <h3>No applications yet</h3>
          <p>Browse contracts to find work you can apply for.</p>
        </div>
      ) : (
        <div className="applications-grid">
          {applicationGroups.map((group) => {
            const contract = group.contract || {};
            const title = contract.title || "Untitled";
            const description = contract.description || "";
            const applicationsForContract = group.applications || [];
            const app = applicationsForContract.find((item) => item.status === "pending") || applicationsForContract[0] || {};
            const pendingCount = applicationsForContract.filter((app) => app.status === "pending").length;
            const acceptedCount = applicationsForContract.filter((app) => app.status === "accepted").length;
            const rejectedCount = applicationsForContract.filter((app) => app.status === "rejected").length;
            const status = acceptedCount > 0 ? "accepted" : pendingCount > 0 ? "pending" : "reviewed";
            const appliedAt = group.latestAppliedAt;
            const showWork = ["approved", "in_progress", "active"].includes(status);

            return (
              <div key={group.contractId || contract._id || title} className="application-card">
                <div className="card-header">
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <h3>{title}</h3>
                        <small className="muted">
                          {applicationsForContract.length} applicant{applicationsForContract.length === 1 ? "" : "s"} / {pendingCount} pending
                        </small>
                      </div>
                      <span className={`status-pill status-${status}`}>{status}</span>
                    </div>
                    <p className="muted">{description}</p>
                <div className="meta-row">
                  <small>Latest application: {appliedAt ? new Date(appliedAt).toLocaleString() : "-"}</small>
                  <small>{acceptedCount} accepted / {rejectedCount} rejected</small>
                </div>

                {showWork && (
                  <div className="work-requirements">
                    <h4>Work Requirements</h4>
                    {contract.milestones && contract.milestones.length > 0 ? (
                      <ul>
                        {contract.milestones.map((m) => (
                          <li key={m._id || m}>{m.title || m.description || m}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="muted">No milestones defined for this contract</div>
                    )}

                    {contract.metadata?.tasks && contract.metadata.tasks.length > 0 && (
                      <div>
                        <strong>Tasks:</strong>
                        <ul>
                          {contract.metadata.tasks.map((t, i) => (
                            <li key={t.id || i}>{t.title || t}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {contract.metadata?.deliverables && contract.metadata.deliverables.length > 0 && (
                      <div>
                        <strong>Deliverables:</strong>
                        <ul>
                          {contract.metadata.deliverables.map((d, i) => (
                            <li key={d.id || i}>{d.title || d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="card-actions action-controls">
                  <button className="btn-view-profile" onClick={() => handleViewDetails(app)}>View profile</button>
                  {user?.role === 'manager' && app.status === 'pending' && (
                    <>
                      <button onClick={() => handleViewDetails(app)} className="btn-quick-accept">Review</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Application Details Modal */}
      {showDetailsModal && selectedApplication && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Application Details</h2>
              <button
                className="close-btn"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
            </div>

            {selectedContractApplications.length > 0 && (
              <div className="contract-applicant-list">
                <div className="contract-applicant-list-header">
                  <h3>{getApplicationContract(selectedApplication).title || "Contract"} applicants</h3>
                  <span>{selectedContractApplications.length} total</span>
                </div>
                <div className="contract-applicant-grid">
                  {selectedContractApplications.map((application) => (
                    <button
                      key={application._id}
                      type="button"
                      className={`contract-applicant-card ${selectedApplication._id === application._id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedApplication(application);
                        setActionStatus(application.status || null);
                        const contract = getApplicationContract(application);
                        const needsFunding = application.status === "accepted" && !isContractFunded(contract);
                        setFundingNotice(needsFunding ? application : null);
                      }}
                    >
                      <strong>{getApplicantName(application)}</strong>
                      <span>{application.status || "pending"}</span>
                      <small>{application.appliedAt ? new Date(application.appliedAt).toLocaleString() : "No date"}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="application-details">
              {/* Applicant Profile */}
              <div className="applicant-section">
                <h3>Applicant Profile</h3>
                <div className="applicant-info">
                  {selectedApplication.hustlerId?.avatar && (
                    <img
                      src={selectedApplication.hustlerId.avatar}
                      alt={selectedApplication.hustlerId.name}
                      className="applicant-avatar"
                    />
                  )}
                  <div className="applicant-details">
                    <h4>{selectedApplication.hustlerId?.name}</h4>
                    <p className="email">{selectedApplication.hustlerId?.email}</p>
                    {selectedApplication.hustlerId?.rating && (
                      <p className="rating">
                        {selectedApplication.hustlerId.rating} rating
                      </p>
                    )}
                    {selectedApplication.hustlerId?.skills && (
                      <div className="skills">
                        {selectedApplication.hustlerId.skills.map((skill) => (
                          <span key={skill} className="skill-tag">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Application Details */}
              <div className="application-section">
                <h3>Application Details</h3>
                {selectedApplication.coverLetter && (
                  <div className="detail-item">
                    <label>Cover Letter</label>
                    <p>{selectedApplication.coverLetter}</p>
                  </div>
                )}
                {selectedApplication.proposedRate && (
                  <div className="detail-item">
                    <label>Proposed Rate</label>
                    <p>
                      {selectedApplication.proposedRate}{" "}
                      {selectedApplication.contractId?.currency}
                    </p>
                  </div>
                )}
                {selectedApplication.estimatedDuration && (
                  <div className="detail-item">
                    <label>Estimated Duration</label>
                    <p>{selectedApplication.estimatedDuration}</p>
                  </div>
                )}
                <div className="detail-item">
                  <label>Applied On</label>
                  <p>
                    {new Date(selectedApplication.appliedAt).toLocaleDateString()} at{" "}
                    {new Date(selectedApplication.appliedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Contract Details */}
              <div className="contract-section">
                <h3>Contract Details</h3>
                <div className="detail-item">
                  <label>Title</label>
                  <p>{getApplicationContract(selectedApplication).title || "Untitled contract"}</p>
                </div>
                <div className="detail-item">
                  <label>Budget</label>
                  <p>
                    {getApplicationContract(selectedApplication).amount}{" "}
                    {getApplicationContract(selectedApplication).currency}
                  </p>
                </div>
                <div className="detail-item">
                  <label>Category</label>
                  <p>{getApplicationContract(selectedApplication).jobCategory || "Not set"}</p>
                </div>
              </div>

              {/* Status Display */}
              {/* Status display or action controls (manager only) */}
              <div style={{minHeight:48}}>
                {selectedApplication.status === "accepted" && !fundingNotice && (
                  <div className="status-accepted">
                    <p>This application has been accepted</p>
                  </div>
                )}
                {selectedApplication.status === "accepted" && fundingNotice && (
                  <div className="status-funding-required">
                    <p>This application has been accepted</p>
                    <p className="funding-required-copy">
                      Escrow is not funded yet. {fundingNotice.escrowFundingError || "The manager wallet does not have enough available balance for this contract."}
                    </p>
                    <p className="funding-required-copy">
                      Contract amount: {formatMoney(getApplicationContract(fundingNotice).amount, getApplicationContract(fundingNotice).currency)}
                    </p>
                    <div className="funding-required-actions">
                      <Link to="/manager/wallet" className="btn-accept">Top up wallet</Link>
                      <Link to={`/manager/contracts/${getApplicationContractId(fundingNotice)}`} className="btn-view-profile">Open contract</Link>
                    </div>
                  </div>
                )}
                {selectedApplication.status === "rejected" && (
                  <div className="status-rejected">
                    <p>❌ This application was rejected</p>
                    {selectedApplication.rejectionReason && (
                      <p className="reason">Reason: {selectedApplication.rejectionReason}</p>
                    )}
                  </div>
                )}

                {selectedApplication.status === "pending" && user?.role === "manager" && (
                  <div className="modal-actions action-controls">
                    <button
                      className="btn-view-profile"
                      onClick={() => {
                        // quick link to profile or view more info
                      }}
                    >
                      View profile
                    </button>

                    <button
                      className="btn-reject"
                      onClick={() => {
                        setShowDetailsModal(false);
                        setShowRejectModal(true);
                      }}
                      disabled={actionLoading || loading}
                    >
                      Reject
                    </button>

                    <button
                      className="btn-accept"
                      onClick={handleAccept}
                      disabled={actionLoading || loading}
                    >
                      {actionLoading ? "Processing..." : "Accept Application"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && selectedApplication && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reject Application</h2>
              <button
                className="close-btn"
                onClick={() => setShowRejectModal(false)}
              >
                Close
              </button>
            </div>

            <div className="rejection-form">
              <p className="applicant-name">
                From: {selectedApplication.hustlerId?.name}
              </p>

              <div className="form-group">
                <label>Reason for Rejection</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    setRejectionError("");
                  }}
                  placeholder="Explain why you're rejecting this application (the applicant will see this message)..."
                  maxLength={500}
                  rows={4}
                />
                <small>
                  {rejectionReason.length}/500 characters
                </small>
              </div>

              {rejectionError && (
                <div className="error-message">{rejectionError}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleReject}
                  disabled={loading}
                >
                  {loading ? "Rejecting..." : "Reject Application"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
