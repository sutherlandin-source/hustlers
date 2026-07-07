import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import Loader from "../../components/Loader.jsx";

export default function ManagerContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, contractsLoading, contractsError, fetchContracts } = useDataStore();

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchContracts({ buyerId: userId });
  }, [userId]);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const managerContracts = contractList.filter((c) => c?.buyer?._id === userId || c?.buyer === userId);

  const handleCreateContract = () => {
    navigate("/manager/contracts/new");
  };

  const handleViewDetails = (contractId) => {
    navigate(`/manager/contracts/${contractId}`);
  };

  const handleEditContract = (event, contractId) => {
    event.stopPropagation();
    navigate(`/manager/contracts/${contractId}/edit`);
  };

  const canEditContract = (contract) => {
    return !contract?.seller && !contract?.escrowPrepared && ["pending", "applied", "rejected", "cancelled"].includes(contract?.status);
  };

  const getStatusColor = (status) => {
    const statusColors = {
      pending: "#f59e0b",
      active: "#10b981",
      completed: "#0ea5e9",
      cancelled: "#6b7280",
      disputed: "#ef4444",
      terminated: "#8b5cf6",
    };
    return statusColors[status?.toLowerCase()] || "#6b7280";
  };

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>My Contracts</h2>
          <p>Create and manage contracts you've assigned to Hustlers.</p>
        </div>
        <button className="button-primary" onClick={handleCreateContract}>
          + Create contract
        </button>
      </header>

      {contractsError && <div className="error-banner">{contractsError.message}</div>}

      {contractsLoading ? (
        <Loader />
      ) : managerContracts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No contracts yet</h3>
          <p>Create a new contract to assign work to Hustlers and manage the workflow.</p>
        </div>
      ) : (
        <div className="contracts-grid">
          {managerContracts.map((contract) => (
            <article
              key={contract._id || contract.id}
              className="contract-card"
              onClick={() => handleViewDetails(contract._id || contract.id)}
            >
              <div className="contract-card-header">
                <h3 className="contract-title">{contract.title}</h3>
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(contract.status) }}
                >
                  {contract.status}
                </span>
              </div>
              
              <p className="contract-description">{contract.description}</p>
              
              <div className="contract-meta-tags">
                {contract.seller && (
                  <div className="meta-tag user-tag">
                    <span className="tag-icon">👤</span>
                    <span>{contract.seller.firstName} {contract.seller.lastName}</span>
                  </div>
                )}
                {contract.currency && (
                  <div className="meta-tag">
                    <span className="tag-icon">💱</span>
                    <span>{contract.currency}</span>
                  </div>
                )}
              </div>
              
              <div className="contract-footer">
                <div className="amount-badge">
                  <span className="currency-icon">💰</span>
                  <strong>{contract.amount}</strong>
                  <span className="currency">{contract.currency || "USD"}</span>
                </div>
                {canEditContract(contract) && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={(event) => handleEditContract(event, contract._id || contract.id)}
                  >
                    Edit Contract
                  </button>
                )}
                <div className="view-details">View Details →</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
