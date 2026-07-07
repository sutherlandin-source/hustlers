import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import Loader from "../../components/Loader.jsx";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

export default function OverviewPage() {
  const { user } = useAuth();
  const {
    wallet,
    walletLoading,
    fetchWallet,
    contracts,
    contractsLoading,
    fetchContracts,
    milestones,
    milestonesLoading,
    fetchMilestones,
  } = useDataStore();

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchWallet();
    fetchContracts({ sellerId: userId });
    fetchMilestones({ sellerId: userId });
  }, [userId]);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const milestoneList = Array.isArray(milestones) ? milestones : milestones?.milestones ?? [];

  const assignedContracts = contractList.filter(
    (c) => c?.seller?._id === userId || c?.seller === userId
  );
  const activeContracts = assignedContracts.filter((c) => ["ACTIVE", "PENDING"].includes(c.status)).length;
  const assignedMilestones = milestoneList.filter(
    (m) => m?.contract?.seller?._id === userId || m?.contract?.seller === userId || m?.submittedBy === userId
  );
  const pendingMilestones = assignedMilestones.filter((m) => ["PENDING", "SUBMITTED"].includes(m.status)).length;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Hustler Overview</h2>
          <p>See your assigned contracts, active milestones, and earnings at a glance.</p>
        </div>
      </header>

      <div className="grid-grid">
        <article className="card card-highlight">
          <h3>Available balance</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.available, wallet?.currency)}</p>}
        </article>

        <article className="card">
          <h3>Active contracts</h3>
          {contractsLoading ? <Loader /> : <p>{activeContracts} assigned contract{activeContracts === 1 ? "" : "s"}</p>}
        </article>

        <article className="card">
          <h3>Active milestones</h3>
          {milestonesLoading ? <Loader /> : <p>{pendingMilestones} milestone{pendingMilestones === 1 ? "" : "s"} in progress</p>}
        </article>

        <article className="card">
          <h3>Total earnings</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.total, wallet?.currency)}</p>}
        </article>
      </div>

      <div className="card-list">
        <div className="card">
          <h3>Quick actions</h3>
          <p>Use the Contracts and Milestones sections to review assigned work and submit deliverables.</p>
        </div>
      </div>
    </section>
  );
}
