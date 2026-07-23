import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import { walletService } from "../../services/walletService.js";
import Loader from "../../components/Loader.jsx";
import { getKycProfilePath, hasKycVerification } from "../../utils/kyc.js";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

function formatTransactionType(tx) {
  if (tx?.type === "hold" && tx?.metadata?.releasedAt) return "released";
  return tx?.type || "-";
}

function getStatusColor(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed") return "#4CAF50";
  if (value === "failed") return "#F44336";
  return "#FFA500";
}

function getTransactionTime(tx) {
  const time = new Date(tx?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatApiError(error, fallback) {
  const details = error?.errors || error?.error?.errors;
  if (details && typeof details === "object") {
    return Object.values(details).flat().join(", ");
  }
  return error?.message || fallback;
}

export default function ManagerWalletPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { wallet, walletLoading, fetchWallet, transactions, transactionsLoading, fetchTransactions } = useDataStore();
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingLoading, setFundingLoading] = useState(false);
  const [fundingError, setFundingError] = useState("");
  const [fundingSuccess, setFundingSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchWallet();
    fetchTransactions();
  }, [userId]);

  const handleFundWallet = async (e) => {
    e.preventDefault();
    setFundingError("");
    setFundingSuccess("");

    if (!hasKycVerification(user)) {
      navigate(getKycProfilePath(location.pathname), {
        state: { from: location.pathname },
        replace: true,
      });
      return;
    }

    const amount = Number(fundingAmount);
    if (!amount || amount <= 0) {
      setFundingError("Please enter a valid amount greater than 0");
      return;
    }

    setFundingLoading(true);
    try {
      const result = await walletService.fund(amount, `Escrow funding of ${formatCurrency(amount)}`);
      const fundedCount = result?.escrowFunding?.fundedContracts?.length || 0;
      setFundingSuccess(
        fundedCount
          ? `Successfully funded wallet and assigned escrow to ${fundedCount} contract${fundedCount === 1 ? "" : "s"}.`
          : `Successfully funded escrow with ${formatCurrency(amount)}`
      );
      setFundingAmount("");
      // Refetch wallet after a short delay
      setTimeout(() => {
        fetchWallet();
        fetchTransactions();
      }, 1000);
    } catch (err) {
      setFundingError(formatApiError(err, "Failed to fund wallet"));
      console.error("Fund wallet error:", err);
    } finally {
      setFundingLoading(false);
    }
  };

  const transactionList = Array.isArray(transactions) ? transactions : transactions?.transactions ?? [];
  const releasedToHustlersTotal = useMemo(
    () =>
      transactionList.reduce((sum, tx) => {
        const description = String(tx.description || "").toLowerCase();
        const isCompleted = String(tx.status || "").toLowerCase() === "completed";
        const isEscrowRelease =
          String(tx.type || "").toLowerCase() === "debit" &&
          (description.includes("released from escrow") || description.includes("payment released"));

        return isCompleted && isEscrowRelease ? sum + (Number(tx.amount) || 0) : sum;
      }, 0),
    [transactionList]
  );
  const totalDeposited = useMemo(
    () =>
      transactionList.reduce((sum, tx) => {
        const isCompleted = String(tx.status || "").toLowerCase() === "completed";
        const isDeposit = String(tx.type || "").toLowerCase() === "deposit";
        return isCompleted && isDeposit ? sum + (Number(tx.amount) || 0) : sum;
      }, 0),
    [transactionList]
  );
  const transactionTypes = useMemo(
    () => Array.from(new Set(transactionList.map(formatTransactionType).filter(Boolean))).sort(),
    [transactionList]
  );
  const transactionStatuses = useMemo(
    () => Array.from(new Set(transactionList.map((tx) => tx.status).filter(Boolean))).sort(),
    [transactionList]
  );
  const visibleTransactions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);

    return transactionList
      .filter((tx) => {
        const txType = formatTransactionType(tx);
        const txStatus = tx.status || "";
        const txTime = getTransactionTime(tx);
        const txAmount = Number(tx.amount) || 0;
        const haystack = [
          txType,
          txStatus,
          tx.description,
          tx.currency,
          tx.amount,
          tx.referenceId,
          tx.contract?.title,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase();

        if (typeFilter !== "all" && txType !== typeFilter) return false;
        if (statusFilter !== "all" && txStatus !== statusFilter) return false;
        if (fromTime && txTime < fromTime) return false;
        if (toTime && txTime > toTime) return false;
        if (min !== null && txAmount < min) return false;
        if (max !== null && txAmount > max) return false;
        if (search && !haystack.includes(search)) return false;
        return true;
      })
      .sort((a, b) => {
        const direction = sortConfig.direction === "asc" ? 1 : -1;
        const getSortValue = (tx) => {
          if (sortConfig.key === "date") return getTransactionTime(tx);
          if (sortConfig.key === "type") return formatTransactionType(tx);
          if (sortConfig.key === "amount") return Number(tx.amount) || 0;
          if (sortConfig.key === "status") return tx.status || "";
          if (sortConfig.key === "description") return tx.description || "";
          return "";
        };
        const aValue = getSortValue(a);
        const bValue = getSortValue(b);
        if (typeof aValue === "number" && typeof bValue === "number") {
          return (aValue - bValue) * direction;
        }
        return String(aValue).localeCompare(String(bValue)) * direction;
      });
  }, [dateFrom, dateTo, maxAmount, minAmount, searchTerm, sortConfig, statusFilter, transactionList, typeFilter]);

  const setSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortLabel = (key, label) => {
    if (sortConfig.key !== key) return label;
    if (key === "date") return sortConfig.direction === "asc" ? "Date Oldest" : "Date Newest";
    if (key === "amount") return sortConfig.direction === "asc" ? "Amount Low" : "Amount High";
    return `${label} ${sortConfig.direction === "asc" ? "A-Z" : "Z-A"}`;
  };

  const resetTransactionFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
    setSortConfig({ key: "date", direction: "desc" });
  };

  return (
    <section className="page-section manager-wallet-page">
      <header className="page-header manager-wallet-header">
        <div>
          <h2>Wallet & Escrow</h2>
          <p>Manage your escrow balance, fund work, and track payments.</p>
        </div>
      </header>

      <div className="manager-wallet-summary">
        <article className="manager-wallet-stat manager-wallet-stat-primary">
          <h3>Available escrow wallet</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.escrow, wallet?.currency)}</p>}
          <span>Top-up balance available before assigning it to a contract</span>
        </article>

        <article className="manager-wallet-stat">
          <h3>On hold</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.onHold, wallet?.currency)}</p>}
          <span>Reserved inside active contract escrow</span>
        </article>

        <article className="manager-wallet-stat">
          <h3>Released to hustlers</h3>
          {transactionsLoading ? <Loader /> : <p>{formatCurrency(releasedToHustlersTotal, wallet?.currency)}</p>}
          <span>Total paid out</span>
        </article>

        <article className="manager-wallet-stat">
          <h3>Total deposited</h3>
          {transactionsLoading ? <Loader /> : <p>{formatCurrency(totalDeposited, wallet?.currency)}</p>}
          <span>Lifetime deposits</span>
        </article>
      </div>

      <div className="manager-wallet-fund">
        <div>
          <h3>Top up escrow wallet</h3>
          <p>This only adds balance. Platform fees are deducted when you fund a specific contract escrow.</p>
        </div>
        <form onSubmit={handleFundWallet} className="manager-wallet-fund-form">
          <label>
            <span>Amount ({wallet?.currency || "USD"})</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
              placeholder="Enter amount"
              required
            />
          </label>
          <button
            type="submit"
            disabled={fundingLoading}
            className="button-primary"
          >
            {fundingLoading ? "Processing..." : "Fund wallet"}
          </button>
        </form>
        {fundingError && <div style={{ marginTop: "12px", color: "#F44336" }}>{fundingError}</div>}
        {fundingSuccess && <div style={{ marginTop: "12px", color: "#4CAF50" }}>{fundingSuccess}</div>}
      </div>

      <article className="manager-wallet-transactions">
        <div className="transaction-filter-header">
          <div>
            <h3>Transaction history</h3>
            <p>
              Showing {visibleTransactions.length} of {transactionList.length} records
            </p>
          </div>
          <button className="transaction-reset-button" type="button" onClick={resetTransactionFilters}>
            Reset filters
          </button>
        </div>

        <div className="transaction-filter-panel">
          <label className="transaction-filter-field transaction-filter-search">
            <span>Search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type, amount, note"
            />
          </label>
          <label className="transaction-filter-field">
            <span>Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              {transactionTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="transaction-filter-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {transactionStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="transaction-filter-field">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="transaction-filter-field">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="transaction-filter-field">
            <span>Min amount</span>
            <input type="number" min="0" step="0.01" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </label>
          <label className="transaction-filter-field">
            <span>Max amount</span>
            <input type="number" min="0" step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
          </label>
          <label className="transaction-filter-field">
            <span>Sort by</span>
            <select
              value={`${sortConfig.key}:${sortConfig.direction}`}
              onChange={(e) => {
                const [key, direction] = e.target.value.split(":");
                setSortConfig({ key, direction });
              }}
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="amount:desc">Amount high to low</option>
              <option value="amount:asc">Amount low to high</option>
              <option value="type:asc">Type A-Z</option>
              <option value="status:asc">Status A-Z</option>
            </select>
          </label>
        </div>

        {transactionsLoading ? (
          <Loader />
        ) : transactionList.length === 0 ? (
          <p>No transactions yet.</p>
        ) : visibleTransactions.length === 0 ? (
          <p style={{ marginTop: "16px" }}>No transactions match those filters.</p>
        ) : (
          <div className="manager-transaction-scroll">
            <div className="table-view manager-transaction-table-wrap">
              <table className="manager-transaction-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="btn-link" onClick={() => setSort("date")}>{sortLabel("date", "Date")}</button>
                  </th>
                  <th>
                    <button type="button" className="btn-link" onClick={() => setSort("type")}>{sortLabel("type", "Type")}</button>
                  </th>
                  <th>
                    <button type="button" className="btn-link" onClick={() => setSort("amount")}>{sortLabel("amount", "Amount")}</button>
                  </th>
                  <th>
                    <button type="button" className="btn-link" onClick={() => setSort("status")}>{sortLabel("status", "Status")}</button>
                  </th>
                  <th>
                    <button type="button" className="btn-link" onClick={() => setSort("description")}>{sortLabel("description", "Description")}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((tx) => (
                  <tr key={tx._id || tx.id}>
                    <td>
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td>{formatTransactionType(tx)}</td>
                    <td>{formatCurrency(tx.amount, tx.currency || wallet?.currency)}</td>
                    <td>
                      <span
                        style={{
                          backgroundColor: getStatusColor(tx.status),
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: "3px",
                          fontSize: "12px",
                        }}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td>{tx.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>

            <div className="card-view manager-transaction-card-list">
              {visibleTransactions.map((tx) => (
                <div key={tx._id || tx.id} className="manager-transaction-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 600 }}>{new Date(tx.createdAt).toLocaleString()}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>{formatTransactionType(tx)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{formatCurrency(tx.amount, tx.currency || wallet?.currency)}</div>
                    <div>
                      <span
                        style={{
                          backgroundColor: getStatusColor(tx.status),
                          color: "white",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: "8px", color: "#666", fontSize: "13px" }}>{tx.description || "-"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
