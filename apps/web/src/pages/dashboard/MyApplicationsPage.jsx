import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import ContractApplicationsService from "../../services/contractApplicationsService.js";
import { contractsService } from "../../services/contractsService.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: "all",         label: "All"         },
  { key: "pending",     label: "Pending"     },
  { key: "accepted",    label: "Accepted"    },
  { key: "in_progress", label: "In Progress" },
  { key: "rejected",    label: "Rejected"    },
  { key: "cancelled",   label: "Cancelled"   },
];

const SORT_OPTIONS = [
  { key: "newest",      label: "Newest first"       },
  { key: "oldest",      label: "Oldest first"       },
  { key: "amount_desc", label: "Budget: high → low" },
  { key: "amount_asc",  label: "Budget: low → high" },
  { key: "title_asc",   label: "Title: A → Z"       },
  { key: "title_desc",  label: "Title: Z → A"       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseStatus(s) {
  const v = String(s || "").toLowerCase();
  if (["approved", "active", "assigned"].includes(v)) return "accepted";
  if (["in_progress"].includes(v)) return "in_progress";
  if (["rejected"].includes(v)) return "rejected";
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  return "pending";
}

function applyFiltersAndSort(apps, search, filter, sort) {
  let result = apps;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((app) => {
      const contract = app.contract || {};
      return [contract.title, contract.description, contract.jobCategory, app.status]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }

  if (filter !== "all") {
    result = result.filter((app) => normaliseStatus(app.status) === filter);
  }

  const sorted = [...result];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.appliedAt || a.createdAt || 0) - new Date(b.appliedAt || b.createdAt || 0));
    case "amount_desc":
      return sorted.sort((a, b) => Number(b.contract?.amount || 0) - Number(a.contract?.amount || 0));
    case "amount_asc":
      return sorted.sort((a, b) => Number(a.contract?.amount || 0) - Number(b.contract?.amount || 0));
    case "title_asc":
      return sorted.sort((a, b) => String(a.contract?.title || "").localeCompare(String(b.contract?.title || "")));
    case "title_desc":
      return sorted.sort((a, b) => String(b.contract?.title || "").localeCompare(String(a.contract?.title || "")));
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.appliedAt || b.createdAt || 0) - new Date(a.appliedAt || a.createdAt || 0));
  }
}

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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const visibleApplications = useMemo(
    () => applyFiltersAndSort(applications, search, filter, sortBy),
    [applications, search, filter, sortBy]
  );

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

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "Not specified");

  const formatField = (value) => (value ? String(value).replace(/_/g, " ") : "Not specified");

  const isContractFinalized = (contract) => {
    const metadata = contract?.metadata || {};
    return Boolean(
      contract?.status === "completed" ||
        contract?.completedAt ||
        contract?.finalApprovedAt ||
        metadata?.disputePaymentReleasedAt ||
        metadata?.disputeOutcome === "release_full_payment"
    );
  };

  const getEscrowLabel = (contract) => {
    if (isContractFinalized(contract)) return "released";
    return contract?.escrowStatus || "waiting_for_funding";
  };

  const formatMoneyValue = (amount, currency = "KSH") => `${currency} ${Number(amount || 0).toLocaleString()}`;

  const getPayoutDisplay = (contract) => {
    const currency = contract?.currency || "KSH";
    const payoutSummary = contract?.payoutSummary || {};
    const workerCount = Math.max(
      1,
      Number(
        payoutSummary.workerSlots ||
        contract?.numWorkers ||
        contract?.workerSlots ||
        contract?.acceptedHustlers?.length ||
        1
      )
    );
    const splitAmount = Number(contract?.amount || 0) / workerCount;
    const grossPerHustler =
      payoutSummary.grossPerHustler ??
      contract?.metadata?.grossPerHustler ??
      splitAmount ??
      contract?.amount ??
      0;
    const netPerHustler =
      payoutSummary.netPerHustler ??
      contract?.metadata?.netPerHustler ??
      grossPerHustler - grossPerHustler * 0.025;
    const commissionPerHustler =
      payoutSummary.commissionPerHustler ??
      contract?.metadata?.commissionPerHustler ??
      grossPerHustler - netPerHustler;

    return {
      grossPerHustler: formatMoneyValue(grossPerHustler, currency),
      netPerHustler: formatMoneyValue(netPerHustler, currency),
      commissionPerHustler: formatMoneyValue(commissionPerHustler, currency),
    };
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

      {/* Toolbar */}
      {applications.length > 0 && (
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
                placeholder="Search applications…"
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
      )}

      {applications.length === 0 ? (
        <div className="my-applications-empty">
          <div className="empty-icon" aria-hidden="true" />
          <h3>No applications yet</h3>
          <p>Browse contracts to find work and apply.</p>
        </div>
      ) : (
        <div className="my-applications-grid">
          {visibleApplications.length === 0 ? (
            <div className="my-applications-empty">
              <div className="empty-icon" aria-hidden="true" />
              <h3>No matching applications</h3>
              <p>Try adjusting your search or filter.</p>
            </div>
          ) : visibleApplications.map((app) => {
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
          <div className="modal-content my-applications-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Application Details</h2>
              <button className="close-btn" onClick={() => setSelectedApplication(null)}>Close</button>
            </div>
            <div className="my-application-details">
              {(() => {
                const contract = selectedApplication.contract || selectedApplication.contractId || {};
                const appliedAt = selectedApplication.appliedAt || selectedApplication.createdAt || selectedApplication.created_at;
                const description = contract.description || selectedApplication.contractDescription || "No description provided.";
                const payoutSummary = contract.payoutSummary || {};
                const payoutDisplay = getPayoutDisplay(contract);
                const contractInfoRows = [
                  ["Contract", contract.title || "Application"],
                  ["Application status", formatStatus(selectedApplication.status || "pending")],
                  ["Contract status", formatStatus(contract.status || "pending")],
                ];
                const applicationRows = [
                  ["Applied on", formatDate(appliedAt)],
                  ["Proposed rate", selectedApplication.proposedRate ? `${selectedApplication.proposedRate} ${contract.currency || "KSH"}`.trim() : "Not specified"],
                  ["Estimated duration", selectedApplication.estimatedDuration || "Not specified"],
                  ["Cover letter", selectedApplication.coverLetter || "Not provided"],
                ];
                const contractDetailRows = [
                  ["Budget", formatMoney(contract)],
                  ["Payment per hustler", payoutDisplay.grossPerHustler],
                  ["Payment after commission", payoutDisplay.netPerHustler],
                  ["Commission per hustler", payoutDisplay.commissionPerHustler],
                  ["Workers needed", Number(contract.numWorkers || contract.workerSlots || 1).toLocaleString()],
                  ["Accepted hustlers", Number(payoutSummary.acceptedCount || contract.acceptedHustlers?.length || 0).toLocaleString()],
                  ["Payment type", formatField(contract.paymentType || contract.contractType || "single")],
                  ["Escrow", formatField(getEscrowLabel(contract))],
                  ["Category", contract.jobCategory || "General"],
                  ["Location", contract.workLocation || "Not specified"],
                  ["Due date", formatDate(contract.dueDate || contract.completionDate)],
                ];

                return (
                  <>
                    <section className="my-application-section">
                      <h3>Contract Information</h3>
                      <div className="my-application-details-list">
                        {contractInfoRows.map(([label, value]) => (
                          <div key={label} className="my-application-line">
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="my-application-section">
                      <h3>Application</h3>
                      <div className="my-application-details-list">
                        {applicationRows.map(([label, value]) => (
                          <div key={label} className="my-application-line">
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="my-application-section">
                      <h3>Contract Details</h3>
                      <div className="my-application-details-list">
                        {contractDetailRows.map(([label, value]) => (
                          <div key={label} className="my-application-line">
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    {description && (
                      <section className="my-application-section">
                        <h3>Description</h3>
                        <div className="my-application-description">
                          <p>{description}</p>
                        </div>
                      </section>
                    )}
                  </>
                );
              })()}
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
