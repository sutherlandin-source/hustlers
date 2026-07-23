import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "../../state/useDataStore.js";
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

export default function AdminProfilePage() {
  const { user, userLoading, userError, fetchUser } = useDataStore();
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsDistribution, setReviewsDistribution] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [reviewsSkip, setReviewsSkip] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const userId = user?._id || user?.id;
    if (!userId) return;

    let mounted = true;
    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError("");
      try {
        const data = await reviewsService.listByUser(userId, {
          limit: REVIEWS_PAGE_SIZE,
          skip: reviewsSkip,
        });
        if (!mounted) return;
        setReviews(data.reviews || []);
        setReviewsTotal(data.total || 0);
        setReviewsDistribution(data.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
      } catch (error) {
        if (mounted) setReviewsError(error?.message || "Failed to load reviews.");
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

  return (
    <section className="page-section profile-page">
      <header className="page-header">
        <div>
          <h2>Admin Profile</h2>
          <p>View-only access to the current account and profile details.</p>
        </div>
        <Link to="/admin" className="button-secondary">
          Back to dashboard
        </Link>
      </header>

      {userLoading && <Loader label="Loading profile..." />}
      {userError && <ErrorBanner error={userError} />}

      {!userLoading && !userError && user && (
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
              <p>
                {hasIdentityDetails
                  ? "Identity details are on file and ready for actions that need verification."
                  : "Identity details are incomplete for this account."}
              </p>
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
              <div className="detail-row">
                <span>Email</span>
                <strong>{user.email || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>Phone number</span>
                <strong>{user.phoneNumber || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>National ID / Passport</span>
                <strong>{user.idNumber || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>M-Pesa number</span>
                <strong>{user.mpesaNumber || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>Company name</span>
                <strong>{user.companyName || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>Industry</span>
                <strong>{user.industry || "-"}</strong>
              </div>
              <div className="detail-row">
                <span>Experience level</span>
                <strong>{user.experienceLevel || "-"}</strong>
              </div>
              <div className="detail-row profile-bio-field">
                <span>Skills</span>
                <strong>{Array.isArray(user.skills) ? user.skills.join(", ") : user.skills || "-"}</strong>
              </div>
              <div className="detail-row profile-bio-field">
                <span>Bio</span>
                <strong>{user.bio || "-"}</strong>
              </div>
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
              {!reviewsLoading && !reviewsError && reviews.length === 0 && (
                <div className="empty-state">No reviews yet.</div>
              )}
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
