import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import Loader from "../../components/Loader.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "rejected_work", label: "Has Rejected Work" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS = [
  { key: "newest",   label: "Newest first"    },
  { key: "oldest",   label: "Oldest first"    },
  { key: "amount_desc", label: "Budget: high → low" },
  { key: "amount_asc",  label: "Budget: low → high" },
  { key: "title_asc",   label: "Title: A → Z"       },
  { key: "title_desc",  label: "Title: Z → A"       },
  { key: "progress",    label: "Most progress"       },
];

function sortContracts(contracts, sortKey) {
  const sorted = [...contracts];
  switch (sortKey) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    case "amount_desc":
      return sorted.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    case "amount_asc":
      return sorted.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    case "title_asc":
      return sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    case "title_desc":
      return sorted.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
    case "progress":
      return sorted.sort((a, b) => getProgressMetrics(b).workProgress - getProgressMetrics(a).workProgress);
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
}

function getWorkerName(worker) {
  return worker?.name || `${worker?.firstName || ""} ${worker?.lastName || ""}`.trim() || worker?.email || "Hustler";
}

function getAssignedTeam(contract) {
  const accepted = Array.isArray(contract?.acceptedHustlers) ? contract.acceptedHustlers : [];
  if (accepted.length) return accepted;
  if (!contract?.seller) return [];
  return [
    {
      _id: contract.seller._id || contract.seller,
      name: getWorkerName(contract.seller),
    },
  ];
}

function getMilestones(contract) {
  return Array.isArray(contract?.milestones) ? contract.milestones : [];
}

function getWorkerId(worker) {
  return String(worker?._id || worker?.id || worker || "");
}

function getLatestMilestoneForWorker(contract, workerId) {
  const milestones = getMilestones(contract);
  const normalizedWorkerId = String(workerId || "");
  return [...milestones]
    .filter((milestone) => {
      const assignedTo = milestone?.assignedTo?._id || milestone?.assignedTo?.id || milestone?.assignedTo;
      const submittedBy = milestone?.submittedBy?._id || milestone?.submittedBy?.id || milestone?.submittedBy;
      return String(assignedTo || submittedBy || "") === normalizedWorkerId;
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
}

function isWorkerRejected(milestone) {
  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  return workStatus === "rejected";
}

function isWorkerApproved(milestone) {
  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  return workStatus === "approved" || workStatus === "completed";
}

function getWorkerWorkLabel(milestone) {
  if (!milestone) return "Pending";
  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  if (workStatus === "rejected") return "Rejected";
  if (workStatus === "approved" || workStatus === "completed") return "Approved";
  if (workStatus === "work_submitted" || workStatus === "submitted") return "Submitted";
  if (workStatus === "in_progress") return "In Progress";
  if (workStatus === "needs_revision") return "Revision Requested";
  return "Pending";
}

function getWorkerPaymentLabel(milestone) {
  const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();
  if (paymentStatus === "released") return "Released";
  if (paymentStatus === "refunded") return "Not Released";
  if (paymentStatus === "pending" && isWorkerRejected(milestone)) return "Not Released";
  return "Pending";
}

function getContractWorkerSummary(contract) {
  const team = getAssignedTeam(contract);
  const payout = contract?.payoutSummary || {};
  const milestones = getMilestones(contract);

  const workerRows = team.map((worker) => {
    const workerId = getWorkerId(worker);
    const milestone = getLatestMilestoneForWorker(contract, workerId);
    return {
      worker,
      milestone,
      grossAmount: Number(milestone?.amount || payout.grossPerHustler || contract?.amount / Math.max(1, team.length) || 0),
      commissionAmount: Number(milestone?.commissionAmount || payout.commissionPerHustler || 0),
      netAmount: Number(milestone?.netAmount || payout.netPerHustler || 0),
      hasRejected: isWorkerRejected(milestone),
      hasApproved: isWorkerApproved(milestone),
    };
  });

  return {
    workerRows,
    hasRejectedWork: workerRows.some((row) => row.hasRejected),
    hasPendingWork: workerRows.some((row) => !row.milestone || ["pending", "submitted", "work_submitted", "in_progress", "needs_revision"].includes(String(row.milestone?.workStatus || row.milestone?.status || "").toLowerCase())),
    approvedCount: workerRows.filter((row) => row.hasApproved && String(row.milestone?.paymentStatus || "").toLowerCase() === "released").length,
  };
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function formatMoney(amount, currency = "KES") {
  const numericAmount = Number(amount || 0);
  return `${currency} ${numericAmount.toLocaleString()}`;
}

function normalizeStatus(contract) {
  const status = String(contract?.status || "").toLowerCase();
  const escrowStatus = String(contract?.escrowStatus || "").toLowerCase();
  const workerSummary = getContractWorkerSummary(contract);

  if (["cancelled", "canceled", "terminated", "disputed"].includes(status)) return "cancelled";
  if (status === "completed" || escrowStatus === "released") return workerSummary.hasRejectedWork ? "in_progress" : "completed";
  if (status === "in_progress" || escrowStatus === "in_progress" || escrowStatus === "awaiting_approval") return "in_progress";
  if (status === "assigned") return "assigned";
  if (status === "active" || escrowStatus === "funded") return "active";
  if (contract?.seller || (Array.isArray(contract?.acceptedHustlers) && contract.acceptedHustlers.length > 0)) return "assigned";
  return "active";
}

function getStatusLabel(contract) {
  const normalized = normalizeStatus(contract);
  if (normalized === "in_progress") return "In Progress";
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "assigned") return "Assigned";
  return "Active";
}

function getStatusTone(contract) {
  const normalized = normalizeStatus(contract);
  if (normalized === "assigned") return "assigned";
  if (normalized === "in_progress") return "in-progress";
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  return "active";
}

function getPaymentTypeLabel(contract) {
  const value = String(contract?.paymentType || contract?.contractType || "").toLowerCase();
  if (value === "staged") return "Stage-Based";
  if (value === "single") return "Single Payment";
  return "Single Payment";
}

function isAdminReleasedContract(contract) {
  return String(contract?.metadata?.disputeOutcome || "").toLowerCase() === "release_full_payment" || Boolean(contract?.metadata?.disputePaymentReleasedAt);
}

function getCompletionNote(contract) {
  if (isAdminReleasedContract(contract)) return "Released by admin";
  return "";
}

function getProgressMetrics(contract) {
  const team = getAssignedTeam(contract);
  const slots = Number(contract?.workerSlots || contract?.numWorkers || 1);
  const filled = Math.min(team.length, slots);
  const recruitmentProgress = slots ? Math.round((filled / slots) * 100) : 0;

  const milestones = Array.isArray(contract?.milestones) ? contract.milestones : [];
  const approvedMilestones = milestones.filter((stage) => String(stage.status || stage.workStatus || "").toLowerCase() === "approved").length;
  const activeWorkMilestones = milestones.filter((stage) => ["approved", "submitted", "work_submitted", "in_progress"].includes(String(stage.status || stage.workStatus || "").toLowerCase())).length;
  const workProgress = milestones.length ? Math.round((approvedMilestones / milestones.length) * 100) : contract?.status === "completed" ? 100 : 0;

  return {
    slots,
    filled,
    remaining: Math.max(0, slots - filled),
    recruitmentProgress,
    workProgress: contract?.status === "completed" ? 100 : workProgress || (activeWorkMilestones ? Math.min(100, activeWorkMilestones * 20) : 0),
    workStarted: ["active", "in_progress", "awaiting_approval", "completed"].includes(String(contract?.status || "").toLowerCase()) || ["funded", "in_progress", "awaiting_approval", "released"].includes(String(contract?.escrowStatus || "").toLowerCase()),
  };
}

function filterContracts(contracts, query, activeFilter) {
  const search = query.trim().toLowerCase();
  return contracts.filter((contract) => {
    const normalizedStatus = normalizeStatus(contract);
    const workerSummary = getContractWorkerSummary(contract);
    const team = getAssignedTeam(contract);
    const haystack = [
      contract?.title,
      contract?.description,
      contract?.status,
      contract?.escrowStatus,
      contract?.currency,
      ...team.map((member) => getWorkerName(member)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesFilter =
      activeFilter === "all" ||
      normalizedStatus === activeFilter ||
      (activeFilter === "rejected_work" && workerSummary.hasRejectedWork);
    return matchesSearch && matchesFilter;
  });
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 3h5v5H3V3zm0 9h5v5H3v-5zm9-9h5v5h-5V3zm0 9h5v5h-5v-5z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5h12v2H4V5zm0 4h12v2H4V9zm0 4h12v2H4v-2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.3 12.1 16.6 15.4l-1.2 1.2-3.3-3.3a6 6 0 1 1 1.2-1.2zM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z" />
    </svg>
  );
}

export default function ManagerContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, contractsLoading, contractsError, fetchContracts } = useDataStore();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("newest");

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchContracts({ buyerId: userId });
  }, [userId, fetchContracts]);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const managerContracts = contractList.filter((c) => c?.buyer?._id === userId || c?.buyer === userId);

  const counts = useMemo(() => {
    const base = {
      all: managerContracts.length,
      active: 0,
      assigned: 0,
      in_progress: 0,
      rejected_work: 0,
      completed: 0,
      cancelled: 0,
    };

    managerContracts.forEach((contract) => {
      base[normalizeStatus(contract)] += 1;
      if (getContractWorkerSummary(contract).hasRejectedWork) base.rejected_work += 1;
    });

    return base;
  }, [managerContracts]);

  const filteredContracts = useMemo(
    () => sortContracts(filterContracts(managerContracts, searchQuery, activeFilter), sortBy),
    [managerContracts, searchQuery, activeFilter, sortBy]
  );

  const handleCreateContract = () => {
    navigate("/manager/contracts/new");
  };

  const handleViewDetails = (contractId) => {
    navigate(`/manager/contracts/${contractId}`);
  };

  const handleManageContract = (event, contract) => {
    event.stopPropagation();
    const contractId = contract._id || contract.id;
    const canEditContract = !contract?.seller && !contract?.escrowPrepared && ["pending", "applied", "rejected", "cancelled"].includes(String(contract?.status || "").toLowerCase());
    navigate(canEditContract ? `/manager/contracts/${contractId}/edit` : `/manager/contracts/${contractId}`);
  };

  const handleEditContract = (event, contractId) => {
    event.stopPropagation();
    navigate(`/manager/contracts/${contractId}/edit`);
  };

  return (
    <section className="page-section manager-contracts-page">
      <header className="page-header manager-contracts-header">
        <div className="manager-header-copy">
          <p className="eyebrow">Contracts</p>
          <h2>My Contracts</h2>
          <p>Create and manage contracts you've assigned to Hustlers.</p>
        </div>
        <button className="button-primary manager-create-button" onClick={handleCreateContract}>
          + Create Contract
        </button>
      </header>

      {contractsError && <div className="error-banner">{contractsError?.message || contractsError}</div>}

      {contractsLoading ? (
        <Loader />
      ) : managerContracts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">No results</div>
          <h3>No contracts yet</h3>
          <p>Create a new contract to assign work to Hustlers and manage the workflow.</p>
        </div>
      ) : (
        <>
          <div className="contracts-toolbar">
            <div className="contracts-filter-bar" role="tablist" aria-label="Contract filters">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`contracts-filter ${activeFilter === filter.key ? "active" : ""}`}
                  onClick={() => setActiveFilter(filter.key)}
                  aria-pressed={activeFilter === filter.key}
                >
                  <span>{filter.label}</span>
                  <span className="filter-count">{counts[filter.key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="contracts-toolbar-actions">
              <label className="contracts-search">
                <SearchIcon />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search Contract..."
                  aria-label="Search contract"
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

              <div className="view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === "grid" ? "view-toggle-button active" : "view-toggle-button"}
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                  aria-label="Grid view"
                >
                  <GridIcon />
                </button>
                <button
                  type="button"
                  className={viewMode === "list" ? "view-toggle-button active" : "view-toggle-button"}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="List view"
                >
                  <ListIcon />
                </button>
              </div>
            </div>
          </div>

          {filteredContracts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">No results</div>
              <h3>No matching contracts</h3>
              <p>Try a different filter or search term.</p>
            </div>
          ) : (
            <div className={viewMode === "grid" ? "contracts-grid contracts-grid-modern" : "contracts-list"}>
              {filteredContracts.map((contract) => {
                const team = getAssignedTeam(contract);
                const workerSummary = getContractWorkerSummary(contract);
                const metrics = getProgressMetrics(contract);
                const payout = contract.payoutSummary || {};
                const workerSlots = metrics.slots;
                const paymentPerWorker =
                  payout.netPerHustler || payout.grossPerHustler || (workerSlots ? Math.round(Number(contract.amount || 0) / workerSlots) : contract.amount);
                const paymentLabel = getPaymentTypeLabel(contract);
                const statusLabel = getStatusLabel(contract);
                const statusTone = getStatusTone(contract);
                const completionNote = getCompletionNote(contract);
                const createdAt = formatDate(contract.createdAt || contract.created_at);
                const workerStatusLabel = workerSummary.hasRejectedWork ? "Action Required" : statusLabel;
                const workerStatusTone = workerSummary.hasRejectedWork ? "cancelled" : statusTone;

                return (
                  <article
                    key={contract._id || contract.id}
                    className={`manager-contract-card ${viewMode === "list" ? "list-view" : ""}`}
                    onClick={() => handleViewDetails(contract._id || contract.id)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleViewDetails(contract._id || contract.id);
                      }
                    }}
                  >
                    <div className="contract-card-top">
                      <div className="contract-card-heading">
                        <h3 className="contract-title">{contract.title}</h3>
                        <p className="contract-description">{contract.description || "No description provided."}</p>
                      </div>
                      <div className="contract-status-stack">
                        <span className={`status-badge status-${workerStatusTone}`}>{workerStatusLabel}</span>
                        {completionNote && <span className="muted">{completionNote}</span>}
                      </div>
                    </div>

                    <div className="contract-info-grid">
                      <div className="contract-info-item">
                        <span className="contract-info-label">Total Budget</span>
                        <strong className="contract-info-value">{formatMoney(contract.amount, contract.currency)}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Workers Required</span>
                        <strong className="contract-info-value">{workerSlots}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Workers Assigned</span>
                        <strong className="contract-info-value">{team.length}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Remaining Positions</span>
                        <strong className="contract-info-value">{metrics.remaining}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Payment Per Worker</span>
                        <strong className="contract-info-value">{formatMoney(paymentPerWorker, contract.currency)}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Payment Type</span>
                        <strong className="contract-info-value">{paymentLabel}</strong>
                      </div>
                      <div className="contract-info-item">
                        <span className="contract-info-label">Created</span>
                        <strong className="contract-info-value">{createdAt}</strong>
                      </div>
                    </div>

                    <div className="progress-section">
                      <div className="progress-header-row">
                        <div>
                          <span className="progress-label">{metrics.workStarted ? "Work Progress" : "Workers Filled"}</span>
                          <p>{metrics.workStarted ? "Current delivery progress" : "Recruitment progress"}</p>
                        </div>
                        <strong>{metrics.workStarted ? `${metrics.workProgress}%` : `${metrics.recruitmentProgress}%`}</strong>
                      </div>
                      <div className="progress-track" aria-hidden="true">
                        <div
                          className="progress-fill progress-fill-animated"
                          style={{ width: `${metrics.workStarted ? metrics.workProgress : metrics.recruitmentProgress}%` }}
                        />
                      </div>
                      <div className="progress-footnote">
                        <span>{metrics.workStarted ? `${Math.min(metrics.workProgress, 100)}% complete` : `${team.length}/${workerSlots} filled`}</span>
                        <span>{paymentLabel}</span>
                      </div>
                    </div>

                    <div className="contract-card-footer">
                      <button
                        type="button"
                        className="button-secondary contract-footer-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleViewDetails(contract._id || contract.id);
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
