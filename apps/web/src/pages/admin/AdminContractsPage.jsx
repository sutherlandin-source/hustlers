import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "../../state/useDataStore.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

export default function AdminContractsPage() {
  const { contracts, contractsLoading, contractsError, fetchContracts } = useDataStore();

  useEffect(() => {
    fetchContracts({ limit: 50 });
  }, []);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];

  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header">
        <div>
          <h2>Admin Contracts</h2>
          <p>Review marketplace contracts, funding status, and completion progress.</p>
        </div>
      </header>

      {contractsError && <ErrorBanner error={contractsError} />}

      <article className="admin-panel">
        {contractsLoading ? (
          <Loader label="Loading contracts..." />
        ) : contractList.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Status</th>
                  <th>Escrow</th>
                  <th>Amount</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contractList.map((contract) => (
                  <tr key={contract._id || contract.id}>
                    <td>
                      <strong>{contract.title || "Untitled contract"}</strong>
                      <span>{contract.jobCategory || contract.contractType || "General"}</span>
                    </td>
                    <td>{contract.status || "unknown"}</td>
                    <td>{contract.escrowStatus || (contract.escrowPrepared ? "funded" : "not funded")}</td>
                    <td>{formatCurrency(contract.amount, contract.currency)}</td>
                    <td>{formatDate(contract.createdAt)}</td>
                    <td>
                      <Link className="button-secondary" to={`/admin/contracts/${contract._id || contract.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <h4>No contracts found</h4>
            <p>Contracts created on the platform will appear here.</p>
          </div>
        )}
      </article>
    </section>
  );
}
