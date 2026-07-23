import { useEffect, useMemo, useState } from "react";
import Loader from "./Loader.jsx";
import ErrorBanner from "./ErrorBanner.jsx";
import { reviewsService } from "../services/reviewsService.js";

function formatRating(value) {
  return Number(value || 0).toFixed(1);
}

function starText(value) {
  const rounded = Math.round(Number(value || 0));
  return "★".repeat(rounded) + "☆".repeat(Math.max(0, 5 - rounded));
}

function getInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "H";
}

function formatReviewDate(value) {
  return value ? new Date(value).toLocaleDateString() : "Not dated";
}

function formatMoney(amount, currency = "KSH") {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

export default function PublicHustlerProfileModal({
  application,
  onClose,
  onApprove,
  onReject,
  onMessage,
  approving = false,
  rejecting = false,
  messaging = false,
  embedded = false,
}) {
  const hustler = application?.hustlerId || {};
  const userId = hustler?._id || hustler?.id;
  const contract = application?.contract || application?.contractId || {};
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError("");
      try {
        const data = await reviewsService.listByUser(userId, { limit: 5, skip: 0 });
        if (!mounted) return;
        setReviews(data?.reviews || []);
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
  }, [userId]);

  const name = useMemo(
    () =>
      hustler.name ||
      [hustler.firstName, hustler.lastName].filter(Boolean).join(" ").trim() ||
      "Hustler",
    [hustler]
  );

  const skills = Array.isArray(hustler.skills) ? hustler.skills.filter(Boolean) : [];
  const verificationLabel = hustler.identityVerified ? "Verified" : "Not verified";
  const verificationTone = hustler.identityVerified ? "#15803d" : "#b45309";
  const appliedAt = application?.appliedAt || application?.createdAt || application?.created_at;
  const coverLetter = application?.coverLetter || "";
  const proposedRate = application?.proposedRate;
  const estimatedDuration = application?.estimatedDuration || "";
  const contractMilestones = Array.isArray(contract.milestones) ? contract.milestones : [];
  const contractTasks = Array.isArray(contract.metadata?.tasks) ? contract.metadata.tasks : [];
  const contractDeliverables = Array.isArray(contract.metadata?.deliverables) ? contract.metadata.deliverables : [];
  const contractWorkerCount = Number(contract.numWorkers || contract.workerSlots || 1);
  const averageRating = useMemo(() => {
    const directRating = Number(hustler.averageRating);
    if (Number.isFinite(directRating) && directRating > 0) return directRating;

    const reviewRatings = reviews
      .map((review) => Number(review.rating))
      .filter((rating) => Number.isFinite(rating) && rating > 0);

    if (!reviewRatings.length) return 0;
    return reviewRatings.reduce((sum, rating) => sum + rating, 0) / reviewRatings.length;
  }, [hustler.averageRating, reviews]);

  const body = (
    <div className={embedded ? "public-profile-panel" : "modal-content large"} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Public hustler profile</h2>
        </div>

        <div className="applicant-profile-layout">
          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Profile</h3>
              <span className="profile-badge">{verificationLabel}</span>
            </div>

            <div className="profile-header-card">
              <div className="profile-avatar">
                {hustler.avatar ? <img src={hustler.avatar} alt={name} /> : getInitials(name)}
              </div>
              <div className="profile-header-copy">
                <h4>{name}</h4>
                <p>{hustler.location || "Location not shared"}</p>
                {hustler.isEmailVerified && <span className="profile-secondary-badge">Email verified</span>}
              </div>
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Stats</h3>
            </div>
            <div className="stats-grid">
              <Metric label="Rating" value={`${starText(averageRating)} ${formatRating(averageRating)}`} />
              <Metric label="Completed jobs" value={Number(hustler.completedContracts || 0).toLocaleString()} />
              <Metric label="Reviews" value={Number(hustler.totalReviews || reviews.length || 0).toLocaleString()} />
              <Metric label="Experience" value={hustler.experienceLevel || "Not shared"} />
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>About</h3>
            </div>
            <p className="profile-copy">{hustler.bio || "No bio shared yet."}</p>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Skills</h3>
            </div>
            <div className="chip-row">
              {skills.length ? skills.map((skill) => <SkillChip key={skill} label={skill} />) : <span className="profile-muted">No skills listed</span>}
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Contract summary</h3>
            </div>
            <div className="detail-stack">
              <DetailRow label="Title" value={contract?.title || "Untitled contract"} />
              <DetailRow label="Budget" value={formatMoney(contract?.amount, contract?.currency || "KSH")} />
              <DetailRow label="Status" value={String(contract?.status || "pending").replace(/_/g, " ")} />
              <DetailRow label="Workers needed" value={contractWorkerCount.toLocaleString()} />
              <DetailRow label="Payment type" value={String(contract?.paymentType || contract?.contractType || "single").replace(/_/g, " ")} />
              <DetailRow label="Escrow" value={String(contract?.escrowStatus || "waiting_for_funding").replace(/_/g, " ")} />
              {contract.jobCategory && <DetailRow label="Category" value={contract.jobCategory} />}
              {contract.workLocation && <DetailRow label="Location" value={contract.workLocation} />}
              {contract.startDate && <DetailRow label="Start date" value={new Date(contract.startDate).toLocaleDateString()} />}
              {contract.dueDate && <DetailRow label="Due date" value={new Date(contract.dueDate).toLocaleDateString()} />}
              {contract.description && <DetailRow label="Description" value={contract.description} multiline />}
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Application</h3>
            </div>
            <div className="detail-stack">
              <DetailRow label="Status" value={String(application?.status || "pending").replace(/_/g, " ")} />
              <DetailRow label="Contract" value={contract?.title || "Untitled contract"} />
              <DetailRow label="Applied on" value={appliedAt ? new Date(appliedAt).toLocaleString() : "Not dated"} />
              {coverLetter && <DetailRow label="Cover letter" value={coverLetter} multiline />}
              {proposedRate && <DetailRow label="Proposed rate" value={`${proposedRate} ${contract?.currency || ""}`.trim()} />}
              {estimatedDuration && <DetailRow label="Estimated duration" value={estimatedDuration} />}
            </div>
          </section>

          {(contractMilestones.length > 0 || contractTasks.length > 0 || contractDeliverables.length > 0) && (
            <section className="profile-section">
              <div className="profile-section-header">
                <h3>Work breakdown</h3>
              </div>
              <div className="detail-stack">
                {contractMilestones.length > 0 && (
                  <DetailRow
                    label="Milestones"
                    value={contractMilestones
                      .map((milestone) => milestone.title || milestone.description || milestone)
                      .filter(Boolean)
                      .join(" • ")}
                    multiline
                  />
                )}
                {contractTasks.length > 0 && (
                  <DetailRow
                    label="Tasks"
                    value={contractTasks.map((task) => task.title || task).filter(Boolean).join(" • ")}
                    multiline
                  />
                )}
                {contractDeliverables.length > 0 && (
                  <DetailRow
                    label="Deliverables"
                    value={contractDeliverables.map((deliverable) => deliverable.title || deliverable).filter(Boolean).join(" • ")}
                    multiline
                  />
                )}
              </div>
            </section>
          )}

          <section className="profile-section">
            <div className="profile-section-header">
              <h3>Reviews</h3>
              <p>Recent feedback from past clients</p>
            </div>

            {reviewsLoading && <Loader label="Loading reviews..." />}
            {reviewsError && <ErrorBanner error={reviewsError} />}

            {!reviewsLoading && !reviewsError && reviews.length === 0 && <div className="empty-state">No reviews yet.</div>}

            {!reviewsLoading && !reviewsError && reviews.length > 0 && (
              <div className="review-list">
                {reviews.map((review) => (
                  <article key={review._id || review.id} className="review-card">
                    <div className="review-card-top">
                      <strong>{review.reviewer?.firstName || review.reviewer?.name || "Reviewer"}</strong>
                      <span>
                        {starText(review.rating)} {formatRating(review.rating)}
                      </span>
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
  );

  if (embedded) {
    return body;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      {body}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

function SkillChip({ label }) {
  return (
    <span className="skill-chip">
      {label}
    </span>
  );
}

function DetailRow({ label, value, multiline = false }) {
  return (
    <div className={`detail-row ${multiline ? "multiline" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
