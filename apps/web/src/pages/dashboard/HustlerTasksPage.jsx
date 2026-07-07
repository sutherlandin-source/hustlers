import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useDataStore } from "../../state/useDataStore.js";
import { milestonesService } from "../../services/milestonesService.js";
import { contractsService } from "../../services/contractsService.js";
import { ContractApplicationsService } from "../../services/contractApplicationsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

const WORK_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  WORK_SUBMITTED: "work_submitted",
  NEEDS_REVISION: "needs_revision",
  APPROVED: "approved",
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function getStatusColor(status) {
  const colors = {
    not_started: "#64748b",
    in_progress: "#f59e0b",
    work_submitted: "#0ea5e9",
    needs_revision: "#ef4444",
    approved: "#10b981",
  };
  return colors[status] || "#64748b";
}

function getModifiedTime(item) {
  return new Date(item?.updatedAt || item?.submittedAt || item?.createdAt || item?.appliedAt || 0).getTime();
}

function formatEscrowStatus(status) {
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

function hasReleasedEscrow(contract) {
  return contract?.escrowStatus === "released";
}

function hasSecuredOrReleasedEscrow(contract) {
  return canStartWithEscrow(contract) || hasReleasedEscrow(contract);
}

function needsRevision(milestone) {
  const workStatus = (milestone?.workStatus || "").toLowerCase();
  const status = (milestone?.status || "").toLowerCase();
  return workStatus === WORK_STATUS.NEEDS_REVISION || status === "rejected";
}

export default function HustlerTasksPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const { contracts } = useDataStore();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeStartTs, setActiveStartTs] = useState(null);
  const [proofFiles, setProofFiles] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!userId) return;
    loadTasks();
  }, [userId]);

  // If navigated back with a startedTaskId, reflect it immediately in UI
  useEffect(() => {
    const sid = location.state && location.state.startedTaskId;
    if (sid) {
      // optimistic UI: mark the task in-progress and set active panel
      setTasks((prev) => prev.map((t) => ((t._id || t.id) === sid ? { ...t, workStatus: WORK_STATUS.IN_PROGRESS } : t)));
      setActiveTaskId(sid);
      setActiveStartTs(Date.now());
      // refresh tasks from server to get authoritative state, then clear navigation state
      (async () => {
        await loadTasks();
        try {
          navigate(location.pathname, { replace: true, state: null });
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [location.state]);

  const loadTasks = async () => {
    setLoading(true);
    setError("");
    try {
      // load milestones assigned directly to this hustler
      const milestones = await milestonesService.list({ sellerOnly: true });
      

      // also include milestones for contracts where this hustler's application was accepted
      let merged = Array.isArray(milestones) ? [...milestones] : [];
      try {
        const appsRes = await ContractApplicationsService.getMyApplications();
        const myApps = appsRes?.data || appsRes || [];
        const acceptedApps = myApps.filter((a) => ["accepted", "approved", "active"].includes(((a.status || "") + "").toLowerCase()));

        // fetch milestones for contracts from accepted applications
        for (const app of acceptedApps) {
          const contractId = app.contract?._id || app.contractId || app.contract;
          if (!contractId) continue;
          try {
            const contractMilestones = await milestonesService.list({ contractId });
            for (const m of (contractMilestones || [])) {
              if (!merged.find((x) => (x._id || x.id) === (m._id || m.id))) {
                // attach contract reference so UI groups correctly
                m.contract = app.contract || { _id: contractId, title: app.contractTitle || app.contract?.title };
                // mark the contract's seller as this hustler so the existing assignedTasks filter includes it
                if (!m.contract.seller) m.contract.seller = { _id: userId };
                merged.push(m);
              }
            }
            // if contract has no milestones, add a placeholder group entry so the accepted contract shows
            if ((!contractMilestones || contractMilestones.length === 0)) {
              const placeholderId = `contract-placeholder-${contractId}`;
              if (!merged.find((x) => (x._id || x.id) === placeholderId)) {
                // ensure we have contract details; fetch if not provided by application
                let contractObj = app.contract || app.contractId || null;
                if (!contractObj || !contractObj.title) {
                  try {
                    const fetched = await contractsService.get(contractId);
                    contractObj = fetched.contract || fetched || { _id: contractId, title: fetched.title };
                  } catch (err) {
                    contractObj = { _id: contractId, title: app.contractTitle || `Contract ${contractId}` };
                  }
                }

                // mark seller so it appears in assignedTasks
                if (!contractObj.seller) contractObj.seller = { _id: userId };

                merged.push({
                  _id: placeholderId,
                  title: `No milestones yet for ${contractObj.title || 'contract'}`,
                  contract: contractObj,
                  workStatus: WORK_STATUS.NOT_STARTED,
                });
              }
            }
          } catch (err) {
            // ignore per-contract milestone fetch errors
            console.warn("Failed to load milestones for contract", contractId, err);
          }
        }
      } catch (err) {
        console.warn("Failed to load my applications", err);
      }

      setTasks((merged || []).sort((a, b) => getModifiedTime(b) - getModifiedTime(a)));
    } catch (err) {
      setError(err?.message || "Failed to load tasks");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWork = async (taskId) => {
    if (!taskId) {
      console.warn("handleStartWork called without taskId");
      return;
    }
    // Optimistic UI update: mark task as in-progress locally and show active work view
    setError("");
    try {
      const task = tasks.find((t) => (t._id || t.id) === taskId);
      if (!canStartWithEscrow(task?.contract)) {
        setError("Payment is not secured yet. Please wait for the manager to fund escrow before starting work.");
        return;
      }
      // update local state immediately
      setTasks((prev) => prev.map((t) => ((t._id || t.id) === taskId ? { ...t, workStatus: WORK_STATUS.IN_PROGRESS } : t)));
      setActiveTaskId(taskId);
      const now = Date.now();
      setActiveStartTs(now);
      setElapsed(0);

      // call API to persist status and log response
      try {
        const res = await milestonesService.updateWorkStatus(taskId, WORK_STATUS.IN_PROGRESS);
        console.log("Start Work API response:", res);
        // If API returned updated milestone, merge it into tasks to ensure persistence
        if (res && (res._id || res.id)) {
          const updatedId = res._id || res.id;
          setTasks((prev) => prev.map((t) => ((t._id || t.id) === updatedId ? { ...t, ...(res || {}) } : t)));
        }
      } catch (apiErr) {
        console.error("Start work API failed", apiErr);
        setError(apiErr?.message || "Failed to start work");
        // revert UI if API failed
        setTasks((prev) => prev.map((t) => ((t._id || t.id) === taskId ? { ...t, workStatus: WORK_STATUS.NOT_STARTED } : t)));
        setActiveTaskId(null);
        setActiveStartTs(null);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to start work");
    }
  };

  const handleReviseWork = async (taskId) => {
    await handleStartWork(taskId);
  };

  const handleSubmitWork = async (taskId) => {
    if (!completionNotes.trim()) {
      setError("Please add completion notes");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      // Attempt to send selected proof file names as proofFiles (backend unchanged)
      const proofFileNames = proofFiles.map((f) => f.name);
      console.log("Submitting work for", taskId, { completionNotes, proofFileNames });
      const res = await milestonesService.updateWorkStatus(taskId, WORK_STATUS.WORK_SUBMITTED, completionNotes, proofFileNames);
      console.log("Submit Work API response:", res);

      // update UI: mark as submitted (visually treated as completed) and clear active session
      setTasks((prev) => prev.map((t) => ((t._id || t.id) === taskId ? { ...t, workStatus: WORK_STATUS.WORK_SUBMITTED, ...(res || {}) } : t)));
      // refresh tasks immediately to reflect server-side state
      try { await loadTasks(); } catch (e) { /* ignore refresh errors */ }
      setSuccessMessage("Work submitted successfully!");
      setCompletionNotes("");
      setSelectedTask(null);
      setActiveTaskId(null);
      setActiveStartTs(null);
      setProofFiles([]);
      setElapsed(0);
      setTimeout(() => {
        loadTasks();
        setSuccessMessage("");
      }, 1000);
    } catch (err) {
      setError(err?.message || "Failed to submit work");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Timer for active session (updates elapsed seconds)
  useEffect(() => {
    if (!activeTaskId || !activeStartTs) return;
    const iv = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - activeStartTs) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [activeTaskId, activeStartTs]);

  const handleFilesChange = (files) => {
    const arr = Array.from(files || []);
    setProofFiles(arr);
  };

  const assignedTasks = tasks.filter((t) => {
    const seller = t.contract?.seller;
    if (!seller) return false;
    const sellerId = seller._id || seller.id || seller;
    try {
      return String(sellerId) === String(userId);
    } catch (e) {
      return sellerId === userId;
    }
  });
  // group milestones by contract for contract-based task groups
  const contractsMap = assignedTasks.reduce((acc, m) => {
    const cid = m.contract?._id || m.contract;
    if (!cid) return acc;
    if (!acc[cid]) acc[cid] = { contract: m.contract || {}, milestones: [] };
    acc[cid].milestones.push(m);
    return acc;
  }, {});

  const contractGroups = Object.values(contractsMap);

  const categorizedTasks = {
    notStarted: assignedTasks.filter((t) => t.workStatus === WORK_STATUS.NOT_STARTED),
    inProgress: assignedTasks.filter((t) => t.workStatus === WORK_STATUS.IN_PROGRESS),
    submitted: assignedTasks.filter((t) => t.workStatus === WORK_STATUS.WORK_SUBMITTED && !needsRevision(t)),
    needsRevision: assignedTasks.filter((t) => needsRevision(t)),
    approved: assignedTasks.filter((t) => t.workStatus === WORK_STATUS.APPROVED),
  };

  const [expandedContracts, setExpandedContracts] = useState({});
  

  const toggleContract = (cid) => {
    setExpandedContracts((s) => ({ ...s, [cid]: !s[cid] }));
  };

  return (
    <section className="hustler-tasks-container">
      <div className="dashboard-content">
        <div className="tasks-page-header">
          <div className="tasks-header-content">
            <h1>My Tasks</h1>
            <p>Manage your assigned work steps and track your progress.</p>
          </div>
          <button className="refresh-button" onClick={loadTasks} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && <ErrorBanner error={error} />}
        {/* Active work panel: show currently in-progress task */}
        {(() => {
          const activeFromState = activeTaskId ? tasks.find((t) => (t._id || t.id) === activeTaskId) : null;
          const activeFromTasks = !activeFromState ? tasks.find((t) => t.workStatus === WORK_STATUS.IN_PROGRESS) : null;
          const active = activeFromState || activeFromTasks;
          if (!active) return null;
          const contract = active.contract || {};
          const statusLabel = active.workStatus === WORK_STATUS.APPROVED ? "Completed" : active.workStatus === WORK_STATUS.WORK_SUBMITTED ? "Submitted" : active.workStatus === WORK_STATUS.IN_PROGRESS ? "In Progress" : "Not Started";
          return (
            <div className="card active-work-card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                <div>
                  <div className="contract-title">{contract.title || active.title || 'Current Job'}</div>
                  <div className="contract-desc">{contract.description || active.description || active.title || ''}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:800}}>{Math.round(((() => {
                    // compute simple percent for the active stage.
                    const total = 1; // per-stage context unknown; show 0/1 for current
                    const completed = active.workStatus === WORK_STATUS.APPROVED ? 1 : 0;
                    return total ? (completed / total) * 100 : 0;
                  })()))}%</div>
                  <div className="status-pill" style={{marginTop:6}}>{statusLabel}</div>
                </div>
              </div>

              <div style={{marginTop:12,display:'flex',gap:12,flexDirection:'column'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
                  <div style={{flex:1}}>
                    <h4 style={{margin:'0 0 6px 0'}}>Current Task</h4>
                    <p style={{margin:0,color:'var(--muted)'}}>{active.title || active.description || 'Task details'}</p>
                  </div>
                  <div style={{minWidth:140,textAlign:'right'}}>
                    <div style={{fontSize:'0.85rem',color:'var(--muted)'}}>Status</div>
                    <div style={{fontWeight:800}}>In Progress</div>
                    {activeStartTs && (
                      <div style={{fontSize:'0.85rem',color:'var(--muted)',marginTop:6}}>Started {new Date(activeStartTs).toLocaleTimeString()}</div>
                    )}
                    {elapsed > 0 && (
                      <div style={{fontSize:'0.85rem',color:'var(--muted)'}}>{Math.floor(elapsed/60)}m {elapsed%60}s</div>
                    )}
                  </div>
                </div>

                <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
                  <textarea placeholder="Add work notes..." value={completionNotes} onChange={(e)=>setCompletionNotes(e.target.value)} style={{flex:1,minHeight:80,padding:10,borderRadius:8,border:'1px solid rgba(11,21,48,0.06)'}} />
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <label className="btn-ghost" style={{cursor:'pointer',padding:'8px 12px'}}>Upload Proof<input type="file" multiple onChange={(e)=>handleFilesChange(e.target.files)} style={{display:'none'}} /></label>
                    <div style={{fontSize:'0.85rem',color:'var(--muted)'}}>{proofFiles.length? proofFiles.map(f=>f.name).join(', '): 'No files selected'}</div>
                    <button className="btn-primary" onClick={()=>setSelectedTask(active._id || active.id)} style={{marginTop:8}}>Mark Task Complete</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}

        {selectedTask && (
          <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Submit Your Work</h2>
                <button className="modal-close" onClick={() => setSelectedTask(null)}>Close</button>
              </div>
              <div className="modal-body">
                <div className="modal-field">
                  <label>Completion Notes *</label>
                  <textarea
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    placeholder="Describe what you've completed, any challenges you faced, and additional details..."
                  ></textarea>
                  <small>Be detailed so the manager understands your work.</small>
                </div>
                {error && <div className="error-message">{error}</div>}
              </div>
              <div className="modal-footer">
                <button
                  className="modal-button modal-button-secondary"
                  onClick={() => setSelectedTask(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className="modal-button modal-button-primary"
                  onClick={() => handleSubmitWork(selectedTask)}
                  disabled={submitting || !completionNotes.trim()}
                >
                  {submitting ? "Submitting..." : "Submit Work"}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && <Loader label="Loading your tasks..." />}

        {!loading && assignedTasks.length === 0 && (
          <div className="empty-tasks-state">
            <div className="empty-icon">0</div>
            <div className="empty-message">
              <h3>No tasks assigned yet</h3>
              <p>Tasks will appear here once a manager assigns work to you.</p>
            </div>
          </div>
        )}

        {!loading && assignedTasks.length > 0 && (
          <div className="contracts-task-list">
            {contractGroups.map(({ contract, milestones }) => {
              const cid = contract._id || contract.id || JSON.stringify(contract);
              const total = milestones.length;
              const completed = milestones.filter((m) => m.workStatus === WORK_STATUS.APPROVED).length;
              const percent = total ? Math.round((completed / total) * 100) : 0;
              const hasSubmittedWork = milestones.some((m) => m.workStatus === WORK_STATUS.WORK_SUBMITTED);
              const firstId = milestones[0]?._id || milestones[0]?.id || "";
              const isPlaceholder = String(firstId).startsWith("contract-placeholder-");
              // If placeholder (no milestones) derive status from contract.status
              const statusLabel = isPlaceholder
                ? (contract?.status && contract.status !== "pending" ? "In Progress" : "Not Started")
                : (milestones.some(needsRevision) ? "Needs Revision" : percent === 100 ? "Completed" : hasSubmittedWork ? "Awaiting Approval" : percent === 0 ? "Not Started" : "In Progress");
              const statusClass = isPlaceholder
                ? (contract?.status && contract.status !== "pending" ? "in-progress" : "not-started")
                : (milestones.some(needsRevision) ? "needs-revision" : percent === 100 ? "completed" : hasSubmittedWork ? "submitted" : percent === 0 ? "not-started" : "in-progress");
              return (
                <div key={cid} className="contract-card task-group">
                  <div className="contract-card-header">
                    <div>
                      <h3 className="contract-title">{contract.title || "Untitled Contract"}</h3>
                      <div className="contract-sub">{contract.description || ""}</div>
                      <div className={`status-pill ${hasSecuredOrReleasedEscrow(contract) ? "status-completed" : "status-not-started"}`} style={{marginTop:8,display:"inline-flex"}}>
                        {formatEscrowStatus(contract.escrowStatus)}
                      </div>
                    </div>
                    <div className="contract-meta-right">
                              <div className="contract-progress">
                                <div className="progress-percent">{percent}%</div>
                                <div className="progress-text">{completed} of {total} task{total!==1? 's' : ''} completed</div>
                                <div className={`status-pill status-${statusClass}`}>{statusLabel}</div>
                              </div>
                      <button className="btn-ghost" onClick={() => toggleContract(cid)}>{expandedContracts[cid] ? "Collapse" : "Expand"}</button>
                    </div>
                  </div>

                  {expandedContracts[cid] && (
                    <>
                    <div className="stages-list">
                      {milestones.length === 0 && (
                        <div className="no-tasks">
                          <p>No tasks available yet</p>
                          <div className="no-tasks-actions">
                            <a className="btn-link" href={`/dashboard/contracts/${contract._id || contract.id}`}>View Job</a>

                          </div>
                        </div>
                      )}
                      {milestones.map((m) => (
                        <div key={m._id || m.id} className="stage-row">
                          <div className="stage-info">
                            <div className={`stage-status-dot status-${m.workStatus || 'not_started'}`} />
                            <div className="stage-meta">
                              <div className="stage-title">{m.title || m.description || 'Task'}</div>
                              <div className="stage-sub muted">{m.description}</div>
                            </div>
                          </div>
                          <div className="stage-actions">
                            <a className="btn-link" href={`/dashboard/tasks/${contract._id || contract.id}/${m._id || m.id}`}>View Work Status</a>
                            {m.workStatus === WORK_STATUS.NOT_STARTED && !(String(m._id || m.id).startsWith('contract-placeholder-')) && (
                              <button className="btn-start" onClick={() => handleStartWork(m._id || m.id)} disabled={submitting || !canStartWithEscrow(m.contract || contract)}>Start Work</button>
                            )}
                            {m.workStatus === WORK_STATUS.IN_PROGRESS && (
                              <button className="btn-complete" onClick={() => setSelectedTask(m._id || m.id)}>Mark Complete</button>
                            )}
                            {needsRevision(m) && (
                              <>
                                <div className="revision-note">
                                  {m.rejectionReason ? `Revision: ${m.rejectionReason}` : "Revision requested"}
                                </div>
                                <button className="btn-start" onClick={() => handleReviseWork(m._id || m.id)} disabled={submitting || !canStartWithEscrow(m.contract || contract)}>Revise Work</button>
                              </>
                            )}
                            {m.workStatus === WORK_STATUS.WORK_SUBMITTED && !needsRevision(m) && (
                              <div className="stage-badge badge-submitted">Submitted for review</div>
                            )}
                            {m.workStatus === WORK_STATUS.APPROVED && (
                              <div className="stage-badge badge-complete">Completed</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                      
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
