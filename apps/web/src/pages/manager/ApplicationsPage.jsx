/**
 * ApplicationsPage
 * Manager interface for reviewing contract applications
 */

import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import PublicHustlerProfileModal from "../../components/PublicHustlerProfileModal.jsx";
import ContractApplicationsService from "../../services/contractApplicationsService.js";
import { conversationsService } from "../../services/conversationsService.js";
import { contractsService } from "../../services/contractsService.js";
import useApplicationStore from "../../state/useApplicationStore.js";
import { isManagerRole } from "../../utils/roles.js";
import { getKycProfilePath, hasKycVerification } from "../../utils/kyc.js";

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
  return hustler.name || [hustler.firstName, hustler.lastName].filter(Boolean).join(" ") || "Unknown applicant";
}

function isContractFunded(contract) {
  return Boolean(contract?.escrowPrepared) || ["funded", "in_progress", "awaiting_approval", "released"].includes(contract?.escrowStatus);
}

// ─── Sort / filter ────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: "all",      label: "All"      },
  { key: "pending",  label: "Has Pending" },
  { key: "accepted", label: "Has Accepted" },
  { key: "rejected", label: "All Rejected" },
];

const SORT_OPTIONS = [
  { key: "newest",       label: "Newest first"          },
  { key: "oldest",       label: "Oldest first"          },
  { key: "most_apps",    label: "Most applicants"       },
  { key: "most_pending", label: "Most pending"          },
  { key: "title_asc",    label: "Title: A → Z"          },
  { key: "title_desc",   label: "Title: Z → A"          },
  { key: "amount_desc",  label: "Budget: high → low"    },
  { key: "amount_asc",   label: "Budget: low → high"    },
];

function applyGroupFiltersAndSort(groups, search, filter, sort) {
  let result = groups;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((g) =>
      [g.contract?.title, g.contract?.description, g.contract?.jobCategory]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }

  if (filter !== "all") {
    result = result.filter((g) => {
      const apps = g.applications || [];
      if (filter === "pending")  return apps.some((a) => a.status === "pending");
      if (filter === "accepted") return apps.some((a) => ["accepted", "approved", "active"].includes(a.status));
      if (filter === "rejected") return apps.length > 0 && apps.every((a) => ["rejected", "cancelled"].includes(a.status));
      return true;
    });
  }

  const sorted = [...result];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.latestAppliedAt || 0) - new Date(b.latestAppliedAt || 0));
    case "most_apps":
      return sorted.sort((a, b) => (b.applications?.length || 0) - (a.applications?.length || 0));
    case "most_pending":
      return sorted.sort((a, b) => {
        const pa = (a.applications || []).filter((x) => x.status === "pending").length;
        const pb = (b.applications || []).filter((x) => x.status === "pending").length;
        return pb - pa;
      });
    case "title_asc":
      return sorted.sort((a, b) => String(a.contract?.title || "").localeCompare(String(b.contract?.title || "")));
    case "title_desc":
      return sorted.sort((a, b) => String(b.contract?.title || "").localeCompare(String(a.contract?.title || "")));
    case "amount_desc":
      return sorted.sort((a, b) => Number(b.contract?.amount || 0) - Number(a.contract?.amount || 0));
    case "amount_asc":
      return sorted.sort((a, b) => Number(a.contract?.amount || 0) - Number(b.contract?.amount || 0));
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.latestAppliedAt || 0) - new Date(a.latestAppliedAt || 0));
  }
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const [fundingNotice, setFundingNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

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

  const visibleGroups = useMemo(
    () => applyGroupFiltersAndSort(applicationGroups, search, filter, sortBy),
    [applicationGroups, search, filter, sortBy]
  );

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
            if (!hasKycVerification(user)) {
              navigate(getKycProfilePath(location.pathname), {
                state: { from: location.pathname },
                replace: true,
              });
              return;
            }
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

  const handleMessageApplicant = async () => {
    try {
      const hustler = selectedApplication?.hustlerId || {};
      const hustlerId = hustler?._id || hustler?.id;
      if (!hustlerId) return;

      setMessagingLoading(true);
      const contractId = getApplicationContractId(selectedApplication);
      const conversation = await conversationsService.createConversation({
        participants: [user?._id || user?.userId || user?.id, hustlerId],
        ...(contractId ? { contractId } : {}),
      });
      navigate(`/manager/chat/${conversation._id || conversation.id}`, { replace: true });
    } catch (err) {
      console.error("Failed to open conversation with applicant:", err);
    } finally {
      setMessagingLoading(false);
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
        <>
          {/* Toolbar */}
          <div className="contracts-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="contracts-filter-bar" role="tablist" aria-label="Application filters" style={{ flexWrap: "wrap" }}>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`contracts-filter ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="contracts-toolbar-actions">
              <label className="contracts-search">
                <svg viewBox="0 0 20 20" aria-hidden="true" style={{ width: 16, height: 16 }}>
                  <path d="M13.3 12.1 16.6 15.4l-1.2 1.2-3.3-3.3a6 6 0 1 1 1.2-1.2zM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contracts…"
                  aria-label="Search applications"
                />
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort applications"
                style={{
                  border: "1px solid #E2E8F0", borderRadius: 8,
                  padding: "7px 12px", fontSize: "0.875rem",
                  fontWeight: 600, color: "#0F172A",
                  background: "#fff", cursor: "pointer", outline: "none",
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">0</div>
              <h3>No matching applications</h3>
              <p>Try adjusting your search or filter.</p>
            </div>
          ) : (
        <div className="applications-grid">
          {visibleGroups.map((group) => {
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
                  <button className="btn-view-profile" onClick={() => handleViewDetails(app)}>View application</button>
                </div>
              </div>
            );
          })}
        </div>
          )}
        </>
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
              <PublicHustlerProfileModal
                application={selectedApplication}
                onClose={() => setShowDetailsModal(false)}
                onApprove={handleAccept}
                onReject={() => {
                  setShowDetailsModal(false);
                  setShowRejectModal(true);
                }}
                onMessage={handleMessageApplicant}
                approving={actionLoading}
                rejecting={actionLoading && actionStatus === "rejected"}
                messaging={messagingLoading}
                embedded
              />

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

                {selectedApplication.status === "pending" && isManagerRole(user?.role) && (
                  <div className="status-pending" style={{ marginTop: "1rem" }}>
                    <p>Use the actions below to approve, reject, or message the applicant.</p>
                  </div>
                )}

                <div className="application-actions-inline">
                  <button type="button" className="button-primary" onClick={handleAccept} disabled={actionLoading || messagingLoading || selectedApplication.status === "accepted"}>
                    {actionLoading ? "Approving..." : "Approve applicant"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setShowDetailsModal(false);
                      setShowRejectModal(true);
                    }}
                    disabled={actionLoading || messagingLoading || selectedApplication.status === "rejected"}
                  >
                    Reject applicant
                  </button>
                  <button type="button" className="button-secondary" onClick={handleMessageApplicant} disabled={actionLoading || messagingLoading}>
                    {messagingLoading ? "Opening chat..." : "Message applicant"}
                  </button>
                </div>
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
