import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import { userService } from "../../services/userService.js";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function labelCount(value) {
  return Number(value || 0).toLocaleString();
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
    contractsError,
    fetchContracts,
  } = useDataStore();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  useEffect(() => {
    fetchWallet();
    fetchTransactions({ limit: 10 });
    fetchContracts({ limit: 25 });
  }, [fetchWallet, fetchTransactions, fetchContracts]);

  useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      setUsersLoading(true);
      setUsersError("");
      try {
        const data = await userService.listUsers({ limit: 100 });
        if (mounted) setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        if (mounted) setUsersError(error?.message || "Failed to load users.");
      } finally {
        if (mounted) setUsersLoading(false);
      }
    };
    loadUsers();
    return () => {
      mounted = false;
    };
  }, []);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const transactionList = Array.isArray(transactions) ? transactions : [];
  const userList = Array.isArray(users) ? users : [];

  const stats = useMemo(() => {
    const totalUsers = userList.length;
    const totalHustlers = userList.filter((user) => String(user.role).toLowerCase() === "hustler").length;
    const totalManagers = userList.filter((user) => String(user.role).toLowerCase() === "manager").length;
    const activeContracts = contractList.filter((contract) => ["assigned", "active", "in_progress", "pending"].includes(String(contract.status).toLowerCase())).length;
    const completedContracts = contractList.filter((contract) => String(contract.status).toLowerCase() === "completed").length;
    const pendingDisputes = contractList.filter((contract) => String(contract.status).toLowerCase() === "disputed").length;
    const totalTransactionVolume = transactionList.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
    return { totalUsers, totalHustlers, totalManagers, activeContracts, completedContracts, pendingDisputes, totalTransactionVolume };
  }, [contractList, transactionList, userList]);

  const recentActivities = useMemo(() => {
    const contractActivities = contractList.slice(0, 5).map((contract) => ({
      id: contract._id || contract.id,
      label: contract.title || "Untitled contract",
      detail: `Contract ${String(contract.status || "updated").replace(/_/g, " ")}`,
      time: contract.updatedAt || contract.createdAt,
    }));
    const transactionActivities = transactionList.slice(0, 5).map((transaction) => ({
      id: transaction._id || transaction.id,
      label: transaction.description || "Transaction",
      detail: `${transaction.status || "completed"} - ${formatCurrency(transaction.amount, transaction.currency || "KSH")}`,
      time: transaction.createdAt,
    }));
    const userActivities = userList.slice(0, 5).map((user) => ({
      id: user._id || user.id,
      label: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
      detail: `${String(user.role || "user").toUpperCase()} - ${user.isActive ? "Active" : "Suspended"}`,
      time: user.lastLogin || user.createdAt,
    }));

    return [...contractActivities, ...transactionActivities, ...userActivities]
      .filter((item) => item.time)
      .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
      .slice(0, 8);
  }, [contractList, transactionList, userList]);

  const loading = walletLoading || transactionsLoading || contractsLoading || usersLoading;

  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header admin-overview-header">
        <div>
          <p className="eyebrow">Marketplace admin</p>
          <h2>Dashboard</h2>
          <p>Track the health of the HUSTLERS marketplace from one command center.</p>
        </div>
        <Link to="/admin/wallet-payments" className="button-primary">
          Wallet &amp; Payments
        </Link>
      </header>

      {(walletError || transactionsError || contractsError || usersError) && (
        <ErrorBanner error={walletError || transactionsError || contractsError || usersError} />
      )}

      <div className="admin-summary-grid admin-summary-grid-wide">
        <article className="admin-stat admin-stat-primary">
          <h3>Total users</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.totalUsers)}</p>}
          <span>Platform accounts registered</span>
        </article>
        <article className="admin-stat">
          <h3>Hustlers</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.totalHustlers)}</p>}
          <span>Active hustler accounts</span>
        </article>
        <article className="admin-stat">
          <h3>Managers</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.totalManagers)}</p>}
          <span>Active manager accounts</span>
        </article>
        <article className="admin-stat">
          <h3>Active contracts</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.activeContracts)}</p>}
          <span>Pending, assigned, or in progress</span>
        </article>
        <article className="admin-stat">
          <h3>Completed contracts</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.completedContracts)}</p>}
          <span>Finished work items</span>
        </article>
        <article className="admin-stat">
          <h3>Pending disputes</h3>
          {loading ? <Loader /> : <p>{labelCount(stats.pendingDisputes)}</p>}
          <span>Requires admin review</span>
        </article>
        <article className="admin-stat">
          <h3>Total transaction volume</h3>
          {loading ? <Loader /> : <p>{formatCurrency(stats.totalTransactionVolume, wallet?.currency || "KSH")}</p>}
          <span>Loaded payment activity</span>
        </article>
        <article className="admin-stat">
          <h3>Platform wallet</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.platformWallet?.availableBalance, wallet?.platformWallet?.currency || wallet?.currency || "KSH")}</p>}
          <span>Available commission balance</span>
        </article>
      </div>

      <div className="admin-panel-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Recent platform activity</h3>
              <p>Latest user, contract, and payment events.</p>
            </div>
          </div>
          {loading ? (
            <Loader label="Loading activities..." />
          ) : recentActivities.length ? (
            <div className="admin-activity-list">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="admin-activity-item">
                  <div>
                    <strong>{activity.label}</strong>
                    <span>{activity.detail}</span>
                  </div>
                  <small>{formatDate(activity.time)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No recent activity</h4>
              <p>Platform activity will show here as users and contracts change.</p>
            </div>
          )}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Admin shortcuts</h3>
              <p>Jump into the main areas of the marketplace.</p>
            </div>
          </div>
          <div className="admin-feature-grid admin-feature-grid-expanded">
            <Link to="/admin/users" className="admin-feature-card">
              <strong>Users</strong>
              <span>Manage hustlers, managers, and account status.</span>
            </Link>
            <Link to="/admin/contracts" className="admin-feature-card">
              <strong>Contracts</strong>
              <span>Monitor active, completed, and disputed jobs.</span>
            </Link>
            <Link to="/admin/applications" className="admin-feature-card">
              <strong>Applications</strong>
              <span>Review applications by contract and manager.</span>
            </Link>
            <Link to="/admin/verification" className="admin-feature-card">
              <strong>Verification</strong>
              <span>Process KYC requests and identity checks.</span>
            </Link>
            <Link to="/admin/wallet-payments" className="admin-feature-card">
              <strong>Wallet &amp; Payments</strong>
              <span>Track deposits, withdrawals, and escrow flow.</span>
            </Link>
            <Link to="/admin/reports" className="admin-feature-card">
              <strong>Reports &amp; Analytics</strong>
              <span>See revenue, growth, and completion trends.</span>
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
