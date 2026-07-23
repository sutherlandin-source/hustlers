import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { IconPaperclip } from "../../components/Icons.jsx";
import { contractsService } from "../../services/contractsService.js";
import { disputesService } from "../../services/disputesService.js";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) || 0);
}

function formatFileSize(size = 0) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function DisputeFormPage() {
  const { contractId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const currentBasePath = location.pathname.startsWith("/manager") ? "/manager" : "/dashboard";
  const fileInputRef = useRef(null);
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [requestedResolution, setRequestedResolution] = useState("");
  const [attachments, setAttachments] = useState([]);

  const canSubmit = useMemo(() => Boolean(reason.trim() && description.trim() && contractId), [reason, description, contractId]);

  useEffect(() => {
    let mounted = true;

    const loadContract = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await contractsService.get(contractId);
        if (!mounted) return;
        setContract(data);
        try {
          const existing = await disputesService.getForContract(contractId);
          if (!mounted) return;
          if (existing?.dispute?._id || existing?.dispute?.id) {
            navigate(`${currentBasePath}/disputes/${existing.dispute._id || existing.dispute.id}`, { replace: true });
            return;
          }
        } catch {
          // ignore lookup failures and allow creation
        }
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load contract.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (contractId) {
      loadContract();
    }

    return () => {
      mounted = false;
    };
  }, [contractId, currentBasePath, navigate]);

  const handleAttachmentChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      event.target.value = "";
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.map(fileToAttachment));
      setAttachments((current) => [...current, ...nextAttachments]);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to attach file.");
    } finally {
      event.target.value = "";
    }
  };

  const removeAttachment = (index) => {
    setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      const dispute = await disputesService.create({
        contractId,
        reason,
        details: description,
        requestedResolution,
        attachments,
      });
      const disputeId = dispute?._id || dispute?.id;
      navigate(`${currentBasePath}/disputes/${disputeId}`);
    } catch (err) {
      setError(err?.message || "Failed to open dispute.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page-section dispute-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dispute resolution</p>
          <h2>Open dispute</h2>
          <p>Use this form to escalate active or submitted work for review.</p>
        </div>
        <Link to={`${currentBasePath}/contracts/${contractId}`} className="button-secondary">
          Back to contract
        </Link>
      </header>

      {loading ? (
        <Loader label="Loading contract..." />
      ) : error ? (
        <ErrorBanner error={error} />
      ) : (
        <form onSubmit={handleSubmit} className="dispute-layout">
          <section className="dispute-section">
            <h3>Contract Information</h3>
            <div className="dispute-detail-grid">
              <div><span>Title</span><strong>{contract?.title || "Untitled contract"}</strong></div>
              <div><span>Budget</span><strong>{formatCurrency(contract?.amount, contract?.currency)}</strong></div>
              <div><span>Status</span><strong>{String(contract?.status || "unknown").replace(/_/g, " ")}</strong></div>
              <div><span>Location</span><strong>{contract?.workLocation || "Not specified"}</strong></div>
            </div>
          </section>

          <section className="dispute-section">
            <h3>Dispute</h3>
            <label className="form-label">
              <span className="label-text">Dispute reason</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} type="text" placeholder="Short summary of the issue" required />
            </label>
            <label className="form-label">
              <span className="label-text">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                required
                placeholder="Explain what happened, the impact, and any timeline details the admin should know."
              />
            </label>
            <label className="form-label">
              <span className="label-text">Requested resolution</span>
              <textarea
                value={requestedResolution}
                onChange={(event) => setRequestedResolution(event.target.value)}
                rows={3}
                placeholder="What outcome are you asking the admin team to consider?"
              />
            </label>
          </section>

          <section className="dispute-section">
            <div className="dispute-section-head">
              <h3>Evidence</h3>
              <p>Upload screenshots, receipts, documents, or other proof.</p>
            </div>
            {attachments.length > 0 && (
              <div className="chat-attachment-preview">
                {attachments.map((attachment, index) => (
                  <div className="chat-attachment-chip" key={`${attachment.name}-${index}`}>
                    <span>{attachment.name}</span>
                    <small>{formatFileSize(attachment.size)}</small>
                    <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove ${attachment.name}`}>
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
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach files"
                title="Attach files"
              >
                <IconPaperclip className="button-icon" />
              </button>
              <span>Attach up to {MAX_ATTACHMENTS} files.</span>
            </div>
            <input ref={fileInputRef} className="chat-file-input" type="file" multiple onChange={handleAttachmentChange} />
          </section>

          <div className="dispute-actions">
            <button type="submit" className="button-primary" disabled={submitting || !canSubmit}>
              {submitting ? "Submitting..." : "Open dispute"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
