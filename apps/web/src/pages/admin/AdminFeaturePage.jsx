import { useEffect, useMemo, useState } from "react";
import { contractsService } from "../../services/contractsService.js";
import { transactionsService } from "../../services/transactionsService.js";
import { userService } from "../../services/userService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount || 0);
}

function statusText(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function MiniBars({ items, valueKey = "value" }) {
  const max = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);
  return (
    <div className="mini-bar-list">
      {items.map((item) => (
        <div className="mini-bar-row" key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${((Number(item[valueKey]) || 0) / max) * 100}%` }} /></div>
          <strong>{item.display || item[valueKey]}</strong>
        </div>
      ))}
    </div>
  );
}

export default function AdminFeaturePage({ feature }) {
  const [users, setUsers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (feature === "users") {
          const data = await userService.listUsers({ limit: 100 });
          if (!cancelled) setUsers(data || []);
        } else if (feature === "disputes") {
          const data = await contractsService.list({ status: "disputed", limit: 100 });
          if (!cancelled) setContracts(data || []);
        } else {
          const [contractData, txData] = await Promise.all([
            contractsService.list({ limit: 100 }),
            transactionsService.list({ type: "commission", limit: 100 }),
          ]);
          if (!cancelled) {
            setContracts(contractData || []);
            setTransactions(txData || []);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load admin data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [feature]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatch = roleFilter === "all" || user.role === roleFilter;
      const haystack = [user.email, user.firstName, user.lastName, user.companyName, user.location].filter(Boolean).join(" ").toLowerCase();
      return roleMatch && (!term || haystack.includes(term));
    });
  }, [roleFilter, search, users]);

  const reportStats = useMemo(() => {
    const commission = transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const completed = contracts.filter((contract) => contract.status === "completed").length;
    const active = contracts.filter((contract) => ["pending", "assigned", "active"].includes(contract.status)).length;
    const disputed = contracts.filter((contract) => contract.status === "disputed").length;
    return { commission, completed, active, disputed };
  }, [contracts, transactions]);

  if (loading) return <Loader label="Loading admin data..." />;

  if (feature === "users") {
    return (
      <section className="page-section admin-page">
        <header className="page-header admin-header">
          <div>
            <h2>User Management</h2>
            <p>Review managers, hustlers, admins, and account status.</p>
          </div>
        </header>
        {error && <ErrorBanner error={error} />}
        <article className="admin-panel">
          <div className="admin-filter-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" />
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              <option value="manager">Managers</option>
              <option value="hustler">Hustlers</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user._id || user.id}>
                    <td>
                      <strong>{user.firstName} {user.lastName}</strong>
                      <span>{user.email}</span>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.isActive ? "active" : "inactive"}</td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Not available"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
  }

  if (feature === "disputes") {
    return (
      <section className="page-section admin-page">
        <header className="page-header admin-header">
          <div>
            <h2>Dispute Center</h2>
            <p>Track contracts marked as disputed and prepare resolution actions.</p>
          </div>
        </header>
        {error && <ErrorBanner error={error} />}
        <article className="admin-panel">
          {contracts.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Manager</th>
                    <th>Hustler</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract._id || contract.id}>
                      <td>
                        <strong>{contract.title || "Untitled contract"}</strong>
                        <span>{statusText(contract.escrowStatus)}</span>
                      </td>
                      <td>{contract.buyer?.email || contract.buyer?.firstName || "Not available"}</td>
                      <td>{contract.seller?.email || contract.seller?.firstName || "Not assigned"}</td>
                      <td>{formatCurrency(contract.amount, contract.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No disputed contracts</h4>
              <p>Contracts with disputed status will appear here.</p>
            </div>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header">
        <div>
          <h2>Reports</h2>
          <p>Monitor commission revenue, completion, and contract activity.</p>
        </div>
      </header>
      {error && <ErrorBanner error={error} />}
      <div className="admin-summary-grid">
        <article className="admin-stat admin-stat-primary">
          <h3>Commission revenue</h3>
          <p>{formatCurrency(reportStats.commission, transactions[0]?.currency || "KSH")}</p>
          <span>Loaded commission records</span>
        </article>
        <article className="admin-stat">
          <h3>Completed works</h3>
          <p>{reportStats.completed}</p>
          <span>Contracts marked completed</span>
        </article>
        <article className="admin-stat">
          <h3>Active work</h3>
          <p>{reportStats.active}</p>
          <span>Pending, assigned, or active</span>
        </article>
        <article className="admin-stat">
          <h3>Disputes</h3>
          <p>{reportStats.disputed}</p>
          <span>Contracts needing review</span>
        </article>
      </div>
      <article className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h3>Commission revenue graph</h3>
            <p>Recent platform commission entries by transaction.</p>
          </div>
        </div>
        <MiniBars
          items={transactions.slice(0, 10).map((tx, index) => ({
            label: tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : `Record ${index + 1}`,
            value: Number(tx.amount) || 0,
            display: formatCurrency(tx.amount, tx.currency || "KSH"),
          }))}
        />
      </article>
    </section>
  );
}
