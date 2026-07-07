import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useContractsStore } from "../../state/useContractsStore.js";
import { ContractApplicationsService } from "../../services/contractApplicationsService.js";
import { contractsService } from "../../services/contractsService.js";
import { conversationsService } from "../../services/conversationsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatEscrowStatus(status, prepared = false) {
  const labels = {
    waiting_for_funding: "Waiting For Funding",
    funded: "Funded",
    in_progress: "In Progress",
    awaiting_approval: "Awaiting Approval",
    released: "Payment Released",
  };
  return labels[status] || (prepared ? "Funded" : "No Escrow Yet");
}

function getContractProgressLabel(contract) {
  if (contract?.escrowStatus === "released" || contract?.status === "completed") return "Completed";
  if (contract?.escrowStatus === "awaiting_approval") return "Awaiting Approval";
  if (contract?.escrowStatus === "in_progress") return "In Progress";
  if (contract?.escrowStatus === "funded") return "Funded";
  if (contract?.escrowStatus === "waiting_for_funding") return "Waiting For Funding";
  return "Not Started";
}

function getContractPaymentStructure(contract) {
  const value = contract?.paymentType || contract?.contractType;
  return value === "staged" ? "staged" : "single";
}

export default function ContractDetailsPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const { contractId } = useParams();
  const { contract, contractLoading, contractError, fetchContract } = useContractsStore();
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState("");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [escrowError, setEscrowError] = useState("");
  const [escrowSuccess, setEscrowSuccess] = useState("");
  const [finalApprovalLoading, setFinalApprovalLoading] = useState(false);
  const [finalApprovalError, setFinalApprovalError] = useState("");
  const [finalApprovalSuccess, setFinalApprovalSuccess] = useState("");

  useEffect(() => {
    fetchContract(contractId);
  }, [contractId]);

  const isAssigned = contract && (contract.seller?._id === userId || contract.seller === userId);
  const isHustler = user?.role === "hustler";
  const isManager = user?.role === "manager";
  const canApply = isHustler && !isAssigned && contract?.status === "pending";
  const isContractBuyer = contract && (contract.buyer?._id === userId || contract.buyer === userId);
  const canOpenChat = Boolean(contract && contract.seller && (isContractBuyer || isAssigned || isManager));
  const contractPaymentType = getContractPaymentStructure(contract);
  const milestones = Array.isArray(contract?.milestones) ? contract.milestones : [];
  const approvedMilestones = milestones.filter((stage) => stage.status === "approved");
  const isFinalApprovalReady =
    contract?.escrowPrepared &&
    contract?.escrowStatus !== "released" &&
    milestones.length > 0 &&
    (contractPaymentType === "staged" ? approvedMilestones.length === milestones.length : approvedMilestones.length > 0);

  const handleApply = async () => {
    setApplyLoading(true);
    setApplyError("");
    setApplySuccess("");
    try {
      await ContractApplicationsService.applyForContract(contractId, {
        coverLetter: `Application for ${contract?.title || "this job"}`,
        proposedRate: contract?.amount,
        estimatedDuration: "",
      });
      setApplySuccess("Application submitted successfully!");
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setApplyError(err?.message || "Failed to apply for this job. Please try again.");
      console.error(err);
    } finally {
      setApplyLoading(false);
    }
  };

  const handlePrepareEscrow = async () => {
    setEscrowLoading(true);
    setEscrowError("");
    setEscrowSuccess("");
    try {
      await contractsService.prepareEscrow(contractId, contract.amount);
      setEscrowSuccess("Escrow prepared successfully!");
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setEscrowError(err?.message || "Failed to prepare escrow. Please try again.");
      console.error(err);
    } finally {
      setEscrowLoading(false);
    }
  };

  const handleFinalApproval = async () => {
    setFinalApprovalLoading(true);
    setFinalApprovalError("");
    setFinalApprovalSuccess("");
    try {
      await contractsService.finalApprove(contractId);
      setFinalApprovalSuccess("Final approval complete. Payment released to the hustler.");
      setTimeout(() => {
        fetchContract(contractId);
      }, 1000);
    } catch (err) {
      setFinalApprovalError(err?.message || "Failed to complete final approval.");
      console.error(err);
    } finally {
      setFinalApprovalLoading(false);
    }
  };

  const navigate = useNavigate();
  const [chatError, setChatError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const backPath = user?.role === "admin" ? "/admin/contracts" : user?.role === "manager" ? "/manager/contracts" : "/dashboard/contracts";

  const getStatusColor = (status) => {
    const statusColors = {
      pending: "#f59e0b",
      active: "#10b981",
      completed: "#0ea5e9",
      cancelled: "#6b7280",
      disputed: "#ef4444",
      terminated: "#8b5cf6",
    };
    const s = (status || "").toString().toLowerCase();
    // Treat work_submitted and submitted as completed for UI
    if (s === "work_submitted" || s === "submitted") return statusColors["completed"];
    return statusColors[s] || "#6b7280";
  };

  const handleOpenChat = async () => {
    setChatError("");
    try {
      const conversation = await conversationsService.openForContract(contractId);
      const conversationId = conversation._id || conversation.id;
      if (conversationId) {
        const chatBase = user?.role === "admin" ? "/admin" : user?.role === "manager" ? "/manager" : "/dashboard";
        navigate(`${chatBase}/chat/${conversationId}`);
        setUnreadCount(0);
      }
    } catch (err) {
      setChatError(err?.message || "Unable to open chat for this contract.");
      console.error(err);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadUnread = async () => {
      if (!contractId) return;
      try {
        const cnt = await conversationsService.getUnreadForContract(contractId);
        if (mounted) setUnreadCount(cnt || 0);
      } catch (e) {
        // ignore
      }
    };
    loadUnread();
    return () => {
      mounted = false;
    };
  }, [contractId]);

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Job Details</h2>
          <p>Review the job details and track work stage progress.</p>
        </div>
        <Link to={backPath} className="button-secondary">
          Back to jobs
        </Link>
      </header>

      {contractLoading && <Loader label="Loading job..." />}
      {contractError && <ErrorBanner error={contractError} />}

      {!contractLoading && !contractError && contract && (
        <div className="contract-details-container">
          {/* Main Details Card */}
          <div className="details-card">
            <div className="details-header">
              <div className="details-title-section">
                <h3 className="details-title">{contract.title}</h3>
                <span 
                  className="status-badge details-status" 
                  style={{ backgroundColor: getStatusColor(contract.status) }}
                >
                  {contract.status}
                </span>
              </div>
            </div>

            <p className="details-description">{contract.description}</p>

            {/* Contract Info Grid */}
            <div className="contract-info-grid">
              <div className="info-item">
                <div className="info-label">Contract Type</div>
                <div className="info-value">
                  <span className="type-label">
                    {contractPaymentType === "single" ? "Single Payment Contract" : "Staged Payment Contract"}
                  </span>
                </div>
              </div>
              <div className="info-item">
                <div className="info-label">Amount</div>
                <div className="info-value">
                  <span className="amount-highlight">
                    {contract.currency} {contract.amount}
                  </span>
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Status</div>
                <div className="info-value">
                  <span 
                    className="status-badge-small" 
                    style={{ backgroundColor: getStatusColor(contract.status) }}
                  >
                    {contract.status}
                  </span>
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Project Manager</div>
                <div className="info-value">
                  {contract.buyer?.firstName ? `${contract.buyer.firstName} ${contract.buyer.lastName}` : contract.buyer?.name || "—"}
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Assigned Worker</div>
                <div className="info-value">
                  {contract.seller?.firstName ? `${contract.seller.firstName} ${contract.seller.lastName}` : "Not assigned"}
                </div>
              </div>

              <div className="info-item">
                <div className="info-label">Start Date</div>
                <div className="info-value">{formatDate(contract.startDate)}</div>
              </div>

              <div className="info-item">
                <div className="info-label">Currency</div>
                <div className="info-value">{contract.currency || "USD"}</div>
              </div>

              <div className="info-item">
                <div className="info-label">Escrow</div>
                <div className="info-value">{formatEscrowStatus(contract.escrowStatus, contract.escrowPrepared)}</div>
              </div>
            </div>

            {/* Action Buttons Section */}
            {(canApply || isAssigned || isManager) && (
              <div className="actions-section">
                {isManager && isContractBuyer && !contract?.seller && !contract?.escrowPrepared && (
                  <div className="action-group">
                    <Link
                      to={`/manager/contracts/${contract._id || contract.id}/edit`}
                      className="button-secondary action-button"
                    >
                      Edit Contract
                    </Link>
                  </div>
                )}

                {/* Apply Button for Hustlers */}
                {canApply && (
                  <div className="action-group">
                    {applyError && <ErrorBanner error={applyError} />}
                    {applySuccess && (
                      <div className="success-message">
                        {applySuccess}
                      </div>
                    )}
                    <button 
                      onClick={handleApply} 
                      disabled={applyLoading}
                      className="button-primary action-button"
                    >
                      {applyLoading ? "Applying..." : "Apply for This Job"}
                    </button>
                  </div>
                )}

                {/* Escrow Button for Managers */}
                {isManager && isContractBuyer && !contract?.escrowPrepared && (
                  <div className="action-group">
                    {escrowError && <ErrorBanner error={escrowError} />}
                    {escrowSuccess && (
                      <div className="success-message">
                        {escrowSuccess}
                      </div>
                    )}
                    <button 
                      onClick={handlePrepareEscrow} 
                      disabled={escrowLoading || !["assigned", "active"].includes(contract?.status)}
                      className="button-success action-button"
                    >
                      {escrowLoading
                        ? "Funding Escrow..."
                        : `Fund Escrow (${contract?.amount} ${contract?.currency})`}
                    </button>
                  </div>
                )}

                {/* Escrow Confirmation */}
                {isManager && isContractBuyer && contract?.escrowPrepared && (
                  <div className="escrow-confirmed">
                    <span>Escrow status: {formatEscrowStatus(contract.escrowStatus, contract.escrowPrepared)}</span>
                  </div>
                )}

                {isManager && isContractBuyer && contract?.escrowPrepared && contract?.escrowStatus !== "released" && (
                  <div className="action-group">
                    {finalApprovalError && <ErrorBanner error={finalApprovalError} />}
                    {finalApprovalSuccess && <div className="success-message">{finalApprovalSuccess}</div>}
                    <button
                      onClick={handleFinalApproval}
                      disabled={finalApprovalLoading || !isFinalApprovalReady}
                      className="button-success action-button"
                    >
                      {finalApprovalLoading ? "Releasing Payment..." : "Final Approval & Release Payment"}
                    </button>
                    {!isFinalApprovalReady && (
                      <p className="submission-notes">
                        {contractPaymentType === "staged"
                          ? "All stages must be approved before final payment release."
                          : "Final work must be approved before payment release."}
                      </p>
                    )}
                  </div>
                )}

                {(isManager && isContractBuyer) || isAssigned ? (
                  <div className="action-group">
                    {chatError && <ErrorBanner error={chatError} />}
                    <button
                      onClick={handleOpenChat}
                      className="button-secondary action-button"
                      disabled={!canOpenChat}
                    >
                      Open Contract Messages
                      {unreadCount > 0 && <span className="unread-badge" style={{ marginLeft: 8 }}>{unreadCount}</span>}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Work Stages Card (only for staged contracts) */}
          {contractPaymentType !== "single" ? (
            <div className="details-card work-stages-card">
              <h3 className="section-title">Work Steps</h3>
              {Array.isArray(contract.milestones) && contract.milestones.length ? (
                <div className="milestones-list">
                  {contract.milestones.map((stage, idx) => (
                    <div key={stage._id || stage.id} className="milestone-item">
                      <div className="milestone-header">
                        <div className="milestone-number">{idx + 1}</div>
                        <div className="milestone-info">
                          <h4 className="milestone-title">{stage.title}</h4>
                          <p className="milestone-description">{stage.description}</p>
                        </div>
                        <span 
                          className="status-badge-small milestone-status" 
                          style={{ backgroundColor: getStatusColor(stage.status || stage.workStatus) }}
                        >
                          {stage.status || stage.workStatus}
                        </span>
                      </div>
                      <div className="milestone-details">
                        <div className="milestone-detail-item">
                          <span className="detail-label">Payment:</span>
                          <span className="detail-value">{stage.amount} {contract.currency || 'KES'}</span>
                        </div>
                        <div className="milestone-detail-item">
                          <span className="detail-label">Due:</span>
                          <span className="detail-value">{formatDate(stage.dueDate)}</span>
                        </div>
                      </div>

                      {/* Manager View: Hustler Status Section */}
                      {isManager && (
                        <div className="hustler-status-section">
                          <div className="status-section-header">
                            <span className="status-icon">👤</span>
                            <strong>Hustler Status</strong>
                          </div>

                          {stage.status === "pending" && (
                            <div className="status-content pending-status">
                              <p className="status-info">Awaiting hustler submission</p>
                            </div>
                          )}

                          {(stage.status === "submitted" || stage.workStatus === "work_submitted") && stage.submissionData && (
                            <div className="status-content submitted-status">
                              <div className="submission-detail">
                                <span className="detail-label">Submitted on:</span>
                                <span className="detail-value">{formatDate(stage.submittedAt)}</span>
                              </div>
                              {stage.submissionData.notes && (
                                <div className="submission-detail">
                                  <span className="detail-label">Completion Notes:</span>
                                  <p className="submission-notes">{stage.submissionData.notes}</p>
                                </div>
                              )}
                              {stage.submissionData.workSampleUrl && (
                                <div className="submission-detail">
                                  <span className="detail-label">Work Sample:</span>
                                  <a 
                                    href={stage.submissionData.workSampleUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="work-sample-link"
                                  >
                                    View Work Sample →
                                  </a>
                                </div>
                              )}
                              <p className="submission-status">Pending Your Review</p>
                            </div>
                          )}

                          {(stage.status === "approved" || stage.workStatus === "approved") && (
                            <div className="status-content approved-status">
                              <p className="status-check">Work Approved</p>
                              <div className="approval-detail">
                                <span className="detail-label">Approved on:</span>
                                <span className="detail-value">{formatDate(stage.approvedAt)}</span>
                              </div>
                              {stage.paymentStatus === "released" && (
                                <div className="payment-released">
                                  <span>Payment released after final contract approval.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {(stage.status === "rejected" || stage.workStatus === "rejected") && (
                            <div className="status-content rejected-status">
                              <p className="status-rejected">Work Rejected</p>
                              {stage.rejectionReason && (
                                <div className="rejection-reason">
                                  <span className="detail-label">Reason:</span>
                                  <p className="reason-text">{stage.rejectionReason}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-milestones">
                  <p>No work steps are attached to this job yet.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="details-card work-stages-card">
              <h3 className="section-title">Single Payment</h3>
              <div className="single-payment-overview">
                <p>This is a single-payment job. No work steps are required.</p>
                <div className="progress-summary">
                  <div className="info-label">Progress</div>
                  <div className="info-value">
                    <strong>
                      {getContractProgressLabel(contract)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
