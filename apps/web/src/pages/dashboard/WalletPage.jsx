import { useEffect, useState } from "react";
import { useWalletStore } from "../../state/useWalletStore.js";
import { walletService } from "../../services/walletService.js";
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

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");

  useEffect(() => {
    fetchWallets();
    fetchTransactions({ limit: 20 });
  }, []);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawError("Enter a valid amount greater than 0.");
      return;
    }
    const available = Number(userWallet?.availableBalance ?? 0);
    if (amount > available) {
      setWithdrawError(`Insufficient balance. Available: ${formatCurrency(available, userWallet?.currency || "KSH")}`);
      return;
    }
    const walletId = userWallet?._id || userWallet?.id;
    if (!walletId) {
      setWithdrawError("No wallet found to withdraw from.");
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError("");
    setWithdrawSuccess("");
    try {
      await walletService.withdraw(walletId, amount);
      setWithdrawSuccess(`Withdrawal of ${formatCurrency(amount, userWallet?.currency || "KSH")} submitted.`);
      setWithdrawAmount("");
      fetchWallets();
      fetchTransactions({ limit: 20 });
    } catch (err) {
      setWithdrawError(err?.message || "Withdrawal failed. Please try again.");
    } finally {
      setWithdrawLoading(false);
    }
  };

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

      {/* Withdraw form — only shown once wallet is loaded and there is a balance */}
      {!walletsLoading && userWallet && (
        <div className="card-list">
          <div className="card card-vertical">
            <h3>Withdraw funds</h3>
            <p>Transfer your available balance to your registered M-Pesa number.</p>
            <form onSubmit={handleWithdraw} className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Amount ({userWallet?.currency || "KSH"})
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={`Max: ${formatCurrency(userWallet?.availableBalance, userWallet?.currency)}`}
                  required
                />
              </label>
              {withdrawError && <ErrorBanner error={withdrawError} />}
              {withdrawSuccess && <div className="success-message">{withdrawSuccess}</div>}
              <button className="button-primary" type="submit" disabled={withdrawLoading || !userWallet?.availableBalance}>
                {withdrawLoading ? <Loader label="Processing..." /> : "Withdraw"}
              </button>
            </form>
          </div>
        </div>
      )}

      <article className="card card-vertical">
        <h3>Recent transactions</h3>
        <TransactionHistory transactions={transactions} loading={transactionsLoading} error={transactionsError} />
      </article>
    </section>
  );
}
