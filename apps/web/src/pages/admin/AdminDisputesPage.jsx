import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { disputesService } from "../../services/disputesService.js";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function formatName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "Unknown user";
}

function statusLabel(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function getEffectiveDisputeStatus(dispute) {
  const actualStatus = String(dispute?.status || "").toLowerCase();
  const resolutionType = String(dispute?.resolutionType || "").toLowerCase();
  const managerApprovedBy = String(dispute?.contract?.finalApprovedBy || dispute?.contract?.metadata?.managerApprovedBy || dispute?.contract?.metadata?.finalApprovedBy || "").toLowerCase();
  if (actualStatus === "closed") return "closed";
  if (resolutionType === "manager_approved") return "closed";
  if (resolutionType === "release_full_payment") return "resolved";
  if (managerApprovedBy && String(dispute?.contract?.status || "").toLowerCase() === "completed" && String(dispute?.contract?.escrowStatus || "").toLowerCase() === "released") return "closed";
  return actualStatus || "open";
}

function getResolutionLabel(dispute) {
  const resolutionType = String(dispute?.resolutionType || "").toLowerCase();
  if (String(dispute?.status || "").toLowerCase() === "closed" && resolutionType === "manager_approved") {
    return "Manager approved — closed";
  }
  if (resolutionType) {
    return statusLabel(resolutionType);
  }
  return "";
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await disputesService.list();
        if (mounted) setDisputes(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load disputes.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredDisputes = useMemo(() => {
    if (statusFilter === "all") return disputes;
    return disputes.filter((item) => getEffectiveDisputeStatus(item) === statusFilter);
  }, [disputes, statusFilter]);

  const counts = useMemo(() => {
    const statuses = ["open", "waiting_for_evidence", "waiting_for_response", "under_review", "resolved", "closed"];
    return statuses.reduce(
      (accumulator, key) => {
        accumulator[key] = disputes.filter((item) => getEffectiveDisputeStatus(item) === key).length;
        return accumulator;
      },
      { total: disputes.length }
    );
  }, [disputes]);

  return (
    <section className="page-section admin-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Marketplace admin</p>
          <h2>Disputes</h2>
          <p>Review evidence, guide the parties, and settle escrow outcomes.</p>
        </div>
      </header>

      {error && <ErrorBanner error={error} />}

      <div className="admin-summary-grid admin-summary-grid-wide">
        <article className="admin-stat"><h3>Total</h3>{loading ? <Loader /> : <p>{counts.total}</p>}<span>All disputes</span></article>
        <article className="admin-stat"><h3>Open</h3>{loading ? <Loader /> : <p>{counts.open}</p>}<span>Needs review</span></article>
        <article className="admin-stat"><h3>Waiting</h3>{loading ? <Loader /> : <p>{(counts.waiting_for_evidence || 0) + (counts.waiting_for_response || 0)}</p>}<span>Awaiting evidence</span></article>
        <article className="admin-stat"><h3>Under review</h3>{loading ? <Loader /> : <p>{counts.under_review}</p>}<span>Active cases</span></article>
        <article className="admin-stat"><h3>Resolved</h3>{loading ? <Loader /> : <p>{counts.resolved}</p>}<span>Completed cases</span></article>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h3>Dispute queue</h3>
            <p>Click a case to review the evidence and settle the outcome.</p>
          </div>
        </div>

        <div className="admin-user-filter-row">
          {["all", "open", "waiting_for_evidence", "waiting_for_response", "under_review", "resolved", "closed"].map((status) => (
            <button
              key={status}
              type="button"
              className={`admin-user-filter-chip ${statusFilter === status ? "active" : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              <span>{statusLabel(status)}</span>
              <strong>{status === "all" ? disputes.length : counts[status] || 0}</strong>
            </button>
          ))}
        </div>

        {loading ? (
          <Loader label="Loading disputes..." />
        ) : filteredDisputes.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-compact">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Raised by</th>
                  <th>Status</th>
                  <th>Resolution</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Opened</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDisputes.map((dispute) => (
                  <tr key={dispute._id || dispute.id}>
                    <td>
                      <strong>{dispute.contract?.title || "Untitled contract"}</strong>
                      <div className="muted">{dispute.contract?.workLocation || "No location"}</div>
                    </td>
                    <td>{formatName(dispute.raisedBy)}</td>
                    <td><span className={`status-pill status-${getEffectiveDisputeStatus(dispute)}`}>{statusLabel(getEffectiveDisputeStatus(dispute))}</span></td>
                    <td>
                      {getResolutionLabel(dispute) ? <div className="muted">{getResolutionLabel(dispute)}</div> : null}
                    </td>
                    <td>{dispute.reason || "-"}</td>
                    <td>{formatCurrency(dispute.contract?.amount, dispute.contract?.currency)}</td>
                    <td>{formatDate(dispute.createdAt)}</td>
                    <td>
                      <Link to={`/admin/disputes/${dispute._id || dispute.id}`} className="button-secondary">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <h4>No disputes found</h4>
            <p>There are no disputes in this status right now.</p>
          </div>
        )}
      </div>
    </section>
  );
}
