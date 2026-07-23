import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconPaperclip } from "../../components/Icons.jsx";
import { supportService } from "../../services/supportService.js";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const appealCategories = [
  "Account suspension",
  "Login issue",
  "Verification review",
  "Payment review",
  "Other",
];

export default function PublicSupportPage() {
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => String(searchParams.get("email") || "").trim(), [searchParams]);
  const initialName = useMemo(() => String(searchParams.get("name") || "").trim(), [searchParams]);
  const initialReason = useMemo(() => String(searchParams.get("reason") || "").trim(), [searchParams]);
  const initialMessage = useMemo(
    () => (initialReason ? `Suspension reason shown to me:\n${initialReason}\n\nPlease review my account appeal:` : ""),
    [initialReason]
  );
  const fileInputRef = useRef(null);
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState(initialName);
  const [category, setCategory] = useState("Account suspension");
  const [accountReference, setAccountReference] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

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
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await supportService.createTicket({
        email,
        fullName,
        category,
        accountReference,
        phone,
        subject: `${category} appeal`,
        message,
        attachments,
      });
      setSuccess("Your appeal has been sent to the admin team. They will review it shortly.");
      setMessage("");
      setAccountReference("");
      setPhone("");
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err?.message || "Failed to send appeal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="card" style={{ maxWidth: "760px", margin: "0 auto" }}>
        <p className="auth-kicker">Appeal review</p>
        <h2>Contact support</h2>
        <p>Use this form to submit an account appeal. An admin will review the details and respond in the ticket thread.</p>

        {initialReason && (
          <div style={{ marginTop: "16px", padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: "14px", background: "#fafafa" }}>
            <strong style={{ display: "block", marginBottom: "6px" }}>Suspension reason</strong>
            <p style={{ margin: 0, color: "#4b5563" }}>{initialReason}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-stack" style={{ marginTop: "18px" }}>
          <div style={{ display: "grid", gap: "14px" }}>
            <label className="form-label">
              <span className="label-text">Full name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder="Your full name" />
            </label>

            <label className="form-label">
              <span className="label-text">Email address</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" />
            </label>

            <label className="form-label">
              <span className="label-text">Appeal type</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {appealCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              <span className="label-text">Account reference</span>
              <input value={accountReference} onChange={(e) => setAccountReference(e.target.value)} type="text" placeholder="Optional order, ticket, or contract reference" />
            </label>

            <label className="form-label">
              <span className="label-text">Phone number</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Optional phone number" />
            </label>

            <label className="form-label">
              <span className="label-text">Appeal statement</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                required
                placeholder="Explain what happened, why you believe the suspension should be reviewed, and any details that may help the admin team."
              />
            </label>

            {attachments.length > 0 && (
              <div className="chat-attachment-preview" style={{ marginTop: "2px" }}>
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

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
              <span style={{ color: "#6b7280", fontSize: "0.92rem" }}>Attach screenshots or supporting documents.</span>
            </div>
            <input
              ref={fileInputRef}
              className="chat-file-input"
              type="file"
              multiple
              onChange={handleAttachmentChange}
            />
          </div>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="success-banner">{success}</div>}

          <button type="submit" className="button-primary auth-submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send appeal"}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: "18px" }}>
          <Link to="/auth/login">Back to sign in</Link>
        </div>
      </div>
    </section>
  );
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
