import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { contractsService } from "../../services/contractsService.js";
import { ContractApplicationsService } from "../../services/contractApplicationsService.js";
import { milestonesService } from "../../services/milestonesService.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: "all",         label: "All"         },
  { key: "active",      label: "Active"      },
  { key: "in_progress", label: "In Progress" },
  { key: "submitted",   label: "Submitted"   },
  { key: "approved",    label: "Approved"    },
  { key: "rejected",    label: "Rejected"    },
  { key: "completed",   label: "Completed"   },
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

function getBadgeKey(badgeStatus) {
  const s = String(badgeStatus || "").toLowerCase().replace(/\s+/g, "_");
  if (["accepted", "active", "assigned"].includes(s)) return "active";
  if (["in_progress"].includes(s)) return "in_progress";
  if (["submitted", "work_submitted"].includes(s)) return "submitted";
  if (["approved", "completed"].includes(s)) return "approved";
  if (["rejected"].includes(s)) return "rejected";
  return s;
}

function filterAndSort(cards, search, filter, sort) {
  let result = cards;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(({ contract }) =>
      [contract?.title, contract?.description, contract?.status]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }

  if (filter !== "all") {
    result = result.filter(({ badgeStatus }) => getBadgeKey(badgeStatus) === filter);
  }

  switch (sort) {
    case "oldest":
      result = [...result].sort((a, b) => new Date(a.contract?.createdAt || 0) - new Date(b.contract?.createdAt || 0));
      break;
    case "amount_desc":
      result = [...result].sort((a, b) => Number(b.contract?.amount || 0) - Number(a.contract?.amount || 0));
      break;
    case "amount_asc":
      result = [...result].sort((a, b) => Number(a.contract?.amount || 0) - Number(b.contract?.amount || 0));
      break;
    case "title_asc":
      result = [...result].sort((a, b) => String(a.contract?.title || "").localeCompare(String(b.contract?.title || "")));
      break;
    case "title_desc":
      result = [...result].sort((a, b) => String(b.contract?.title || "").localeCompare(String(a.contract?.title || "")));
      break;
    case "newest":
    default:
      result = [...result].sort((a, b) => new Date(b.contract?.createdAt || 0) - new Date(a.contract?.createdAt || 0));
  }

  return result;
}

export default function ContractsPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const isHustler = user?.role === "hustler";
  const contractLinkBase = isHustler ? "/dashboard/contracts" : "/manager/contracts";

  const getApplicationContract = (application) => {
    const contractRef = application?.contract || application?.contractId;
    return contractRef && typeof contractRef === "object" ? contractRef : null;
  };

  const getApplicationContractId = (application) => {
    const contractRef = application?.contractId || application?.contract;
    return contractRef?._id || contractRef;
  };

  const getApplicationStatus = (application) => application?.status || "pending";

  const getMilestones = (contract) => (Array.isArray(contract?.milestones) ? contract.milestones : []);

  const getLatestMilestoneForUser = (contract, targetUserId) => {
    const normalizedUserId = String(targetUserId || "");
    if (!normalizedUserId) return null;

    return [...getMilestones(contract)]
      .filter((milestone) => {
        const assignedTo = milestone?.assignedTo?._id || milestone?.assignedTo?.id || milestone?.assignedTo;
        const submittedBy = milestone?.submittedBy?._id || milestone?.submittedBy?.id || milestone?.submittedBy;
        return String(assignedTo || submittedBy || "") === normalizedUserId;
      })
      .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
  };

  const getPersonalContractBadge = (milestone, applicationStatus) => {
    if (!milestone) {
      return applicationStatus === "accepted" ? "Accepted" : applicationStatus;
    }

    const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
    const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();

    if (paymentStatus === "refunded") return "Refunded to Manager";
    if (workStatus === "rejected") return "Rejected";
    if (workStatus === "approved" && paymentStatus === "released") return "Completed";
    if (workStatus === "approved") return "Approved";
    if (["submitted", "work_submitted"].includes(workStatus)) return "Submitted";
    if (workStatus === "in_progress") return "In Progress";
    return applicationStatus === "accepted" ? "Accepted" : applicationStatus;
  };

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await ContractApplicationsService.getMyApplications();
      const records = Array.isArray(response?.data) ? response.data : [];
      const resolved = await Promise.all(
        records
          .filter((application) => String(application.status || "").toLowerCase() !== "cancelled")
          .map(async (application) => {
            const contractRef = application?.contractId || application?.contract;
            if (contractRef) {
              try {
                const contractId = contractRef?._id || contractRef;
                const contract = await contractsService.get(contractId);
                return { ...application, contract: contractRef && typeof contractRef === "object" ? { ...contractRef, ...contract } : contract };
              } catch {
                return contractRef && typeof contractRef === "object" ? { ...application, contract: contractRef } : application;
              }
            }
            return application;
          })
      );

      setApplications(resolved);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMilestones = async () => {
    try {
    } catch {
    }
  };

  useEffect(() => {
    if (!userId) return;
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, user?.role]);

  const applicationCards = useMemo(() => {
    const all = applications
      .map((application) => {
        const contract = getApplicationContract(application);
        const contractId = getApplicationContractId(application);
        if (!contractId) return null;
        const status = getApplicationStatus(application);
        const personalMilestone = isHustler ? getLatestMilestoneForUser(contract, userId) : null;
        const badgeStatus = isHustler ? getPersonalContractBadge(personalMilestone, status) : status;
        return { application, contractId, contract, badgeStatus };
      })
      .filter(Boolean);

    return filterAndSort(all, search, filter, sortBy);
  }, [applications, search, filter, sortBy, isHustler, userId]);

  const getStatusColor = (status) => {
    const statusColors = {
      pending: "#f59e0b",
      active: "#10b981",
      completed: "#0ea5e9",
      cancelled: "#6b7280",
      disputed: "#ef4444",
      refunded: "#6b7280",
      terminated: "#8b5cf6",
      accepted: "#10b981",
      approved: "#10b981",
      rejected: "#ef4444",
      in_progress: "#0ea5e9",
      submitted: "#8b5cf6",
      approved: "#10b981",
    };
    return statusColors[String(status || "").toLowerCase()] || "#6b7280";
  };

  const computeProgress = (contract) => {
    const milestones = contract?.milestones || [];
    if (!milestones.length) return null;
    const completed = milestones.filter((milestone) => milestone.workStatus === "completed" || milestone.workStatus === "approved" || milestone.status === "completed").length;
    const percent = Math.round((completed / milestones.length) * 100);
    return { total: milestones.length, completed, percent };
  };

  if (loading) return <Loader />;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>My Contracts</h2>
          <p>{isHustler ? "Contracts you have applied for." : "Review contracts assigned to you as a Hustler."}</p>
        </div>
      </header>

      {error && (
        <div className="contracts-error">
          <ErrorBanner error={error} />
        </div>
      )}
      {actionError && (
        <div className="contracts-error">
          <ErrorBanner error={actionError} />
        </div>
      )}

      {!error && (
        <>
          {/* Toolbar */}
          {applicationCards.length > 0 || search || filter !== "all" ? (
            <div className="contracts-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
              {/* Status filter pills */}
              <div className="contracts-filter-bar" role="tablist" aria-label="Contract filters" style={{ flexWrap: "wrap" }}>
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

              {/* Search + sort */}
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
                    aria-label="Search contracts"
                  />
                </label>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort contracts"
                  style={{
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#0F172A",
                    background: "#fff",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {applicationCards.length ? (
            <div className="contracts-grid">
              {applicationCards.map(({ application, contract, contractId, badgeStatus }) => {
                if (!contract) return null;

                const progress = computeProgress(contract);

                return (
                  <div key={application._id || contractId} className="contract-card">
                    <div className="contract-card-header">
                      <div className="contract-card-heading">
                        <div className="contract-card-label">Job</div>
                        <h3 className="contract-title">{contract.title || "Untitled job"}</h3>
                      </div>
                      <span className="status-badge" style={{ backgroundColor: getStatusColor(badgeStatus) }}>
                        {String(badgeStatus || "pending").replace(/_/g, " ")}
                      </span>
                    </div>

                    <p className="contract-description">{contract.description || "No description"}</p>

                    <div className="contract-footer">
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div className="amount-badge">
                          <span className="currency-icon">$</span>
                          <strong>{contract.amount ?? "-"}</strong>
                          <span className="currency">{contract.currency || "KES"}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {progress ? (
                          <div className="contract-progress">
                            <div className="progress-label">
                              <span className="contract-detail-label">Progress</span>
                              <strong className="contract-detail-value">{progress.percent}%</strong>
                            </div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
                            </div>
                          </div>
                        ) : (
                          <div className="view-details">
                            <span className="contract-detail-label">Status</span>
                            <strong className="contract-detail-value">Applied</strong>
                          </div>
                        )}

                        <div className="contract-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Link to={`${contractLinkBase}/${contractId}`} className="view-details view-details-link">
                            View Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">No contracts</div>
              <h3>{search || filter !== "all" ? "No matching contracts" : isHustler ? "No contracts yet" : "No contracts assigned"}</h3>
              <p>
                {search || filter !== "all"
                  ? "Try adjusting your search or filter."
                  : isHustler ? "Apply to a contract to see it here." : "Assigned contracts will appear here."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
