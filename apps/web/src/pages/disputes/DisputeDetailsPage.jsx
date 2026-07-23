import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { conversationsService } from "../../services/conversationsService.js";
import { disputesService } from "../../services/disputesService.js";
import { messagesService } from "../../services/messagesService.js";
import { IconPaperclip } from "../../components/Icons.jsx";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function formatName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "Unknown user";
}

function fileToAttachment(file) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error("Attachment must be 5MB or smaller."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size = 0) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatList(values = []) {
  return Array.isArray(values) && values.length ? values.map((value) => String(value).replace(/_/g, " ")).join(", ") : "Not specified";
}

function getDisputeOutcomeLabel(dispute) {
  const resolutionType = String(dispute?.resolutionType || "").toLowerCase();
  if (String(dispute?.status || "").toLowerCase() === "closed" && resolutionType === "manager_approved") {
    return "Manager approved the work";
  }
  if (resolutionType) {
    return resolutionType.replace(/_/g, " ");
  }
  return "";
}

function getEffectiveDisputeStatus(dispute) {
  const actualStatus = String(dispute?.status || "").toLowerCase();
  const resolutionType = String(dispute?.resolutionType || "").toLowerCase();
  const managerApprovedBy = String(dispute?.contract?.finalApprovedBy || dispute?.contract?.metadata?.managerApprovedBy || dispute?.contract?.metadata?.finalApprovedBy || "").toLowerCase();
  if (actualStatus === "closed") return "closed";
  if (resolutionType === "manager_approved") return "closed";
  if (resolutionType === "release_full_payment") return "resolved";
  if (managerApprovedBy && String(dispute?.contract?.status || "").toLowerCase() === "completed" && String(dispute?.contract?.escrowStatus || "").toLowerCase() === "released") return "closed";
  return actualStatus || "open";
}

export default function DisputeDetailsPage() {
  const { disputeId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const currentBasePath = location.pathname.startsWith("/admin") ? "/admin" : location.pathname.startsWith("/manager") ? "/manager" : "/dashboard";
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const [dispute, setDispute] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threadMessage, setThreadMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [evidenceAttachments, setEvidenceAttachments] = useState([]);
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false);
  const [adminResolutionType, setAdminResolutionType] = useState("release_payment");
  const [adminNotes, setAdminNotes] = useState("");
  const [splitRatio, setSplitRatio] = useState("50");
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [evidenceRecipientScope, setEvidenceRecipientScope] = useState("both");
  const [evidenceTypes, setEvidenceTypes] = useState(["photos"]);
  const [evidenceRequestDeadline, setEvidenceRequestDeadline] = useState("");
  const [evidenceResponseMessage, setEvidenceResponseMessage] = useState("");
  const [evidenceResponseAttachments, setEvidenceResponseAttachments] = useState([]);
  const [evidenceResponseSubmitting, setEvidenceResponseSubmitting] = useState(false);
  const [showReleaseConfirmModal, setShowReleaseConfirmModal] = useState(false);
  const [selectedReleaseRecipientId, setSelectedReleaseRecipientId] = useState("");
  const evidenceFileInputRef = useRef(null);
  const evidenceResponseFileInputRef = useRef(null);

  const contract = dispute?.contract || {};
  const contractId = contract?._id || contract?.id || null;
  const timeline = Array.isArray(dispute?.timeline) ? dispute.timeline : [];
  const evidence = Array.isArray(dispute?.evidence) ? dispute.evidence : [];
  const evidenceRequests = Array.isArray(dispute?.evidenceRequests) ? dispute.evidenceRequests : [];
  const contractDisbursements = Array.isArray(contract?.metadata?.disbursements) ? contract.metadata.disbursements : [];
  const releaseRecipients = Array.isArray(contract?.assignedHustlers) ? contract.assignedHustlers : [];
  const assignedHustlersLabel = releaseRecipients.length
    ? releaseRecipients.map((hustler) => formatName(hustler)).join(", ")
    : formatName(contract.seller || dispute?.raisedBy);
  const pendingEvidenceRequests = evidenceRequests.filter((request) => String(request.status || "pending").toLowerCase() === "pending");
  const currentUserId = String(user?._id || user?.id || user?.userId || "");
  const userPendingEvidenceRequests = pendingEvidenceRequests.filter((request) =>
    Array.isArray(request?.recipientIds) ? request.recipientIds.map((value) => String(value)).includes(currentUserId) : false
  );
  const latestPendingRequest = userPendingEvidenceRequests[userPendingEvidenceRequests.length - 1] || null;
  const latestRequestRecipients = Array.isArray(latestPendingRequest?.recipientIds) ? latestPendingRequest.recipientIds.map((value) => String(value)) : [];
  const canRespondToEvidenceRequest = Boolean(latestPendingRequest && latestRequestRecipients.includes(currentUserId));
  const effectiveDisputeStatus = getEffectiveDisputeStatus(dispute);
  const canAddEvidence = Boolean(dispute && !["resolved", "closed"].includes(effectiveDisputeStatus));
  const showGeneralEvidenceForm = canAddEvidence && !canRespondToEvidenceRequest;
  const releaseRecipient = useMemo(() => {
    const selectedRecipient = releaseRecipients.find((item) => String(item?._id || item?.id || item) === String(selectedReleaseRecipientId));
    if (selectedRecipient) return selectedRecipient;

    const raisedById = String(dispute?.raisedBy?._id || dispute?.raisedBy?.id || dispute?.raisedBy || "");
    const assignedToId = String(dispute?.assignedTo?._id || dispute?.assignedTo?.id || dispute?.assignedTo || "");
    const sellerId = String(contract?.seller?._id || contract?.seller?.id || contract?.seller || "");
    const payeeIds = contractDisbursements.map((item) => String(item?.hustler?._id || item?.hustler?.id || item?.hustler || "")).filter(Boolean);
    if (raisedById && payeeIds.includes(raisedById)) return dispute?.raisedBy;
    if (assignedToId && payeeIds.includes(assignedToId)) return dispute?.assignedTo;
    if (sellerId && payeeIds.includes(sellerId)) return contract?.seller;
    if (raisedById) return dispute?.raisedBy;
    if (assignedToId) return dispute?.assignedTo;
    if (sellerId) return contract?.seller;
    return null;
  }, [contract?.seller, contractDisbursements, dispute?.assignedTo, dispute?.raisedBy, releaseRecipients, selectedReleaseRecipientId]);
  const releaseDisbursement = useMemo(() => {
    const recipientId = String(releaseRecipient?._id || releaseRecipient?.id || releaseRecipient || "");
    const existingEntry = contractDisbursements.find((item) => String(item?.hustler?._id || item?.hustler?.id || item?.hustler || "") === recipientId);
    const payeeCount = Math.max(1, contractDisbursements.length || Number(contract?.numWorkers || 1));
    const grossAmount = Number(existingEntry?.grossAmount ?? Number(contract?.amount || 0) / payeeCount);
    const commissionAmount = Number(existingEntry?.commissionAmount ?? Number((grossAmount * 0.025).toFixed(2)));
    const netAmount = Number(existingEntry?.netAmount ?? Number((grossAmount - commissionAmount).toFixed(2)));
    return {
      recipient: releaseRecipient,
      recipientId,
      grossAmount,
      commissionAmount,
      netAmount,
      escrowAmount: Number(contract?.escrowAmount || contract?.amount || 0),
    };
  }, [contract?.amount, contract?.escrowAmount, contract?.numWorkers, contractDisbursements, releaseRecipient]);

  useEffect(() => {
    if (adminResolutionType !== "release_payment") return;
    if (selectedReleaseRecipientId) return;
    const defaultRecipientId = String(releaseRecipient?._id || releaseRecipient?.id || releaseRecipient || "");
    if (defaultRecipientId) {
      setSelectedReleaseRecipientId(defaultRecipientId);
    }
  }, [adminResolutionType, releaseRecipient, selectedReleaseRecipientId]);
  const adminResolutionLabel = {
    release_payment: "Release full payment",
    refund_manager: "Refund manager",
    split_payment: "Split payment",
    request_evidence: "Request additional evidence",
    under_review: "Mark under review",
    close: "Close dispute",
  };

  const loadDispute = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await disputesService.get(disputeId);
      setDispute(data?.dispute || null);
      const thread = data?.thread || null;
      if (thread?.messages) {
        setMessages(thread.messages);
      } else if (data?.dispute?.conversationId) {
        const convo = await conversationsService.getConversation(data.dispute.conversationId);
        const fetched = await messagesService.list(convo?._id || convo?.id || data.dispute.conversationId);
        setMessages(fetched);
      } else {
        setMessages([]);
      }
    } catch (err) {
      setError(err?.message || "Failed to load dispute.");
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    if (disputeId) {
      loadDispute();
    }
  }, [disputeId, loadDispute]);

  const disputeThreadId = dispute?.conversationId?._id || dispute?.conversationId?.id || dispute?.conversationId || null;
  const backLink = useMemo(() => {
    if (isAdmin) return "/admin/disputes";
    return contractId ? `${currentBasePath}/contracts/${contractId}` : `${currentBasePath}/contracts`;
  }, [isAdmin, contractId, currentBasePath]);

  const handleThreadSend = async (event) => {
    event.preventDefault();
    if (!threadMessage.trim() || !disputeThreadId) return;
    setSending(true);
    try {
      await messagesService.create(disputeThreadId, threadMessage.trim(), []);
      setThreadMessage("");
      await loadDispute();
    } catch (err) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleEvidenceAttachments = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (evidenceAttachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      event.target.value = "";
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.map(fileToAttachment));
      setEvidenceAttachments((current) => [...current, ...nextAttachments]);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to attach file.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRequestedEvidenceAttachments = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (evidenceResponseAttachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      event.target.value = "";
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.map(fileToAttachment));
      setEvidenceResponseAttachments((current) => [...current, ...nextAttachments]);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to attach file.");
    } finally {
      event.target.value = "";
    }
  };

  const removeEvidenceAttachment = (index) => {
    setEvidenceAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submitEvidence = async (event) => {
    event.preventDefault();
    if (!disputeId || !evidenceAttachments.length) return;
    setEvidenceSubmitting(true);
    setError("");
    try {
      await disputesService.addEvidence(disputeId, { notes: evidenceNotes, attachments: evidenceAttachments });
      setEvidenceNotes("");
      setEvidenceAttachments([]);
      await loadDispute();
    } catch (err) {
      setError(err?.message || "Failed to submit evidence.");
    } finally {
      setEvidenceSubmitting(false);
    }
  };

  const submitRequestedEvidence = async (event) => {
    event.preventDefault();
    if (!disputeId || !latestPendingRequest || !evidenceResponseAttachments.length || !evidenceResponseMessage.trim()) return;
    setEvidenceResponseSubmitting(true);
    setError("");
    try {
      await disputesService.addEvidence(disputeId, {
        requestId: latestPendingRequest.requestId,
        notes: evidenceResponseMessage,
        attachments: evidenceResponseAttachments,
      });
      setEvidenceResponseMessage("");
      setEvidenceResponseAttachments([]);
      await loadDispute();
    } catch (err) {
      setError(err?.message || "Failed to submit requested evidence.");
    } finally {
      setEvidenceResponseSubmitting(false);
    }
  };

  const submitAdminAction = async (action) => {
    const needsNotes = ["release_payment", "refund_manager", "split_payment", "request_evidence", "close"].includes(action);
    const trimmedNotes = adminNotes.trim();
    if (needsNotes && !trimmedNotes) {
      setError("Admin notes are required before confirming this action.");
      return;
    }
    if (action === "request_evidence" && (!evidenceRequestDeadline || !evidenceTypes.length)) {
      setError("Select at least one evidence type and a response deadline.");
      return;
    }

    setAdminSubmitting(true);
    setError("");
    try {
      const payload = { action, note: trimmedNotes };
      if (action === "request_evidence") {
        payload.recipientRoles = evidenceRecipientScope;
        payload.requiredEvidenceTypes = evidenceTypes;
        payload.responseDeadline = evidenceRequestDeadline || null;
      }
      if (action === "split_payment") {
        payload.splitRatio = splitRatio;
      }
      if (action === "release_payment") {
        payload.targetHustlerId = selectedReleaseRecipientId || releaseDisbursement.recipientId || null;
      }
      await disputesService.performAction(disputeId, payload);
      setAdminNotes("");
      setSplitRatio("50");
      setAdminResolutionType("release_payment");
      setEvidenceRecipientScope("both");
      setEvidenceTypes(["photos"]);
      setEvidenceRequestDeadline("");
      setShowReleaseConfirmModal(false);
      await loadDispute();
    } catch (err) {
      setError(err?.message || "Unable to update dispute.");
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminConfirm = () => {
    if (adminResolutionType === "release_payment") {
      const trimmedNotes = adminNotes.trim();
      if (!trimmedNotes) {
        setError("Admin notes are required before confirming this action.");
        return;
      }
      setShowReleaseConfirmModal(true);
      return;
    }
    submitAdminAction(adminResolutionType);
  };

  const adminControls = isAdmin && dispute && !["resolved", "closed"].includes(effectiveDisputeStatus) ? (
    <section className="dispute-section">
      <h3>Admin resolution</h3>
      <div className="dispute-detail-grid">
        <div><span>Resolution type</span><strong>{adminResolutionLabel[adminResolutionType] || "Release full payment"}</strong></div>
        <div><span>Current status</span><strong>{String(effectiveDisputeStatus || dispute.status || "").replace(/_/g, " ")}</strong></div>
      </div>

      <label className="form-label">
        <span className="label-text">Action</span>
        <select value={adminResolutionType} onChange={(event) => setAdminResolutionType(event.target.value)}>
          <option value="release_payment">Release full payment</option>
          <option value="refund_manager">Refund manager</option>
          <option value="split_payment">Split payment</option>
          <option value="request_evidence">Request additional evidence</option>
          <option value="under_review">Mark under review</option>
          <option value="close">Close dispute</option>
        </select>
      </label>

      {adminResolutionType === "split_payment" && (
        <label className="form-label">
          <span className="label-text">Manager share percentage</span>
          <input type="number" min="0" max="100" step="1" value={splitRatio} onChange={(event) => setSplitRatio(event.target.value)} />
        </label>
      )}

      <label className="form-label">
        <span className="label-text">{adminResolutionType === "request_evidence" ? "Request message" : "Admin notes"}</span>
        <textarea
          rows={4}
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          placeholder={adminResolutionType === "request_evidence" ? "Tell the recipients exactly what evidence is needed." : "Explain the decision clearly before confirming."}
        />
      </label>

      {adminResolutionType === "request_evidence" && (
        <div className="dispute-detail-grid">
          <label className="form-label">
            <span className="label-text">Send to</span>
            <select value={evidenceRecipientScope} onChange={(event) => setEvidenceRecipientScope(event.target.value)}>
              <option value="manager">Manager</option>
              <option value="hustler">Hustler</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className="form-label">
            <span className="label-text">Response deadline</span>
            <input type="datetime-local" value={evidenceRequestDeadline} onChange={(event) => setEvidenceRequestDeadline(event.target.value)} />
          </label>
        </div>
      )}

      {adminResolutionType === "request_evidence" && (
        <div className="dispute-evidence-types">
          {["photos", "videos", "documents", "receipts", "screenshots"].map((type) => (
            <label key={type} className="dispute-evidence-type-chip">
              <input
                type="checkbox"
                checked={evidenceTypes.includes(type)}
                onChange={(event) => {
                  setEvidenceTypes((current) =>
                    event.target.checked ? [...new Set([...current, type])] : current.filter((item) => item !== type)
                  );
                }}
              />
              <span>{type}</span>
            </label>
          ))}
        </div>
      )}

      {adminResolutionType === "release_payment" && (
        <div className="dispute-request-list">
          <article className="dispute-request-item">
            <strong>Payment summary</strong>
            <div className="dispute-detail-grid" style={{ marginTop: 12 }}>
              <div><span>Escrow amount</span><strong>{formatCurrency(releaseDisbursement.escrowAmount, contract.currency)}</strong></div>
              <div><span>Amount to be released</span><strong>{formatCurrency(releaseDisbursement.grossAmount, contract.currency)}</strong></div>
              <div><span>Estimated net to hustler</span><strong>{formatCurrency(releaseDisbursement.netAmount, contract.currency)}</strong></div>
              <div><span>Recipient</span><strong>{formatName(releaseDisbursement.recipient)}</strong></div>
            </div>
            {releaseRecipients.length > 1 && (
              <label className="form-label" style={{ marginTop: 12 }}>
                <span className="label-text">Select recipient</span>
                <select value={selectedReleaseRecipientId} onChange={(event) => setSelectedReleaseRecipientId(event.target.value)}>
                  {releaseRecipients.map((recipient) => (
                    <option key={recipient._id || recipient.id} value={recipient._id || recipient.id}>
                      {formatName(recipient)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="dispute-muted" style={{ marginTop: 10 }}>
              This releases only the share for the hustler linked to this dispute. Any remaining assigned hustlers stay active until their work or disputes are resolved.
            </p>
          </article>
        </div>
      )}

      <div className="dispute-action-stack">
        <button type="button" className="button-secondary" disabled={adminSubmitting} onClick={handleAdminConfirm}>
          {adminSubmitting ? "Saving..." : adminResolutionType === "request_evidence" ? "Send request" : adminResolutionType === "release_payment" ? "Review release" : "Confirm decision"}
        </button>
        <div className="dispute-action-stack">
          <button type="button" className="button-secondary" disabled={adminSubmitting} onClick={() => submitAdminAction("under_review")}>
            Mark under review
          </button>
          <button type="button" className="button-secondary" disabled={adminSubmitting} onClick={() => submitAdminAction("request_evidence")}>
            Request additional evidence
          </button>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <section className="page-section dispute-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isAdmin ? "Dispute resolution" : "Dispute"}</p>
          <h2>{contract?.title || "Dispute details"}</h2>
          <p>Review the case, communicate with the parties, and decide the payout outcome.</p>
        </div>
        <Link to={backLink} className="button-secondary">
          Back
        </Link>
      </header>

      {loading ? (
        <Loader label="Loading dispute..." />
      ) : error ? (
        <ErrorBanner error={error} />
      ) : dispute ? (
        <>
        <div className="dispute-layout">
          <section className="dispute-section">
            <h3>Contract information</h3>
            <div className="dispute-detail-grid">
              <div><span>Amount</span><strong>{formatCurrency(contract.amount, contract.currency)}</strong></div>
              <div><span>Status</span><strong>{String(contract.status || "unknown").replace(/_/g, " ")}</strong></div>
              <div><span>Escrow</span><strong>{String(contract.escrowStatus || "unknown").replace(/_/g, " ")}</strong></div>
              <div><span>Location</span><strong>{contract.workLocation || "Not specified"}</strong></div>
              <div><span>Manager</span><strong>{formatName(contract.buyer)}</strong></div>
              <div><span>Assigned hustlers</span><strong>{assignedHustlersLabel}</strong></div>
            </div>
          </section>

          <section className="dispute-section">
            <h3>Dispute information</h3>
            <div className="dispute-detail-grid">
              <div><span>Status</span><strong>{String(effectiveDisputeStatus || dispute.status || "").replace(/_/g, " ")}</strong></div>
              <div><span>Reason</span><strong>{dispute.reason || "-"}</strong></div>
              <div><span>Raised by</span><strong>{formatName(dispute.raisedBy)}</strong></div>
              <div><span>Opened</span><strong>{formatDate(dispute.createdAt)}</strong></div>
              <div><span>Resolution type</span><strong>{String(dispute.resolutionType || "-").replace(/_/g, " ")}</strong></div>
              <div><span>Resolved by</span><strong>{formatName(dispute.resolvedBy)}</strong></div>
              <div><span>Resolved at</span><strong>{formatDate(dispute.resolvedAt)}</strong></div>
            </div>
            {getDisputeOutcomeLabel(dispute) && <p className="dispute-paragraph"><strong>Outcome:</strong> {getDisputeOutcomeLabel(dispute)}.</p>}
            {dispute.details && <p className="dispute-paragraph">{dispute.details}</p>}
            {dispute.requestedResolution && <p className="dispute-paragraph"><strong>Requested resolution:</strong> {dispute.requestedResolution}</p>}
            {dispute.adminNotes && <p className="dispute-paragraph"><strong>Admin notes:</strong> {dispute.adminNotes}</p>}
            {dispute.resolution && <p className="dispute-paragraph"><strong>Resolution:</strong> {dispute.resolution}</p>}
            {evidenceRequests.length > 0 && (
              <div className="dispute-request-list">
                {evidenceRequests.map((request) => (
                  <article key={request.requestId || request._id || `${request.createdAt || "request"}`} className="dispute-request-item">
                    <strong>Evidence request</strong>
                    <p>{request.message || "No request message provided."}</p>
                    <div className="dispute-detail-grid">
                      <div><span>Recipients</span><strong>{formatList(request.recipientRoles)}</strong></div>
                      <div><span>Required</span><strong>{formatList(request.requiredEvidenceTypes)}</strong></div>
                      <div><span>Deadline</span><strong>{formatDate(request.responseDeadline)}</strong></div>
                      <div><span>Status</span><strong>{String(request.status || "pending").replace(/_/g, " ")}</strong></div>
                    </div>
                    {Array.isArray(request.responses) && request.responses.length > 0 && (
                      <div className="dispute-response-list">
                        {request.responses.map((response, index) => (
                          <div key={`${request.requestId || request._id || "request"}-${index}`} className="dispute-response-item">
                            <strong>{formatName(response.respondedBy)}</strong>
                            <p>{response.message || "Requested evidence uploaded."}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="dispute-section">
            <h3>Evidence</h3>
            {evidence.length ? (
              <div className="dispute-evidence-list">
                {evidence.map((item, index) => (
                  <a key={`${item.name || item.url || index}`} className="dispute-evidence-item" href={item.dataUrl || item.url} download={item.name || `evidence-${index + 1}`}>
                    <strong>{item.name || `Evidence ${index + 1}`}</strong>
                    <span>{item.notes || item.type || "Attachment"}</span>
                    <small>{formatFileSize(item.size)}</small>
                  </a>
                ))}
              </div>
            ) : (
              <p className="dispute-muted">No evidence uploaded yet.</p>
            )}

            {showGeneralEvidenceForm && (
              <form onSubmit={submitEvidence} className="dispute-evidence-form">
                <label className="form-label">
                  <span className="label-text">Evidence notes</span>
                  <textarea value={evidenceNotes} onChange={(event) => setEvidenceNotes(event.target.value)} rows={3} placeholder="Add a short note about these files." />
                </label>

                {evidenceAttachments.length > 0 && (
                  <div className="chat-attachment-preview">
                    {evidenceAttachments.map((attachment, index) => (
                      <div className="chat-attachment-chip" key={`${attachment.name}-${index}`}>
                        <span>{attachment.name}</span>
                        <small>{formatFileSize(attachment.size)}</small>
                        <button type="button" onClick={() => removeEvidenceAttachment(index)} aria-label={`Remove ${attachment.name}`}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="dispute-upload-row">
                  <button
                    type="button"
                    className="chat-attach-button"
                    onClick={() => evidenceFileInputRef.current?.click()}
                    disabled={evidenceSubmitting || evidenceAttachments.length >= MAX_ATTACHMENTS}
                    aria-label="Attach files"
                    title="Attach files"
                  >
                    <IconPaperclip className="button-icon" />
                  </button>
                  <span>Upload up to {MAX_ATTACHMENTS} supporting files.</span>
                </div>
                <input ref={evidenceFileInputRef} className="chat-file-input" type="file" multiple onChange={handleEvidenceAttachments} />
                <button type="submit" className="button-primary" disabled={evidenceSubmitting || !evidenceAttachments.length}>
                  {evidenceSubmitting ? "Uploading..." : "Submit evidence"}
                </button>
              </form>
            )}

            {canRespondToEvidenceRequest && latestPendingRequest && (
              <form onSubmit={submitRequestedEvidence} className="dispute-evidence-form">
                <h4>Requested evidence upload</h4>
                <p className="dispute-muted">{latestPendingRequest.message || "Submit the requested evidence and a short message."}</p>
                <div className="dispute-detail-grid">
                  <div><span>Required evidence</span><strong>{formatList(latestPendingRequest.requiredEvidenceTypes)}</strong></div>
                  <div><span>Deadline</span><strong>{formatDate(latestPendingRequest.responseDeadline)}</strong></div>
                </div>
                <label className="form-label">
                  <span className="label-text">Message</span>
                  <textarea
                    value={evidenceResponseMessage}
                    onChange={(event) => setEvidenceResponseMessage(event.target.value)}
                    rows={3}
                    placeholder="Add a short note with your evidence."
                  />
                </label>

                {evidenceResponseAttachments.length > 0 && (
                  <div className="chat-attachment-preview">
                    {evidenceResponseAttachments.map((attachment, index) => (
                      <div className="chat-attachment-chip" key={`${attachment.name}-${index}`}>
                        <span>{attachment.name}</span>
                        <small>{formatFileSize(attachment.size)}</small>
                        <button type="button" onClick={() => setEvidenceResponseAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="dispute-upload-row">
                  <button
                    type="button"
                    className="chat-attach-button"
                    onClick={() => evidenceResponseFileInputRef.current?.click()}
                    disabled={evidenceResponseSubmitting}
                    aria-label="Attach requested evidence files"
                    title="Attach requested evidence files"
                  >
                    <IconPaperclip className="button-icon" />
                  </button>
                  <span>Upload the requested files and a response note.</span>
                </div>
                <input ref={evidenceResponseFileInputRef} className="chat-file-input" type="file" multiple onChange={handleRequestedEvidenceAttachments} />
                <button type="submit" className="button-primary" disabled={evidenceResponseSubmitting || !evidenceResponseAttachments.length || !evidenceResponseMessage.trim()}>
                  {evidenceResponseSubmitting ? "Submitting..." : "Submit requested evidence"}
                </button>
              </form>
            )}
          </section>

          <section className="dispute-section">
            <h3>Timeline</h3>
            {timeline.length ? (
              <div className="dispute-timeline">
                {timeline.map((item, index) => (
                  <article key={`${item.eventType}-${index}`} className="dispute-timeline-item">
                    <strong>{item.title || item.eventType}</strong>
                    <p>{item.detail || "Event recorded"}</p>
                    <small>{formatDate(item.createdAt)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="dispute-muted">No timeline events yet.</p>
            )}
          </section>

          <section className="dispute-section">
            <h3>Discussion thread</h3>
            <div className="dispute-thread">
              {messages.length ? (
                messages.map((message) => {
                  const sender = message.senderId || {};
                  return (
                    <article key={message._id || message.id} className="dispute-message">
                      <div className="dispute-message-head">
                        <strong>{formatName(sender)}</strong>
                        <small>{formatDate(message.createdAt)}</small>
                      </div>
                      <p>{message.text}</p>
                      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div className="message-attachments">
                          {message.attachments.map((attachment, index) => (
                            <a key={`${attachment.name}-${index}`} className="message-attachment" href={attachment.dataUrl} download={attachment.name}>
                              <span>{attachment.name}</span>
                              <small>{formatFileSize(attachment.size)}</small>
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="dispute-muted">No messages yet.</p>
              )}
            </div>

            <form onSubmit={handleThreadSend} className="dispute-thread-form">
              <textarea
                value={threadMessage}
                onChange={(event) => setThreadMessage(event.target.value)}
                rows={4}
                placeholder="Write an update for the manager, hustler, or admin team..."
              />
              <div className="dispute-actions">
                <button type="submit" className="button-primary" disabled={sending || !threadMessage.trim()}>
                  {sending ? "Sending..." : "Send message"}
                </button>
              </div>
            </form>
          </section>

          {adminControls}
        </div>
        {showReleaseConfirmModal && (
          <div className="modal-overlay" onClick={() => setShowReleaseConfirmModal(false)}>
            <div className="modal-content large" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">Confirm payment release</h2>
                  <p className="modal-subtitle">Review the summary before releasing funds.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setShowReleaseConfirmModal(false)}>
                  ×
                </button>
              </div>
              <div className="submission-modal-body">
                <p className="dispute-muted">
                  This will release escrow funds, mark the payment as paid, resolve the dispute, and notify both the manager and the hustler.
                </p>
                <div className="submission-modal-grid">
                  <div className="submission-modal-field">
                    <span>Escrow amount</span>
                    <strong>{formatCurrency(releaseDisbursement.escrowAmount, contract.currency)}</strong>
                  </div>
                  <div className="submission-modal-field">
                    <span>Amount to be released</span>
                    <strong>{formatCurrency(releaseDisbursement.grossAmount, contract.currency)}</strong>
                  </div>
                  <div className="submission-modal-field">
                    <span>Estimated net to hustler</span>
                    <strong>{formatCurrency(releaseDisbursement.netAmount, contract.currency)}</strong>
                  </div>
                  <div className="submission-modal-field">
                    <span>Recipient</span>
                    <strong>{formatName(releaseDisbursement.recipient)}</strong>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="button-secondary" onClick={() => setShowReleaseConfirmModal(false)} disabled={adminSubmitting}>
                    Cancel
                  </button>
                  <button type="button" className="button-primary" onClick={() => submitAdminAction("release_payment")} disabled={adminSubmitting}>
                    {adminSubmitting ? "Releasing..." : "Release payment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      ) : (
        <ErrorBanner error="Dispute not found." />
      )}
    </section>
  );
}





