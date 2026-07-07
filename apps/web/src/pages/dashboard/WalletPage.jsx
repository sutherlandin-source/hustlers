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

export default function WalletPage() {
  const {
    userWallet,
    escrowWallet,
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
    fetchTransactions({ limit: 20 });
  }, []);

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Wallet</h2>
          <p>View your earnings, escrow totals, and payment history.</p>
        </div>
      </header>

      {walletsLoading && (
        <div className="card-list">
          <div className="card">
            <Loader label="Loading wallet balances..." />
          </div>
        </div>
      )}

      {walletsError && (
        <div className="card-list">
          <div className="card">
            <ErrorBanner error={walletsError} />
          </div>
        </div>
      )}

      {!walletsLoading && !walletsError && (
        <div className="card-list">
          <div className="card">
            <h3>Available balance</h3>
            <p>{formatCurrency(userWallet?.availableBalance, userWallet?.currency)}</p>
          </div>

          <div className="card">
            <h3>Escrow holding</h3>
            <p>{formatCurrency(escrowWallet?.availableBalance, escrowWallet?.currency)}</p>
          </div>

          <div className="card">
            <h3>Total wallet</h3>
            <p>{formatCurrency(userWallet?.balance, userWallet?.currency)}</p>
          </div>
        </div>
      )}

      <div className="card-list">
        <div className="card">
          <h3>Earnings summary</h3>
          <p>
            Your available balance is ready for withdrawal. Escrowed funds are waiting for milestone approvals
            before they are released.
          </p>
        </div>
      </div>

      <article className="card card-vertical">
        <h3>Recent transactions</h3>
        <TransactionHistory transactions={transactions} loading={transactionsLoading} error={transactionsError} />
      </article>
    </section>
  );
}
