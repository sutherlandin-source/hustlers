import { useEffect } from "react";
import { useWalletStore } from "../../state/useWalletStore.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import TransactionHistory from "../../components/TransactionHistory.jsx";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

export default function AdminWalletPage() {
  const {
    platformWallet,
    wallets,
    walletsLoading,
    walletsError,
    fetchWallets,
    transactions,
    transactionsLoading,
    transactionsError,
    fetchTransactions,
  } = useWalletStore();

  useEffect(() => {
    fetchWallets();
    fetchTransactions({ type: "commission", limit: 50 });
  }, []);

  const currency = platformWallet?.currency || wallets?.[0]?.currency || "KSH";
  const commissionTransactions = Array.isArray(transactions) ? transactions.filter((tx) => tx.type === "commission") : [];
  const totalCommission = commissionTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header">
        <div>
          <h2>Commission Wallet</h2>
          <p>Track platform earnings collected from hustler payouts.</p>
        </div>
      </header>

      {walletsError && <ErrorBanner error={walletsError} />}

      <div className="admin-summary-grid">
        <article className="admin-stat admin-stat-primary">
          <h3>Available commission</h3>
          {walletsLoading ? <Loader /> : <p>{formatCurrency(platformWallet?.availableBalance, currency)}</p>}
          <span>Ready in platform wallet</span>
        </article>

        <article className="admin-stat">
          <h3>Total wallet balance</h3>
          {walletsLoading ? <Loader /> : <p>{formatCurrency(platformWallet?.balance, currency)}</p>}
          <span>Current platform wallet total</span>
        </article>

        <article className="admin-stat">
          <h3>Commission records</h3>
          {transactionsLoading ? <Loader /> : <p>{commissionTransactions.length}</p>}
          <span>Latest loaded records</span>
        </article>

        <article className="admin-stat">
          <h3>Loaded commission total</h3>
          {transactionsLoading ? <Loader /> : <p>{formatCurrency(totalCommission, currency)}</p>}
          <span>Sum of visible commission history</span>
        </article>
      </div>

      {!walletsLoading && !platformWallet && (
        <div className="admin-empty-state">
          <h4>No platform wallet yet</h4>
          <p>The platform wallet is created automatically when the first commission is collected after a completed job is approved.</p>
        </div>
      )}

      <article className="admin-panel admin-wallet-history">
        <div className="admin-panel-header">
          <div>
            <h3>Commission transaction history</h3>
            <p>Filter, search, and sort platform commission records.</p>
          </div>
        </div>
        <TransactionHistory transactions={commissionTransactions} loading={transactionsLoading} error={transactionsError} />
      </article>
    </section>
  );
}
