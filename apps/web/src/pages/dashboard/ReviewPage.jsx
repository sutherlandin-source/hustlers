import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { reviewsService } from "../../services/reviewsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingLabel(n) {
  if (n >= 4.5) return "Excellent";
  if (n >= 4.0) return "Great";
  if (n >= 3.0) return "Good";
  if (n >= 2.0) return "Fair";
  return "Poor";
}

function avg(reviews, key) {
  if (!reviews?.length) return 0;
  return (reviews.reduce((acc, r) => acc + Number(r?.[key] || 0), 0) / reviews.length).toFixed(1);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function displayName(user) {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || String(user);
}

// ─── Star rating control ──────────────────────────────────────────────────────

function StarInput({ value, onChange, readOnly = false, size = "md" }) {
  const [hovered, setHovered] = useState(0);
  const fill = hovered || value;
  const px = size === "sm" ? "1.1rem" : size === "lg" ? "2rem" : "1.5rem";

  return (
    <span className="star-input" style={{ display: "inline-flex", gap: 2 }} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          role={readOnly ? "img" : "button"}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          tabIndex={readOnly ? -1 : 0}
          style={{
            fontSize: px,
            cursor: readOnly ? "default" : "pointer",
            color: fill >= star ? "#F59E0B" : "#CBD5E1",
            transition: "color 0.1s",
            lineHeight: 1,
          }}
          onClick={() => !readOnly && onChange?.(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          onKeyDown={(e) => { if (!readOnly && (e.key === "Enter" || e.key === " ")) onChange?.(star); }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ review }) {
  const reviewer = review?.reviewer;
  const name = displayName(reviewer);
  const overall = Number(review?.rating || 0);
  const initial = String(name?.[0] || "?").toUpperCase();

  return (
    <article className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#EFF6FF", color: "#2563EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "1rem", flexShrink: 0,
          }}>
            {initial}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{formatDate(review?.createdAt)}</div>
          </div>
        </div>
        <span style={{
          background: "#FFF7ED", borderRadius: 8, padding: "3px 10px",
          fontWeight: 800, fontSize: "0.85rem", color: "#D97706",
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
        }}>
          ★ {overall.toFixed(1)}
        </span>
      </div>

      <StarInput value={overall} readOnly size="sm" />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: "0.82rem", color: "var(--muted)" }}>
        {[["Communication", review?.communication], ["Professionalism", review?.professionalism], ["Quality", review?.quality], ["Timeliness", review?.timeliness]].map(
          ([label, score]) => score != null ? (
            <span key={label}>{label}: <strong style={{ color: "#0F172A" }}>{Number(score).toFixed(1)}</strong></span>
          ) : null
        )}
      </div>

      {review?.reviewText ? (
        <blockquote style={{ margin: 0, padding: "8px 12px", background: "#F8FAFC", borderLeft: "3px solid #E2E8F0", borderRadius: "0 8px 8px 0", fontStyle: "italic", fontSize: "0.9rem", lineHeight: 1.6 }}>
          "{review.reviewText}"
        </blockquote>
      ) : null}

      {(review?.contract?.title || review?.contract) ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span>📋</span>
          <span>{review?.contract?.title || review?.contract?.contractId || "Contract"}</span>
        </div>
      ) : null}
    </article>
  );
}

// ─── Submit form ──────────────────────────────────────────────────────────────

function SubmitForm({ contractId, revieweeId, onSuccess, onCancel }) {
  const [form, setForm] = useState({ rating: 0, communication: 0, professionalism: 0, quality: 0, timeliness: 0, reviewText: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));
  const isValid = form.rating > 0 && form.communication > 0 && form.professionalism > 0 && form.quality > 0 && form.timeliness > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) { setError("Please fill in all star ratings."); return; }
    setSubmitting(true);
    setError("");
    try {
      await reviewsService.create({ contractId, revieweeId, ...form });
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: 0 }}>Leave a Review</h3>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>Rate your experience on this contract.</p>
      </div>

      {[["Overall Rating", "rating"], ["Communication", "communication"], ["Professionalism", "professionalism"], ["Quality of Work", "quality"], ["Timeliness", "timeliness"]].map(([label, key]) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontWeight: 700, fontSize: "0.9rem" }}>{label} <span style={{ color: "var(--danger)" }}>*</span></label>
          <StarInput value={form[key]} onChange={set(key)} size="lg" />
        </div>
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontWeight: 700, fontSize: "0.9rem" }}>Comments <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
        <textarea
          value={form.reviewText}
          onChange={(e) => set("reviewText")(e.target.value)}
          placeholder="Share your experience…"
          maxLength={2000}
          rows={4}
          style={{ resize: "vertical" }}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "right" }}>{form.reviewText.length}/2000</span>
      </div>

      {error && <ErrorBanner error={error} />}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="button-primary" disabled={!isValid || submitting}>
          {submitting ? <Loader label="Submitting…" /> : "Submit Review"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * ReviewPage
 *
 * URL patterns:
 *   /dashboard/reviews/:userId          — view reviews for a user
 *   /manager/reviews/:userId            — same, manager context
 *   ?contractId=xxx&canReview=1         — add review submit form
 */
export default function ReviewPage() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const contractId = searchParams.get("contractId") || null;
  const canReview  = searchParams.get("canReview") === "1";
  const revieweeId = userId;

  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [showForm, setShowForm]     = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const result = await reviewsService.listByUser(userId);
      setData(result);

      if (contractId) {
        const myId = currentUser?._id || currentUser?.id;
        const existing = (result?.reviews || []).find(
          (r) =>
            String(r?.reviewer?._id || r?.reviewer?.id || r?.reviewer || "") === String(myId || "") &&
            String(r?.contract?._id || r?.contract?.id || r?.contract || "") === String(contractId || "")
        );
        setAlreadyReviewed(Boolean(existing));
      }
    } catch (err) {
      setError(err?.message || "Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const handleSuccess = () => {
    setShowForm(false);
    setAlreadyReviewed(true);
    setSuccessMsg("Review submitted successfully!");
    load();
  };

  const reviews      = data?.reviews || [];
  const total        = data?.total || 0;
  const distribution = data?.distribution || {};
  const overallAvg   = reviews.length ? avg(reviews, "rating") : null;
  const showEntry    = canReview && contractId && revieweeId && !alreadyReviewed;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Reviews</h2>
          <p>Ratings and feedback left after completed contracts.</p>
        </div>
        <button className="button-secondary" onClick={() => navigate(-1)}>← Back</button>
      </header>

      {/* Submit form */}
      {showForm && showEntry ? (
        <SubmitForm
          contractId={contractId}
          revieweeId={revieweeId}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {/* Leave review CTA */}
      {showEntry && !showForm ? (
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <strong>Leave a review for this contract</strong>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>Share feedback to help build trust on the platform.</p>
          </div>
          <button className="button-primary" onClick={() => setShowForm(true)}>Leave a Review</button>
        </div>
      ) : null}

      {alreadyReviewed ? (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 14px", color: "#166534", fontWeight: 600, fontSize: "0.9rem" }}>
          ✓ You have already reviewed this contract.
        </div>
      ) : null}

      {successMsg ? (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 14px", color: "#166534", fontWeight: 600, fontSize: "0.9rem" }}>
          ✓ {successMsg}
        </div>
      ) : null}

      {loading && <Loader label="Loading reviews…" />}
      {!loading && error && <ErrorBanner error={error} />}

      {!loading && !error && (
        <>
          {total > 0 ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Score summary */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: "3.5rem", fontWeight: 900, lineHeight: 1, color: "#0F172A" }}>{overallAvg}</span>
                  <span style={{ fontWeight: 700, color: "var(--muted)" }}>{ratingLabel(overallAvg)}</span>
                  <StarInput value={Math.round(Number(overallAvg))} readOnly />
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{total} review{total !== 1 ? "s" : ""}</span>
                </div>

                {/* Distribution bars */}
                <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 5 }}>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = Number(distribution?.[star] || 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ width: 8, textAlign: "right", color: "var(--muted)", fontWeight: 700 }}>{star}</span>
                        <span style={{ color: "#F59E0B" }}>★</span>
                        <div style={{ flex: 1, height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#F59E0B", borderRadius: 4 }} />
                        </div>
                        <span style={{ color: "var(--muted)", width: 20 }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sub-score averages */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, borderTop: "1px solid #E2E8F0", paddingTop: 14 }}>
                {[["Communication", "communication"], ["Professionalism", "professionalism"], ["Quality", "quality"], ["Timeliness", "timeliness"]].map(
                  ([label, key]) => (
                    <div key={key} style={{ background: "#F8FAFC", borderRadius: 10, padding: "8px 14px", minWidth: 100 }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0F172A" }}>{avg(reviews, key)}</div>
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>⭐</div>
              <h3>No reviews yet</h3>
              <p style={{ color: "var(--muted)" }}>
                {canReview ? "Be the first to leave a review for this contract." : "Reviews will appear here after completed contracts."}
              </p>
            </div>
          )}

          {reviews.length > 0 && (
            <div className="card-list">
              {reviews.map((review) => (
                <ReviewCard key={review._id || review.id || review.createdAt} review={review} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
