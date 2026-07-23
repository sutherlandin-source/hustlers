import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { userService } from "../../services/userService.js";
import { reviewsService } from "../../services/reviewsService.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

const REVIEWS_PAGE_SIZE = 5;

function initials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";
}

function reviewerName(reviewer) {
  return `${reviewer?.firstName || ""} ${reviewer?.lastName || ""}`.trim() || reviewer?.email || "Reviewer";
}

function formatReviewDate(value) {
  return value ? new Date(value).toLocaleDateString() : "Not dated";
}

function formatRating(value) {
  return Number(value || 0).toFixed(1);
}

function starText(value) {
  const rounded = Math.round(Number(value || 0));
  return "\u2605".repeat(rounded) + "\u2606".repeat(Math.max(0, 5 - rounded));
}

export default function AdminUserProfilePage() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewsSkip, setReviewsSkip] = useState(0);

  // Admin action state
  const [actionLoading, setActionLoading] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("7");
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      setLoading(true);
      setError("");
      try {
        const users = await userService.listUsers({ limit: 100 });
        if (!mounted) return;
        const matchedUser = Array.isArray(users) ? users.find((entry) => String(entry._id || entry.id) === String(userId)) : null;
        setUser(matchedUser || null);
        if (!matchedUser) setError("User profile not found.");
      } catch (loadError) {
        if (mounted) setError(loadError?.message || "Failed to load user profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadUser();
    return () => { mounted = false; };
  }, [userId]);

  useEffect(() => {
    const targetUserId = user?._id || user?.id;
    if (!targetUserId) return;
    let mounted = true;
    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError("");
      try {
        const data = await reviewsService.listByUser(targetUserId, { limit: REVIEWS_PAGE_SIZE, skip: reviewsSkip });
        if (!mounted) return;
        setReviews(data.reviews || []);
        setReviewsTotal(data.total || 0);
      } catch (loadError) {
        if (mounted) setReviewsError(loadError?.message || "Failed to load reviews.");
      } finally {
        if (mounted) setReviewsLoading(false);
      }
    };
    loadReviews();
    return () => { mounted = false; };
  }, [user?._id, user?.id, reviewsSkip]);

  const runAction = async (label, fn) => {
    setActionLoading(label);
    setActionError("");
    setActionSuccess("");
    try {
      const result = await fn();
      // Refresh user object if action returns updated user
      if (result?.user || result?._id) setUser(result?.user || result);
      setActionSuccess(`${label} completed.`);
    } catch (err) {
      setActionError(err?.message || `${label} failed.`);
    } finally {
      setActionLoading("");
    }
  };

  const averageRating = Number(user?.averageRating || 0);
  const totalReviews = Number(user?.totalReviews || reviewsTotal || 0);
  const hasPreviousReviews = reviewsSkip > 0;
  const hasNextReviews = reviewsSkip + REVIEWS_PAGE_SIZE < reviewsTotal;
  const hasIdentityDetails = Boolean(user?.idNumber && user?.mpesaNumber);
  const skills = useMemo(() => (Array.isArray(user?.skills) ? user.skills.join(", ") : user?.skills || "-"), [user]);
  const verificationStatus = String(user?.verificationStatus || "").toLowerCase();
  const accountStatus = String(user?.accountStatus || user?.status || "").toLowerCase();
  const isSuspended = accountStatus === "suspended";
  const isActive = accountStatus === "active" || !accountStatus;

  return (
    <section className="page-section profile-page">
      <header className="page-header">
        <div>
          <h2>User Profile</h2>
          <p>Manage this account — verify identity, suspend, or reset verification status.</p>
        </div>
        <Link to="/admin/users" className="button-secondary">
          Back to users
        </Link>
      </header>

      {loading && <Loader label="Loading profile..." />}
      {error && <ErrorBanner error={error} />}

      {!loading && !error && user && (
        <div className="profile-editor">
          <aside className="profile-preview-card">
            <div className="profile-avatar-shell">
              <div className="profile-avatar-preview">
                {user.avatar ? <img src={user.avatar} alt="Profile" /> : <span>{initials(user)}</span>}
              </div>
              <span className="profile-avatar-status">{user.avatar ? "Profile photo set" : "Initials avatar"}</span>
            </div>
            <h3>{user.firstName} {user.lastName}</h3>
            <p>{String(user.role || "user").toUpperCase()}</p>
            <small>Member since {user.createdAt ? new Date(user.createdAt).getFullYear() : "not available"}</small>

            <div className="profile-rating-summary">
              <div className="profile-rating-score">
                <span className="profile-stars">{starText(averageRating)}</span>
                <strong>{formatRating(averageRating)}</strong>
              </div>
              <span>{totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}</span>
            </div>

            <div className="security-notice">
              <span className="notice-icon">{hasIdentityDetails ? "Verified" : "KYC"}</span>
              <p>{hasIdentityDetails ? "Identity details are on file." : "Identity details are incomplete."}</p>
            </div>

            {/* ── Admin actions ── */}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted, #64748B)" }}>
                Admin actions
              </p>

              {actionError && <ErrorBanner error={actionError} />}
              {actionSuccess && <div className="success-message">{actionSuccess}</div>}

              {/* Verify KYC */}
              {verificationStatus !== "approved" && (
                <button
                  className="button-primary"
                  disabled={!!actionLoading}
                  onClick={() => runAction("Approve KYC", () => userService.verifyUser(userId))}
                >
                  {actionLoading === "Approve KYC" ? "Approving…" : "Approve KYC"}
                </button>
              )}

              {/* Reject verification — show form */}
              {!showRejectForm ? (
                <button
                  className="button-secondary"
                  disabled={!!actionLoading}
                  onClick={() => setShowRejectForm(true)}
                >
                  Reject Verification
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    rows={2}
                    placeholder="Rejection reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border, #E2E8F0)" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="button-primary"
                      disabled={!!actionLoading || !rejectReason.trim()}
                      onClick={() => {
                        runAction("Reject Verification", () => userService.rejectVerification(userId, { reason: rejectReason }));
                        setShowRejectForm(false);
                        setRejectReason("");
                      }}
                    >
                      {actionLoading === "Reject Verification" ? "Rejecting…" : "Confirm Reject"}
                    </button>
                    <button className="button-secondary" onClick={() => setShowRejectForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Reset verification */}
              <button
                className="button-secondary"
                disabled={!!actionLoading}
                onClick={() => {
                  if (window.confirm("Reset this user's verification status to pending? They will need to re-submit KYC.")) {
                    runAction("Reset Verification", () => userService.resetVerification(userId));
                  }
                }}
              >
                {actionLoading === "Reset Verification" ? "Resetting…" : "Reset Verification"}
              </button>

              {/* Suspend / Unsuspend */}
              {isSuspended ? (
                <button
                  className="button-secondary"
                  disabled={!!actionLoading}
                  onClick={() => runAction("Unsuspend", () => userService.suspendUser(userId, { action: "unsuspend" }))}
                >
                  {actionLoading === "Unsuspend" ? "Unsuspending…" : "Unsuspend Account"}
                </button>
              ) : !showSuspendForm ? (
                <button
                  className="button-secondary"
                  disabled={!!actionLoading}
                  onClick={() => setShowSuspendForm(true)}
                >
                  Suspend Account
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    rows={2}
                    placeholder="Reason for suspension"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border, #E2E8F0)" }}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Days (e.g. 7)"
                    value={suspendDays}
                    onChange={(e) => setSuspendDays(e.target.value)}
                    style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border, #E2E8F0)" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="button-primary"
                      disabled={!!actionLoading || !suspendReason.trim()}
                      onClick={() => {
                        runAction("Suspend", () => userService.suspendUser(userId, { reason: suspendReason, days: Number(suspendDays) || 7 }));
                        setShowSuspendForm(false);
                        setSuspendReason("");
                      }}
                    >
                      {actionLoading === "Suspend" ? "Suspending…" : "Confirm Suspend"}
                    </button>
                    <button className="button-secondary" onClick={() => setShowSuspendForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Deactivate */}
              {isActive && (
                <button
                  className="button-secondary"
                  disabled={!!actionLoading}
                  style={{ color: "var(--danger, #DC2626)" }}
                  onClick={() => {
                    if (window.confirm("Permanently deactivate this account?")) {
                      runAction("Deactivate", () => userService.deactivateUser(userId));
                    }
                  }}
                >
                  {actionLoading === "Deactivate" ? "Deactivating…" : "Deactivate Account"}
                </button>
              )}
            </div>
          </aside>

          <div className="profile-form-card">
            <div className="profile-header-card">
              <div>
                <strong>{user.firstName || "Unknown user"} {user.lastName || ""}</strong>
                <p>{user.location || "No location provided"}</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <div className="detail-row"><span>Email</span><strong>{user.email || "-"}</strong></div>
              <div className="detail-row"><span>Phone number</span><strong>{user.phoneNumber || "-"}</strong></div>
              <div className="detail-row"><span>Verification status</span><strong>{user.verificationStatus || "-"}</strong></div>
              <div className="detail-row"><span>Account status</span><strong>{user.accountStatus || user.status || "-"}</strong></div>
              <div className="detail-row"><span>National ID / Passport</span><strong>{user.idNumber || "-"}</strong></div>
              <div className="detail-row"><span>M-Pesa number</span><strong>{user.mpesaNumber || "-"}</strong></div>
              <div className="detail-row"><span>Company name</span><strong>{user.companyName || "-"}</strong></div>
              <div className="detail-row"><span>Industry</span><strong>{user.industry || "-"}</strong></div>
              <div className="detail-row"><span>Experience level</span><strong>{user.experienceLevel || "-"}</strong></div>
              <div className="detail-row profile-bio-field"><span>Skills</span><strong>{skills}</strong></div>
              <div className="detail-row profile-bio-field"><span>Bio</span><strong>{user.bio || "-"}</strong></div>
            </div>

            <section className="profile-reviews-section">
              <div className="profile-reviews-header">
                <div>
                  <h3>Recent reviews</h3>
                  <p>{reviewsTotal} {reviewsTotal === 1 ? "review" : "reviews"} received</p>
                </div>
                <div className="profile-review-pager">
                  <button type="button" className="button-secondary" disabled={!hasPreviousReviews || reviewsLoading} onClick={() => setReviewsSkip((skip) => Math.max(0, skip - REVIEWS_PAGE_SIZE))}>
                    Previous
                  </button>
                  <button type="button" className="button-secondary" disabled={!hasNextReviews || reviewsLoading} onClick={() => setReviewsSkip((skip) => skip + REVIEWS_PAGE_SIZE)}>
                    Next
                  </button>
                </div>
              </div>

              {reviewsLoading && <Loader label="Loading reviews..." />}
              {reviewsError && <ErrorBanner error={reviewsError} />}
              {!reviewsLoading && !reviewsError && reviews.length === 0 && <div className="empty-state">No reviews yet.</div>}
              {!reviewsLoading && !reviewsError && reviews.length > 0 && (
                <div className="profile-review-list">
                  {reviews.map((review) => (
                    <article key={review._id || review.id} className="profile-review-card">
                      <div className="profile-review-meta">
                        <strong>{reviewerName(review.reviewer)}</strong>
                        <span>{starText(review.rating)} {formatRating(review.rating)}</span>
                      </div>
                      {review.reviewText && <p>{review.reviewText}</p>}
                      <small>{formatReviewDate(review.createdAt)}</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

const REVIEWS_PAGE_SIZE = 5;

function initials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";
}

function reviewerName(reviewer) {
  return `${reviewer?.firstName || ""} ${reviewer?.lastName || ""}`.trim() || reviewer?.email || "Reviewer";
}

function formatReviewDate(value) {
  return value ? new Date(value).toLocaleDateString() : "Not dated";
}

function formatRating(value) {
  return Number(value || 0).toFixed(1);
}

function starText(value) {
  const rounded = Math.round(Number(value || 0));
  return "\u2605".repeat(rounded) + "\u2606".repeat(Math.max(0, 5 - rounded));
}

export default function AdminUserProfilePage() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewsSkip, setReviewsSkip] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      setLoading(true);
      setError("");
      try {
        const users = await userService.listUsers({ limit: 100 });
        if (!mounted) return;
        const matchedUser = Array.isArray(users) ? users.find((entry) => String(entry._id || entry.id) === String(userId)) : null;
        setUser(matchedUser || null);
        if (!matchedUser) {
          setError("User profile not found.");
        }
      } catch (loadError) {
        if (mounted) setError(loadError?.message || "Failed to load user profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUser();

    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    const targetUserId = user?._id || user?.id;
    if (!targetUserId) return;

    let mounted = true;
    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError("");
      try {
        const data = await reviewsService.listByUser(targetUserId, {
          limit: REVIEWS_PAGE_SIZE,
          skip: reviewsSkip,
        });
        if (!mounted) return;
        setReviews(data.reviews || []);
        setReviewsTotal(data.total || 0);
      } catch (loadError) {
        if (mounted) setReviewsError(loadError?.message || "Failed to load reviews.");
      } finally {
        if (mounted) setReviewsLoading(false);
      }
    };

    loadReviews();
    return () => {
      mounted = false;
    };
  }, [user?._id, user?.id, reviewsSkip]);

  const averageRating = Number(user?.averageRating || 0);
  const totalReviews = Number(user?.totalReviews || reviewsTotal || 0);
  const hasPreviousReviews = reviewsSkip > 0;
  const hasNextReviews = reviewsSkip + REVIEWS_PAGE_SIZE < reviewsTotal;
  const hasIdentityDetails = Boolean(user?.idNumber && user?.mpesaNumber);
  const skills = useMemo(() => (Array.isArray(user?.skills) ? user.skills.join(", ") : user?.skills || "-"), [user]);

  return (
    <section className="page-section profile-page">
      <header className="page-header">
        <div>
          <h2>User Profile</h2>
          <p>Read-only view for marketplace accounts.</p>
        </div>
        <Link to="/admin/users" className="button-secondary">
          Back to users
        </Link>
      </header>

      {loading && <Loader label="Loading profile..." />}
      {error && <ErrorBanner error={error} />}

      {!loading && !error && user && (
        <div className="profile-editor">
          <aside className="profile-preview-card">
            <div className="profile-avatar-shell">
              <div className="profile-avatar-preview">
                {user.avatar ? <img src={user.avatar} alt="Profile" /> : <span>{initials(user)}</span>}
              </div>
              <span className="profile-avatar-status">{user.avatar ? "Profile photo set" : "Initials avatar"}</span>
            </div>
            <h3>{user.firstName} {user.lastName}</h3>
            <p>{String(user.role || "user").toUpperCase()}</p>
            <small>Member since {user.createdAt ? new Date(user.createdAt).getFullYear() : "not available"}</small>

            <div className="profile-rating-summary">
              <div className="profile-rating-score">
                <span className="profile-stars">{starText(averageRating)}</span>
                <strong>{formatRating(averageRating)}</strong>
              </div>
              <span>{totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}</span>
            </div>

            <div className="security-notice">
              <span className="notice-icon">{hasIdentityDetails ? "Verified" : "KYC"}</span>
              <p>{hasIdentityDetails ? "Identity details are on file." : "Identity details are incomplete."}</p>
            </div>
          </aside>

          <div className="profile-form-card">
            <div className="profile-header-card">
              <div>
                <strong>{user.firstName || "Unknown user"} {user.lastName || ""}</strong>
                <p>{user.location || "No location provided"}</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <div className="detail-row"><span>Email</span><strong>{user.email || "-"}</strong></div>
              <div className="detail-row"><span>Phone number</span><strong>{user.phoneNumber || "-"}</strong></div>
              <div className="detail-row"><span>National ID / Passport</span><strong>{user.idNumber || "-"}</strong></div>
              <div className="detail-row"><span>M-Pesa number</span><strong>{user.mpesaNumber || "-"}</strong></div>
              <div className="detail-row"><span>Company name</span><strong>{user.companyName || "-"}</strong></div>
              <div className="detail-row"><span>Industry</span><strong>{user.industry || "-"}</strong></div>
              <div className="detail-row"><span>Experience level</span><strong>{user.experienceLevel || "-"}</strong></div>
              <div className="detail-row profile-bio-field"><span>Skills</span><strong>{skills}</strong></div>
              <div className="detail-row profile-bio-field"><span>Bio</span><strong>{user.bio || "-"}</strong></div>
            </div>

            <section className="profile-reviews-section">
              <div className="profile-reviews-header">
                <div>
                  <h3>Recent reviews</h3>
                  <p>{reviewsTotal} {reviewsTotal === 1 ? "review" : "reviews"} received</p>
                </div>
                <div className="profile-review-pager">
                  <button type="button" className="button-secondary" disabled={!hasPreviousReviews || reviewsLoading} onClick={() => setReviewsSkip((skip) => Math.max(0, skip - REVIEWS_PAGE_SIZE))}>
                    Previous
                  </button>
                  <button type="button" className="button-secondary" disabled={!hasNextReviews || reviewsLoading} onClick={() => setReviewsSkip((skip) => skip + REVIEWS_PAGE_SIZE)}>
                    Next
                  </button>
                </div>
              </div>

              {reviewsLoading && <Loader label="Loading reviews..." />}
              {reviewsError && <ErrorBanner error={reviewsError} />}
              {!reviewsLoading && !reviewsError && reviews.length === 0 && <div className="empty-state">No reviews yet.</div>}
              {!reviewsLoading && !reviewsError && reviews.length > 0 && (
                <div className="profile-review-list">
                  {reviews.map((review) => (
                    <article key={review._id || review.id} className="profile-review-card">
                      <div className="profile-review-meta">
                        <strong>{reviewerName(review.reviewer)}</strong>
                        <span>{starText(review.rating)} {formatRating(review.rating)}</span>
                      </div>
                      {review.reviewText && <p>{review.reviewText}</p>}
                      <small>{formatReviewDate(review.createdAt)}</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
