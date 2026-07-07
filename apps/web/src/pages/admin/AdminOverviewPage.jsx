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
  return value ? new Date(value).toLocaleString() : "Not available";
}

export default function AdminOverviewPage() {
  const {
    wallet,
    walletLoading,
    walletError,
    fetchWallet,
    transactions,
    transactionsLoading,
    transactionsError,
    fetchTransactions,
    contracts,
    contractsLoading,
    fetchContracts,
  } = useDataStore();

  useEffect(() => {
    fetchWallet();
    fetchTransactions({ type: "commission", limit: 8 });
    fetchContracts({ limit: 10 });
  }, []);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const activeContracts = contractList.filter((contract) => ["active", "assigned", "pending"].includes(String(contract.status || "").toLowerCase())).length;
  const completedContracts = contractList.filter((contract) => String(contract.status || "").toLowerCase() === "completed").length;
  const platformWallet = wallet?.platformWallet;
  const commissionCurrency = platformWallet?.currency || wallet?.currency || "KSH";
  const commissionTransactions = Array.isArray(transactions) ? transactions.filter((tx) => tx.type === "commission") : [];
  const totalRecentCommission = commissionTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Monitor platform commissions, contract activity, and operational controls.</p>
        </div>
        <Link to="/admin/wallet" className="button-primary">
          Commission wallet
        </Link>
      </header>

      {walletError && <ErrorBanner error={walletError} />}

      <div className="admin-summary-grid">
        <article className="admin-stat admin-stat-primary">
          <h3>Commission wallet</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(platformWallet?.availableBalance, commissionCurrency)}</p>}
          <span>Available platform earnings</span>
        </article>

        <article className="admin-stat">
          <h3>Lifetime wallet balance</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(platformWallet?.balance, commissionCurrency)}</p>}
          <span>Total commission wallet value</span>
        </article>

        <article className="admin-stat">
          <h3>Recent commissions</h3>
          {transactionsLoading ? <Loader /> : <p>{formatCurrency(totalRecentCommission, commissionCurrency)}</p>}
          <span>From latest commission records</span>
        </article>

        <article className="admin-stat">
          <h3>Contracts tracked</h3>
          {contractsLoading ? <Loader /> : <p>{activeContracts + completedContracts}</p>}
          <span>{activeContracts} active, {completedContracts} completed</span>
        </article>
      </div>

      <div className="admin-panel-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Recent commission activity</h3>
              <p>Every approved payout sends 2.5% to this platform wallet.</p>
            </div>
            <Link to="/admin/wallet" className="button-secondary">
              View all
            </Link>
          </div>

          {transactionsError && <ErrorBanner error={transactionsError} />}
          {transactionsLoading ? (
            <Loader label="Loading commissions..." />
          ) : commissionTransactions.length ? (
            <div className="admin-transaction-list">
              {commissionTransactions.map((tx) => (
                <div className="admin-transaction-row" key={tx._id || tx.id}>
                  <div>
                    <strong>{tx.description || "Platform commission"}</strong>
                    <span>{formatDate(tx.createdAt)}</span>
                  </div>
                  <p>{formatCurrency(tx.amount, tx.currency || commissionCurrency)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No commissions yet</h4>
              <p>Commission entries will appear after managers approve completed jobs.</p>
            </div>
          )}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Admin features</h3>
              <p>Core controls for keeping the marketplace healthy.</p>
            </div>
          </div>

          <div className="admin-feature-grid">
            <Link to="/admin/users" className="admin-feature-card">
              <strong>Users</strong>
              <span>Review managers, hustlers, and account status.</span>
            </Link>
            <Link to="/admin/contracts" className="admin-feature-card">
              <strong>Contracts</strong>
              <span>Track jobs, funding, approvals, and completion.</span>
            </Link>
            <Link to="/admin/disputes" className="admin-feature-card">
              <strong>Disputes</strong>
              <span>Prepare resolution workflows and flagged cases.</span>
            </Link>
            <Link to="/admin/reports" className="admin-feature-card">
              <strong>Reports</strong>
              <span>Monitor revenue, escrow movement, and operations.</span>
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
