import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { contractsService } from "../../services/contractsService.js";
import { conversationsService } from "../../services/conversationsService.js";

export default function ContractsPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const limit = 12;
  const [hasMore, setHasMore] = useState(false);

  const displayContracts = items || [];

  const isHustler = user?.role === "hustler";
  const canAccessContractChat = (contract) => {
    const isAssignedHustler = contract?.seller && ((contract.seller._id || contract.seller.id) === userId || contract.seller === userId);
    const isContractBuyer = contract?.buyer && ((contract.buyer._id || contract.buyer.id) === userId || contract.buyer === userId);
    const isManager = user?.role === "manager";
    return Boolean(contract?.seller && (isAssignedHustler || isContractBuyer || isManager));
  };
  const contractLinkBase = isHustler ? "/dashboard/contracts" : "/manager/contracts";
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // load a page (append when page > 1)
  const loadPage = async (pageNum = 1) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const skip = (pageNum - 1) * limit;
      const query = user?.role === "hustler" ? { limit, skip } : { buyerId: userId, limit, skip };
      const result = await contractsService.list(query);

      if (pageNum === 1) setItems(result || []);
      else setItems((prev) => [...(prev || []), ...(result || [])]);

      setHasMore((result || []).length === limit);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    setPage(1);
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, user?.role]);

  // Fetch unread counts for visible contracts that the user can access
  useEffect(() => {
    let mounted = true;
    const fetchUnread = async () => {
      const map = {};
      const toCheck = (displayContracts || []).filter((c) => canAccessContractChat(c));
      await Promise.all(
        toCheck.map(async (c) => {
          try {
            const cnt = await conversationsService.getUnreadForContract(c._id || c.id);
            if (mounted) map[c._id || c.id] = cnt || 0;
          } catch (e) {
            // ignore
          }
        })
      );
      if (mounted) setUnreadCounts(map);
    };

    if (displayContracts.length && userId) fetchUnread();
    return () => {
      mounted = false;
    };
  }, [displayContracts, userId]);

  const getStatusColor = (status) => {
    const statusColors = {
      pending: "#f59e0b",
      active: "#10b981",
      completed: "#0ea5e9",
      cancelled: "#6b7280",
      disputed: "#ef4444",
      terminated: "#8b5cf6",
    };
    return statusColors[status] || "#6b7280";
  };

  const computeProgress = (contract) => {
    const milestones = contract?.milestones || [];
    if (!milestones.length) return null;
    const completed = milestones.filter((m) => m.workStatus === "completed" || m.workStatus === "approved" || m.status === "completed").length;
    const percent = Math.round((completed / milestones.length) * 100);
    return { total: milestones.length, completed, percent };
  };
  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await loadPage(next);
  };

  const handleOpenChat = async (event, contractId) => {
    event.stopPropagation();
    event.preventDefault();
    setActionError(null);

    try {
      const conversation = await conversationsService.openForContract(contractId);
      const conversationId = conversation._id || conversation.id;
      if (conversationId) {
        const chatBase = user?.role === "admin" ? "/admin" : user?.role === "manager" ? "/manager" : "/dashboard";
        navigate(`${chatBase}/chat/${conversationId}`);
      }
    } catch (err) {
      setActionError(err?.message || "Unable to open chat for this contract.");
    }
  };

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>{isHustler ? "Available Jobs" : "My Contracts"}</h2>
          <p>
            {isHustler
              ? "Browse available jobs posted by managers and apply to work."
              : "Review contracts assigned to you as a Hustler."}
          </p>
        </div>
      </header>

      {loading && (
        <div className="contracts-loading">
          <Loader label="Loading contracts..." />
        </div>
      )}

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

      {!loading && !error && (
        <>
          {displayContracts.length ? (
            <>
              <div className="load-more-bar">
                <div className="load-info">Showing {displayContracts.length} items</div>
                <button className="btn-ghost" onClick={loadMore} disabled={!hasMore || loadingMore}>
                  {loadingMore ? "Loading..." : hasMore ? "Load more" : "No more"}
                </button>
              </div>

              <div className="contracts-grid">
                {displayContracts.map((c) => (
                  <Link
                    key={c._id || c.id}
                    to={`${contractLinkBase}/${c._id || c.id}`}
                    className="contract-card"
                  >
                    <div className="contract-card-header">
                      <h3 className="contract-title">{c.title || "Untitled job"}</h3>
                      <span 
                        className="status-badge" 
                        style={{ backgroundColor: getStatusColor(c.status) }}
                      >
                        {c.status}
                      </span>
                    </div>

                    <p className="contract-description">{c.description || "No description"}</p>

                    <div className="contract-meta-tags">
                      {isHustler && c.jobCategory && (
                        <span className="meta-tag category-tag">
                          <span className="tag-icon">🏷️</span>
                          {c.jobCategory}
                        </span>
                      )}
                      {isHustler && c.workLocation && (
                        <span className="meta-tag location-tag">
                          <span className="tag-icon">📍</span>
                          {c.workLocation}
                        </span>
                      )}
                      {!isHustler && c.buyer && (
                        <span className="meta-tag user-tag">
                          <span className="tag-icon">👤</span>
                          {c.buyer?.firstName ? `${c.buyer.firstName} ${c.buyer.lastName}` : c.buyer?.name || "—"}
                        </span>
                      )}
                    </div>

                    <div className="contract-footer">
                      <div style={{display: 'flex', alignItems: 'center', gap:12}}>
                        <div className="amount-badge">
                          <span className="currency-icon">💰</span>
                          <strong>{c.amount ?? "—"}</strong>
                          <span className="currency">{c.currency || "KES"}</span>
                        </div>

                        {c.seller && (
                          <div className="assigned-hustler">
                            <div className="hustler-avatar">
                              {c.seller?.avatar ? (
                                <img src={c.seller.avatar} alt={c.seller?.firstName || "hustler"} />
                              ) : (
                                <div className="hustler-initials">{(c.seller?.firstName || "").charAt(0)}</div>
                              )}
                            </div>
                            <div className="hustler-name">{c.seller?.firstName ? `${c.seller.firstName} ${c.seller.lastName || ''}` : c.seller?.name || '—'}</div>
                          </div>
                        )}
                      </div>

                      <div style={{display: 'flex', alignItems: 'center', gap:12}}>
                        {(() => {
                          const prog = computeProgress(c);
                          if (!prog) return <div className="view-details">View Details →</div>;
                          return (
                            <div className="contract-progress">
                              <div className="progress-label">{prog.percent}%</div>
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${prog.percent}%` }} />
                              </div>
                            </div>
                          );
                        })()}

                        <div className="contract-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div className="view-details">View Details →</div>
                          {c.status === "approved" && canAccessContractChat(c) && (
                            <button
                              className="button-secondary"
                              type="button"
                              onClick={(event) => handleOpenChat(event, c._id || c.id)}
                            >
                              Messages
                              {unreadCounts[c._id || c.id] > 0 && (
                                <span className="unread-badge" style={{ marginLeft: 8 }}>{unreadCounts[c._id || c.id]}</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {displayContracts.length > 0 && (
                <div className="pagination-row" style={{ marginTop: 20 }}>
                  <button className="btn-ghost" onClick={loadMore} disabled={!hasMore || loadingMore}>
                    {loadingMore ? "Loading..." : hasMore ? "Load more" : "No more"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <h3>{isHustler ? "No available jobs" : "No contracts created"}</h3>
              <p>
                {isHustler
                  ? "Check back soon for new job opportunities."
                  : "Create your first contract to get started."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
