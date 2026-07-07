import { useMemo, useState } from "react";
import Loader from "./Loader.jsx";
import ErrorBanner from "./ErrorBanner.jsx";

function formatTransactionType(transaction) {
  if (transaction?.type === "hold" && transaction?.metadata?.releasedAt) return "released";
  return transaction?.type || "-";
}

function getTransactionTime(transaction) {
  const time = new Date(transaction?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getStatusColor(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed") return "#4CAF50";
  if (value === "failed") return "#F44336";
  return "#FFA500";
}

export default function TransactionHistory({ transactions, loading, error }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const transactionList = Array.isArray(transactions) ? transactions : [];

  const transactionTypes = useMemo(
    () => Array.from(new Set(transactionList.map(formatTransactionType).filter(Boolean))).sort(),
    [transactionList]
  );
  const transactionStatuses = useMemo(
    () => Array.from(new Set(transactionList.map((transaction) => transaction.status).filter(Boolean))).sort(),
    [transactionList]
  );

  const visibleTransactions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);

    return transactionList
      .filter((transaction) => {
        const txType = formatTransactionType(transaction);
        const txStatus = transaction.status || "";
        const txTime = getTransactionTime(transaction);
        const txAmount = Number(transaction.amount) || 0;
        const haystack = [
          txType,
          txStatus,
          transaction.description,
          transaction.currency,
          transaction.amount,
          transaction.referenceId,
          transaction.contract?.title,
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
        const getSortValue = (transaction) => {
          if (sortConfig.key === "date") return getTransactionTime(transaction);
          if (sortConfig.key === "type") return formatTransactionType(transaction);
          if (sortConfig.key === "amount") return Number(transaction.amount) || 0;
          if (sortConfig.key === "status") return transaction.status || "";
          if (sortConfig.key === "description") return transaction.description || "";
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

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
    setSortConfig({ key: "date", direction: "desc" });
  };

  if (loading) {
    return <Loader label="Loading transactions..." />;
  }

  if (error) {
    return <ErrorBanner error={error} />;
  }

  if (!transactionList.length) {
    return <div className="card">No transactions yet.</div>;
  }

  return (
    <div className="transaction-list">
      <div className="transaction-filter-header">
        <p>
          Showing {visibleTransactions.length} of {transactionList.length} records
        </p>
        <button type="button" className="transaction-reset-button" onClick={resetFilters}>
          Reset filters
        </button>
      </div>

      <div className="transaction-filter-panel">
        <label className="transaction-filter-field transaction-filter-search">
          <span>Search</span>
          <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Type, amount, note" />
        </label>
        <label className="transaction-filter-field">
          <span>Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            {transactionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="transaction-filter-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {transactionStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="transaction-filter-field">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="transaction-filter-field">
          <span>To</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label className="transaction-filter-field">
          <span>Min amount</span>
          <input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} />
        </label>
        <label className="transaction-filter-field">
          <span>Max amount</span>
          <input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} />
        </label>
        <label className="transaction-filter-field">
          <span>Sort by</span>
          <select
            value={`${sortConfig.key}:${sortConfig.direction}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":");
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

      {!visibleTransactions.length ? (
        <div className="card">No transactions match those filters.</div>
      ) : (
      <ul className="transaction-history-scroll">
        {visibleTransactions.map((transaction) => (
          <li key={transaction._id || transaction.id} className="transaction-item">
            <div>
              <strong>{formatTransactionType(transaction)}</strong>
              <span>{transaction.description || transaction.status}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span>{transaction.currency || "KSH"} {transaction.amount?.toFixed?.(2) ?? transaction.amount}</span>
              <span style={{ color: getStatusColor(transaction.status), fontWeight: 700 }}>{transaction.status}</span>
            </div>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
