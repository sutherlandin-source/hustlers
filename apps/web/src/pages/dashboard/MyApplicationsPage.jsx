import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import ContractApplicationsService from "../../services/contractApplicationsService.js";
import { contractsService } from "../../services/contractsService.js";

export default function MyApplicationsPage() {
  const { user, accessToken } = useAuth();
  const userId = user?._id || user?.id;
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [editingApplication, setEditingApplication] = useState(null);
  const [editForm, setEditForm] = useState({ coverLetter: "", proposedRate: "", estimatedDuration: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const formatStatus = (status) => {
    if (!status) return "Pending";
    return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getContractRef = (app) => app.contract || app.contractId || null;

  const getContractId = (app) => {
    const contractRef = getContractRef(app);
    return contractRef?._id || contractRef;
  };

  const formatMoney = (contract) => {
    if (!contract?.amount) return "Not specified";
    return `${contract.currency || "KSH"} ${Number(contract.amount).toLocaleString()}`;
  };

  const isPendingApplication = (app) => {
    return !String(app?._id || "").startsWith("contract-") && (app.status || "pending").toLowerCase() === "pending";
  };

  useEffect(() => {
    if (userId && accessToken) {
      load();
    }
  }, [userId, accessToken]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ContractApplicationsService.getMyApplications();
      let apps = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

      if (apps.length === 0 && userId) {
        const assignedContracts = await contractsService.list({ sellerId: userId });
        apps = assignedContracts.map((contract) => ({
          _id: `contract-${contract._id}`,
          contractId: contract._id,
          status: contract.status,
          coverLetter: null,
          appliedAt: contract.appliedAt || contract.startDate || contract.createdAt,
          contract,
        }));
      }

      const appsWithContracts = await Promise.all(
        apps.map(async (app) => {
          const contractRef = getContractRef(app);
          const contractId = getContractId(app);
          if (contractRef && typeof contractRef === "object" && contractRef.title) {
            return { ...app, contract: contractRef };
          }
          if (contractId) {
            try {
              const contract = await contractsService.get(contractId);
              return { ...app, contract };
            } catch (err) {
              return { ...app, contract: contractRef };
            }
          }
          return { ...app, contract: app.contract || null };
        })
      );

      setApplications(appsWithContracts);
    } catch (err) {
      console.error("Failed loading my applications", err);
      setError(err.error?.message || err.message || "Failed to load applications");
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (app) => {
    if (String(app._id || "").startsWith("contract-")) {
      setSelectedApplication(app);
      return;
    }

    try {
      const details = await ContractApplicationsService.getApplicationDetails(app._id);
      setSelectedApplication(details.data || details);
    } catch (err) {
      console.error("Failed to load details", err);
      setError(err.error?.message || err.message || "Failed to load details");
    }
  };

  const openEditApplication = (app) => {
    setEditingApplication(app);
    setEditForm({
      coverLetter: app.coverLetter || "",
      proposedRate: app.proposedRate || app.contract?.amount || "",
      estimatedDuration: app.estimatedDuration || "",
    });
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingApplication) return;
    setActionLoading(true);
    setError(null);
    try {
      await ContractApplicationsService.updateApplication(editingApplication._id, {
        coverLetter: editForm.coverLetter,
        proposedRate: editForm.proposedRate ? Number(editForm.proposedRate) : undefined,
        estimatedDuration: editForm.estimatedDuration,
      });
      setEditingApplication(null);
      await load();
    } catch (err) {
      setError(err.error?.message || err.message || "Failed to update application");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelApplication = async (app) => {
    if (!window.confirm("Cancel this application?")) return;
    setActionLoading(true);
    setError(null);
    try {
      await ContractApplicationsService.cancelApplication(app._id);
      await load();
    } catch (err) {
      setError(err.error?.message || err.message || "Failed to cancel application");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loader />;

  const pendingCount = applications.filter((app) => ["pending", "applied"].includes((app.status || "").toLowerCase())).length;
  const acceptedCount = applications.filter((app) => ["accepted", "approved", "active", "in_progress"].includes((app.status || "").toLowerCase())).length;
  const rejectedCount = applications.filter((app) => ["rejected", "cancelled"].includes((app.status || "").toLowerCase())).length;

  return (
    <div className="my-applications-page">
      <header className="my-applications-header">
        <div>
          <p className="eyebrow">Applications</p>
          <h1>My Applications</h1>
          <p>Track every job you have applied for, review status changes, and open the work brief when a contract moves forward.</p>
        </div>
        <div className="application-summary">
          <div>
            <span>{applications.length}</span>
            <small>Total</small>
          </div>
          <div>
            <span>{pendingCount}</span>
            <small>Pending</small>
          </div>
          <div>
            <span>{acceptedCount}</span>
            <small>Active</small>
          </div>
          <div>
            <span>{rejectedCount}</span>
            <small>Closed</small>
          </div>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}

      {applications.length === 0 ? (
        <div className="my-applications-empty">
          <div className="empty-icon" aria-hidden="true" />
          <h3>No applications yet</h3>
          <p>Browse contracts to find work and apply.</p>
        </div>
      ) : (
        <div className="my-applications-grid">
          {applications.map((app) => {
            const contract = app.contract || {};
            const title = contract.title || app.contractTitle || "Untitled";
            const description = contract.description || app.contractDescription || "";
            const status = app.status || contract.status || "pending";
            const appliedAt = app.appliedAt || app.createdAt || app.created_at;
            const contractId = getContractId(app);
            const showWork = ["approved", "in_progress", "active"].includes(status);

            return (
              <article key={app._id || `${contract._id || app.contractId || title}`} className="my-application-card">
                <div className="my-application-card-header">
                  <div>
                    <h3>{title}</h3>
                    <p>{description || "No description provided."}</p>
                  </div>
                  <span className={`my-status-pill status-${status}`}>{formatStatus(status)}</span>
                </div>

                <div className="my-application-meta">
                  <div>
                    <small>Applied </small>
                    <strong>{appliedAt ? new Date(appliedAt).toLocaleDateString() : "-"}</strong>
                  </div>
                  <div>
                    <small>Budget </small>
                    <strong>{formatMoney(contract)}</strong>
                  </div>
                  <div>
                    <small>Category </small>
                    <strong>{contract.jobCategory || "General"}</strong>
                  </div>
                </div>

                {showWork && (
                  <div className="my-work-requirements">
                    <h4>Work Requirements</h4>
                    {contract.milestones && contract.milestones.length > 0 ? (
                      <ul>
                        {contract.milestones.map((m) => (
                          <li key={m._id || m}>{m.title || m.description || m}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="muted">No milestones defined</div>
                    )}
                  </div>
                )}

                <div className="my-application-actions">
                  {contractId && <span>Ref: {String(contractId).slice(-8).toUpperCase()}</span>}
                  <button type="button" onClick={() => handleViewDetails(app)}>View Details</button>
                  {isPendingApplication(app) && (
                    <>
                      <button type="button" onClick={() => openEditApplication(app)} disabled={actionLoading}>Edit</button>
                      <button type="button" className="btn-cancel" onClick={() => handleCancelApplication(app)} disabled={actionLoading}>Cancel</button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedApplication && (
        <div className="modal-overlay" onClick={() => setSelectedApplication(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Application Details</h2>
              <button className="close-btn" onClick={() => setSelectedApplication(null)}>Close</button>
            </div>
            <div className="my-application-details">
              <h3>{selectedApplication.contractId?.title || selectedApplication.contract?.title || "Application"}</h3>
              <div className="my-application-detail-grid">
                <div>
                  <small>Status</small>
                  <strong>{formatStatus(selectedApplication.status || selectedApplication.contract?.status)}</strong>
                </div>
                <div>
                  <small>Budget</small>
                  <strong>{formatMoney(selectedApplication.contract || selectedApplication.contractId)}</strong>
                </div>
              </div>
              {selectedApplication.coverLetter && (
                <div className="my-cover-letter">
                  <small>Cover Letter</small>
                  <p>{selectedApplication.coverLetter}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingApplication && (
        <div className="modal-overlay" onClick={() => setEditingApplication(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Application</h2>
              <button className="close-btn" onClick={() => setEditingApplication(null)}>Close</button>
            </div>
            <form className="application-edit-form" onSubmit={handleEditSubmit}>
              <label className="form-label">
                <span>Cover Letter</span>
                <textarea
                  value={editForm.coverLetter}
                  onChange={(event) => setEditForm((current) => ({ ...current, coverLetter: event.target.value }))}
                  rows={5}
                  maxLength={1000}
                  required
                />
              </label>
              <label className="form-label">
                <span>Proposed Rate</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.proposedRate}
                  onChange={(event) => setEditForm((current) => ({ ...current, proposedRate: event.target.value }))}
                />
              </label>
              <label className="form-label">
                <span>Estimated Duration</span>
                <input
                  value={editForm.estimatedDuration}
                  onChange={(event) => setEditForm((current) => ({ ...current, estimatedDuration: event.target.value }))}
                  maxLength={100}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingApplication(null)} disabled={actionLoading}>Close</button>
                <button type="submit" className="button-primary" disabled={actionLoading}>
                  {actionLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
