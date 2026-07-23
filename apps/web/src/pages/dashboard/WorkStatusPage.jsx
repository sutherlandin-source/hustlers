import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { Link, useParams, useNavigate } from "react-router-dom";
import { contractsService } from "../../services/contractsService.js";
import { milestonesService } from "../../services/milestonesService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

const STATUS_LABEL = {
  not_started: "Not Started",
  in_progress: "In Progress",
  work_submitted: "Completed",
  needs_revision: "Needs Revision",
  rejected: "Rejected",
  approved: "Completed",
};

function isContractFinalized(contract) {
  const metadata = contract?.metadata || {};
  return Boolean(
    contract?.status === "completed" ||
      contract?.completedAt ||
      contract?.finalApprovedAt ||
      metadata?.disputePaymentReleasedAt ||
      metadata?.disputeOutcome === "release_full_payment"
  );
}

function formatEscrowStatus(contractOrStatus) {
  const status = typeof contractOrStatus === "object" ? (isContractFinalized(contractOrStatus) ? "released" : contractOrStatus?.escrowStatus) : contractOrStatus;
  const labels = {
    waiting_for_funding: "Waiting For Manager Funding",
    funded: "Payment Secured",
    in_progress: "Payment Secured",
    awaiting_approval: "Awaiting Approval",
    released: "Payment Released",
  };
  return labels[status] || "Waiting For Manager Funding";
}

function canStartWithEscrow(contract) {
  return ["funded", "in_progress", "awaiting_approval"].includes(contract?.escrowStatus);
}

function getPaymentStatusLabel(stage) {
  const paymentStatus = String(stage?.paymentStatus || "").toLowerCase();
  if (paymentStatus === "released") return "Payment Released";
  if (paymentStatus === "refunded") return "Refunded to Manager";
  return null;
}

export default function WorkStatusPage() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contract, setContract] = useState(null);
  const [stages, setStages] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const isAssignedToMe = () => {
    if (!contract) return false;
    const sid = contract.seller?._id || contract.seller?.id || contract.seller;
    try {
      return String(sid) === String(userId);
    } catch (e) {
      return false;
    }
  };
  const disputeId = contract?.userDisputeId || contract?.metadata?.userDisputeId || contract?.metadata?.disputeId || contract?.disputeId || "";
  const disputePath = disputeId ? `/dashboard/disputes/${disputeId}` : contractId ? `/dashboard/contracts/${contractId}/dispute` : null;
  const hasSubmittedWork = stages.some((stage) => ["submitted", "work_submitted"].includes(String(stage?.status || stage?.workStatus || "").toLowerCase()));
  const hasRejectedWork = stages.some((stage) => ["rejected"].includes(String(stage?.status || stage?.workStatus || "").toLowerCase()));
  const canOpenDispute = Boolean(contract && (contract.userCanOpenDispute || isAssignedToMe()) && (["active", "assigned", "approved", "disputed"].includes(String(contract?.status || "").toLowerCase()) || hasSubmittedWork || hasRejectedWork));

  useEffect(() => {
    if (!contractId) return;
    loadContract();
  }, [contractId]);

  const loadContract = async () => {
    setLoading(true);
    setError("");
    try {
      const c = await contractsService.get(contractId);
      setContract(c || null);
      const ms = await milestonesService.list({ contractId, sellerOnly: true });
      setStages(Array.isArray(ms) ? ms : []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load contract");
    } finally {
      setLoading(false);
    }
  };

  const computeProgress = () => {
    const total = stages.length || 0;
    const completed = stages.filter((s) => (s.workStatus === "approved" || s.workStatus === "work_submitted")).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  };

  const isNotStarted = (s) => !s.workStatus || s.workStatus === "not_started" || s.status === "pending";
  const needsRevision = (s) => s.workStatus === "needs_revision" || s.status === "rejected";
  const nextNotStarted = stages.find((s) => isNotStarted(s));
  const hasInProgress = stages.some((s) => s.workStatus === "in_progress");
  const handleStart = async (stageId) => {
    setError("");
    // Ensure only one in-progress
    const hasInProgress = stages.some((s) => s.workStatus === "in_progress");
    if (hasInProgress) {
      setError("You already have a task in progress. Complete it before starting another.");
      return;
    }
    if (!canStartWithEscrow(contract)) {
      setError("Payment is not secured yet. Please wait for the manager to fund escrow before starting work.");
      return;
    }
    setActionLoading(true);
    try {
      console.debug("Starting stage", stageId);
      const res = await milestonesService.updateWorkStatus(stageId, "in_progress");
      console.debug("Start response", res);
      setStages((prev) => prev.map((s) => ((s._id||s.id) === (res._id||res.id) ? { ...s, ...(res||{}) } : s)));
      const newId = res._id || res.id;
      // After starting work, navigate back to the Tasks page so the active work panel is visible
      // Pass startedTaskId in location state so Tasks page can show active session immediately
      navigate(`/dashboard/tasks`, { state: { startedTaskId: newId } });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to start work");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkComplete = async (stageId) => {
    setError("");
    setActionLoading(true);
    try {
      const res = await milestonesService.updateWorkStatus(stageId, "work_submitted");
      setStages((prev) => prev.map((s) => ((s._id||s.id) === (res._id||res.id) ? { ...s, ...(res||{}) } : s)));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to mark complete");
    } finally {
      setActionLoading(false);
    }
  };

  const createAndStartFallback = async () => {
    setError("");
    setActionLoading(true);
    try {
      if (!canStartWithEscrow(contract)) {
        setError("Payment is not secured yet. Please wait for the manager to fund escrow before starting work.");
        return;
      }
      // create a lightweight placeholder milestone and start it
      const created = await milestonesService.create(contractId, {
        title: "Start Work",
        description: "Started by hustler",
        amount: 0,
      });
      const newId = created._id || created.id || (created.milestone && (created.milestone._id || created.milestone.id));
      console.debug("Created fallback milestone", created, "newId", newId);
      if (!newId) throw new Error("Created milestone id not returned");
      const res = await milestonesService.updateWorkStatus(newId, "in_progress");
      const startedId = res._id || res.id || newId;
      navigate(`/dashboard/tasks`, { state: { startedTaskId: startedId } });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to create and start work");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loader label="Loading work status..." />;

  return (
    <section className="work-status-page">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div>
          <h1 style={{margin:0}}>{contract?.title || "Work Status"}</h1>
          <div style={{color:'var(--muted)'}}>{contract?.description || ""}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {disputePath && (canOpenDispute || disputeId) && (
            <Link to={disputePath} className="button-secondary">
              {disputeId ? "View Dispute" : "Open Dispute"}
            </Link>
          )}
          <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>

      {error && <ErrorBanner error={error} />}
      {contract && (
        <div className={`status-pill ${canStartWithEscrow(contract) ? "status-completed" : "status-not-started"}`} style={{display:"inline-flex",marginTop:4}}>
          {formatEscrowStatus(contract)}
        </div>
      )}

      {/* If there are no stages, show a single Start Work CTA for the assigned hustler */}
      {stages.length === 0 && !hasInProgress && isAssignedToMe() && (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:12}}>
          <div>
            <div style={{fontWeight:700}}>{contract?.title || 'Start Work'}</div>
            <div style={{color:'var(--muted)'}}>Tap Start to begin this job.</div>
          </div>
          <div>
            <button className="btn-primary" onClick={createAndStartFallback} disabled={actionLoading}>Start Work</button>
          </div>
        </div>
      )}

      {hasInProgress && (
        <div style={{marginTop:12,color:'var(--muted)'}}>You have a task already in progress. Complete it before starting another.</div>
      )}

      <div style={{marginTop:12,marginBottom:18}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:'0.85rem',color:'var(--muted)'}}>Contract Status</div>
            <div style={{fontWeight:800}}>{(contract?.status || "not_started").replace('_',' ')}</div>
          </div>
          <div style={{minWidth:240}}>
            <ProgressBar {...computeProgress()} />
          </div>
        </div>
      </div>

      <div className="stages-list" style={{display:'flex',flexDirection:'column',gap:12}}>
        {stages.length === 0 && (
          <div className="empty-state">
            <div>No tasks found for this contract.</div>
          </div>
        )}
        {stages.map((s) => (
          <div key={s._id || s.id} className="stage-row card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700}}>{s.title || s.description || 'Task'}</div>
              <div style={{color:'var(--muted)'}}>{s.description}</div>
            </div>
            <div style={{minWidth:180,textAlign:'right'}}>
              <div style={{marginBottom:6}}>
                {STATUS_LABEL[s.workStatus] || (s.status === 'pending' ? 'Not Started' : STATUS_LABEL[s.status]) || 'Not Started'}
              </div>
              <div>
                <div>
                  {isNotStarted(s) && isAssignedToMe() && !hasInProgress ? (
                    <button className="btn-primary" onClick={() => handleStart(s._id || s.id)} disabled={actionLoading}>Start Work</button>
                  ) : needsRevision(s) && isAssignedToMe() && !hasInProgress ? (
                    <>
                      {s.rejectionReason && <div className="revision-note" style={{marginBottom:8,textAlign:'right'}}>{s.rejectionReason}</div>}
                      <button className="btn-primary" onClick={() => handleStart(s._id || s.id)} disabled={actionLoading}>Revise Work</button>
                    </>
                  ) : (
                    <button className="btn-link" onClick={() => navigate(`/dashboard/tasks/${contractId}/${s._id || s.id}`)}>Open</button>
                  )}
                </div>
                {(s.workStatus === 'work_submitted' || s.workStatus === 'approved') && (
                  <div className={`stage-badge ${s.paymentStatus === 'refunded' ? 'badge-rejected' : 'badge-complete'}`}>
                    {s.paymentStatus === 'released' ? 'Payment Released' : s.paymentStatus === 'refunded' ? 'Refunded to Manager' : 'Completed'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProgressBar({ total = 0, completed = 0, percent = 0 }) {
  return (
    <div>
      <div style={{fontSize:'0.85rem',color:'var(--muted)'}}>{completed} of {total} tasks completed</div>
      <div style={{height:10,background:'#e6e6e6',borderRadius:6,overflow:'hidden',marginTop:6}}>
        <div style={{width:`${percent}%`,height:'100%',background:'#0ea5e9'}} />
      </div>
    </div>
  );
}
