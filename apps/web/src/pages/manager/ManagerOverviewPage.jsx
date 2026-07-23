import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import Loader from "../../components/Loader.jsx";
import ProfileCompletionCard from "../../components/ProfileCompletionCard.jsx";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

export default function ManagerOverviewPage() {
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
    fetchContracts({ buyerId: userId });
    fetchMilestones();
  }, [userId]);

  const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts ?? [];
  const milestoneList = Array.isArray(milestones) ? milestones : milestones?.milestones ?? [];

  const createdContracts = contractList.filter((c) => c?.buyer?._id === userId || c?.buyer === userId);
  const activeContracts = createdContracts.filter((c) => ["ACTIVE", "PENDING"].includes(c.status)).length;
  const pendingMilestones = milestoneList.filter((m) => ["PENDING", "SUBMITTED"].includes(m.status)).length;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Manager Overview</h2>
          <p>See your created contracts, pending milestone approvals, and payment activity at a glance.</p>
        </div>
      </header>

      <ProfileCompletionCard user={user} />

      <div className="grid-grid">
        <article className="card card-highlight">
          <h3>Escrow balance</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.escrow, wallet?.currency)}</p>}
        </article>

        <article className="card">
          <h3>Active contracts</h3>
          {contractsLoading ? <Loader /> : <p>{activeContracts} contract{activeContracts === 1 ? "" : "s"}</p>}
        </article>

        <article className="card">
          <h3>Pending approvals</h3>
          {milestonesLoading ? <Loader /> : <p>{pendingMilestones} milestone{pendingMilestones === 1 ? "" : "s"}</p>}
        </article>

        <article className="card">
          <h3>Total spent</h3>
          {walletLoading ? <Loader /> : <p>{formatCurrency(wallet?.total - wallet?.available, wallet?.currency)}</p>}
        </article>
      </div>

      <div className="card-list">
        <div className="card">
          <h3>Quick actions</h3>
          <p>Create contracts to assign work, review milestone submissions, and fund your escrow wallet.</p>
        </div>
      </div>
    </section>
  );
}
