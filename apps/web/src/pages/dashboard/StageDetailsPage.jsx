import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { milestonesService } from "../../services/milestonesService.js";
import { contractsService } from "../../services/contractsService.js";

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

export default function StageDetailsPage() {
  const { contractId, stageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(null);
  const [contract, setContract] = useState(null);
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
  const stageEligible = Boolean(stage && (contract.userCanOpenDispute || isAssignedToMe()) && (["active", "assigned", "approved", "disputed"].includes(String(contract?.status || "").toLowerCase()) || ["submitted", "work_submitted", "rejected"].includes(String(stage?.status || stage?.workStatus || "").toLowerCase())));

  useEffect(() => {
    if (!stageId) return;
    loadStage();
  }, [stageId]);

  const loadStage = async () => {
    setLoading(true);
    setError("");
    try {
      const s = await milestonesService.get(stageId);
      setStage(s || null);
      if (contractId) {
        const c = await contractsService.get(contractId);
        setContract(c || null);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load stage");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!stageId) return;
    setError("");
    setActionLoading(true);
    try {
      if (!canStartWithEscrow(contract)) {
        setError("Payment is not secured yet. Please wait for the manager to fund escrow before starting work.");
        return;
      }
      console.debug("Starting stage (detail)", stageId);
      const res = await milestonesService.updateWorkStatus(stageId, "in_progress");
      console.debug("Start response (detail)", res);
      const startedId = res._id || res.id || stageId;
      navigate(`/dashboard/tasks`, { state: { startedTaskId: startedId } });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to start work");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!stageId) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await milestonesService.updateWorkStatus(stageId, "work_submitted");
      // merge updated stage so UI shows submitted/completed
      if (res && (res._id || res.id)) setStage((prev) => ({ ...(prev || {}), ...(res || {}) }));
      navigate(`/dashboard/tasks`);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to mark complete");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loader label="Loading task..." />;

  return (
    <section className="stage-details-page">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div>
          <h1 style={{margin:0}}>{stage?.title || 'Task'}</h1>
          <div style={{color:'var(--muted)'}}>{stage?.description || contract?.title || ''}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {disputePath && (stageEligible || disputeId) && (
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

      <div style={{marginTop:12}}>
            <div style={{fontSize:'0.95rem',marginBottom:8}}>
              <strong>Status:</strong> {(() => {
                if (!stage) return 'Not Started';
                if (stage.paymentStatus === 'released') return 'Payment Released';
                if (stage.paymentStatus === 'refunded') return 'Refunded to Manager';
                if (stage.workStatus === 'rejected' || stage.status === 'rejected') return 'Rejected';
                if (stage.workStatus === 'work_submitted' || stage.workStatus === 'approved') return 'Completed';
                if (stage.workStatus === 'in_progress') return 'In Progress';
                if (stage.workStatus === 'needs_revision' || stage.status === 'rejected') return 'Needs Revision';
                if (!stage.workStatus || stage.workStatus === 'not_started' || stage.status === 'pending') return 'Not Started';
                return stage.workStatus || stage.status || 'Not Started';
              })()}
            </div>
        {(stage?.workStatus === 'needs_revision' || stage?.status === 'rejected') && (
          <div className="revision-alert">
            <strong>{stage?.workStatus === 'rejected' || stage?.status === 'rejected' ? "Work Rejected" : "Revision requested"}</strong>
            <p>{stage?.rejectionReason || "The manager requested changes. Review the task and submit the revised work."}</p>
            {stage?.rejectionComments && <p>{stage.rejectionComments}</p>}
          </div>
        )}
        <div style={{marginBottom:12}}>{stage?.description}</div>

        {isAssignedToMe() && (
          <div style={{display:'flex',gap:8}}>
            {( !stage?.workStatus || stage.workStatus === 'not_started' || stage.status === 'pending') && (
              <button className="btn-primary" onClick={handleStart} disabled={actionLoading || !canStartWithEscrow(contract)}>Start Work</button>
            )}
            {stage?.workStatus === 'in_progress' && (
              <button className="btn-primary" onClick={handleMarkComplete} disabled={actionLoading}>Mark Complete</button>
            )}
            {(stage?.workStatus === 'needs_revision' || stage?.status === 'rejected') && (
              <button className="btn-primary" onClick={handleStart} disabled={actionLoading || !canStartWithEscrow(contract)}>Revise Work</button>
            )}
            {(stage?.workStatus === 'rejected' || stage?.status === 'rejected') && (
              <Link className="button-secondary" to={disputePath}>Open Dispute</Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
