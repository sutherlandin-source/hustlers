import { useEffect, useState } from "react";
import { useDataStore } from "../../state/useDataStore.js";
import { userService } from "../../services/userService.js";
import { reviewsService } from "../../services/reviewsService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
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
  return "★".repeat(rounded) + "☆".repeat(Math.max(0, 5 - rounded));
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 512;
        const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizePhone(value) {
  return String(value || "").replace(/[\s-]/g, "").trim();
}

function isValidEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isKenyaPhone(value) {
  return !value || /^\+254\d{9}$/.test(normalizePhone(value));
}

function validateProfileForm(form) {
  const errors = {};
  const email = String(form.email || "").trim();
  const phoneNumber = normalizePhone(form.phoneNumber);
  const idNumber = String(form.idNumber || "").trim();
  const mpesaNumber = normalizePhone(form.mpesaNumber);
  const location = String(form.location || "").trim();
  const bio = String(form.bio || "").trim();
  const industry = String(form.industry || "").trim();
  const skills = String(form.skills || "").trim();

  if (email && !isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (phoneNumber && !isKenyaPhone(phoneNumber)) errors.phoneNumber = "Use +254 followed by 9 digits.";
  if (idNumber && idNumber.length < 4) errors.idNumber = "ID or passport number is too short.";
  if (mpesaNumber && !isKenyaPhone(mpesaNumber)) errors.mpesaNumber = "Use +254 followed by 9 digits.";
  if (location && location.length < 2) errors.location = "Location must be at least 2 characters.";
  if (bio && bio.length < 10) errors.bio = "Bio must be at least 10 characters.";
  if (industry && industry.length < 2) errors.industry = "Industry must be at least 2 characters.";
  if (skills) {
    const invalidSkill = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .some((skill) => skill.length < 2);
    if (invalidSkill) errors.skills = "Each skill should be at least 2 characters.";
  }

  return errors;
}

function formatValidationErrors(error) {
  const fieldErrors = error?.errors && typeof error.errors === "object" ? Object.entries(error.errors) : [];
  if (!fieldErrors.length) return error?.message || "Failed to update profile.";
  const details = fieldErrors
    .map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join(", ") : message}`)
    .join(" • ");
  return `${error?.message || "Validation failed"} — ${details}`;
}

export default function ProfilePage() {
  const { user, userLoading, userError, fetchUser } = useDataStore();
  const { updateUser } = useAuth();
  const [initialForm, setInitialForm] = useState(null);
  const [form, setForm] = useState({
    email: "",
    phoneNumber: "",
    idNumber: "",
    mpesaNumber: "",
    location: "",
    bio: "",
    avatar: "",
    companyName: "",
    industry: "",
    experienceLevel: "",
    skills: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsDistribution, setReviewsDistribution] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [reviewsSkip, setReviewsSkip] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const validationErrors = validateProfileForm(form);

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    const nextForm = {
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      idNumber: user.idNumber || "",
      mpesaNumber: user.mpesaNumber || "",
      location: user.location || "",
      bio: user.bio || "",
      avatar: user.avatar || "",
      companyName: user.companyName || "",
      industry: user.industry || "",
      experienceLevel: user.experienceLevel || "",
      skills: Array.isArray(user.skills) ? user.skills.join(", ") : "",
    };
    setForm(nextForm);
    setInitialForm(nextForm);
  }, [user]);

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
      } catch (err) {
        if (mounted) setReviewsError(err?.message || "Failed to load reviews.");
      } finally {
        if (mounted) setReviewsLoading(false);
      }
    };

    loadReviews();
    return () => {
      mounted = false;
    };
  }, [user?._id, user?.id, reviewsSkip]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setSaveError("");
    setSaveSuccess("");
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSaveError("");
    setSaveSuccess("");

    if (!file.type.startsWith("image/")) {
      setSaveError("Please choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setSaveError("Profile picture must be 8MB or smaller.");
      return;
    }

    try {
      const resizedAvatar = await resizeImageFile(file);
      setForm((current) => ({ ...current, avatar: resizedAvatar }));
      setAvatarFileName(file.name);
    } catch {
      setSaveError("Could not read that image. Please try another file.");
    }
  };

  const removeAvatar = () => {
    setForm((current) => ({ ...current, avatar: "" }));
    setAvatarFileName("");
    setSaveError("");
    setSaveSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (Object.keys(validationErrors).length > 0) {
      setSaveError("Fix the highlighted fields before saving.");
      setSaveSuccess("");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const nextSkills = form.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      const previousSkills = Array.isArray(user?.skills) ? user.skills.map((skill) => String(skill).trim()).filter(Boolean) : [];
      const payload = {};

      const email = form.email.trim();
      const phoneNumber = normalizePhone(form.phoneNumber);
      const idNumber = form.idNumber.trim();
      const mpesaNumber = normalizePhone(form.mpesaNumber);
      const location = form.location.trim();
      const bio = form.bio.trim();
      const companyName = form.companyName.trim();
      const industry = form.industry.trim();
      const experienceLevel = form.experienceLevel.trim();

      if (email && email !== String(initialForm?.email || "").trim()) payload.email = email;
      if (phoneNumber && phoneNumber !== normalizePhone(initialForm?.phoneNumber || "")) payload.phoneNumber = phoneNumber;
      if (idNumber && idNumber !== String(initialForm?.idNumber || "").trim()) payload.idNumber = idNumber;
      if (mpesaNumber && mpesaNumber !== normalizePhone(initialForm?.mpesaNumber || "")) payload.mpesaNumber = mpesaNumber;
      if (location && location !== String(initialForm?.location || "").trim()) payload.location = location;
      if (bio && bio !== String(initialForm?.bio || "").trim()) payload.bio = bio;
      if (form.avatar !== String(initialForm?.avatar || "")) payload.avatar = form.avatar;
      if (companyName && companyName !== String(initialForm?.companyName || "").trim()) payload.companyName = companyName;
      if (industry && industry !== String(initialForm?.industry || "").trim()) payload.industry = industry;
      if (experienceLevel && experienceLevel !== String(initialForm?.experienceLevel || "").trim()) payload.experienceLevel = experienceLevel;
      if (nextSkills.join(",") !== previousSkills.join(",")) payload.skills = nextSkills;

      if (!Object.keys(payload).length) {
        setSaveSuccess("No changes to save.");
        setSaving(false);
        return;
      }

      const result = await userService.updateProfile(payload);
      const updatedUser = result?.user || result;
      if (updatedUser) updateUser(updatedUser);
      await fetchUser();
      setInitialForm({
        email: updatedUser?.email || form.email,
        phoneNumber: updatedUser?.phoneNumber || form.phoneNumber,
        idNumber: updatedUser?.idNumber || form.idNumber,
        mpesaNumber: updatedUser?.mpesaNumber || form.mpesaNumber,
        location: updatedUser?.location || form.location,
        bio: updatedUser?.bio || form.bio,
        avatar: updatedUser?.avatar || form.avatar,
        companyName: updatedUser?.companyName || form.companyName,
        industry: updatedUser?.industry || form.industry,
        experienceLevel: updatedUser?.experienceLevel || form.experienceLevel,
        skills: Array.isArray(updatedUser?.skills) ? updatedUser.skills.join(", ") : form.skills,
      });
      setSaveSuccess("Profile updated successfully.");
    } catch (err) {
      setSaveError(formatValidationErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const averageRating = Number(user?.averageRating || 0);
  const totalReviews = Number(user?.totalReviews || reviewsTotal || 0);
  const hasIdentityDetails = Boolean(form.idNumber.trim() && form.mpesaNumber.trim());
  const hasPreviousReviews = reviewsSkip > 0;
  const hasNextReviews = reviewsSkip + REVIEWS_PAGE_SIZE < reviewsTotal;

  return (
    <section className="page-section profile-page">
      <header className="page-header">
        <div>
          <h2>Profile</h2>
          <p>Update your account, profile photo, and public details.</p>
        </div>
      </header>

      {userLoading && <Loader label="Loading profile..." />}
      {userError && <ErrorBanner error={userError} />}

      {!userLoading && !userError && (
        <form className="profile-editor" onSubmit={handleSubmit}>
          <aside className="profile-preview-card">
            <div className="profile-avatar-shell">
              <div className="profile-avatar-preview">
                {form.avatar ? <img src={form.avatar} alt="Profile" /> : <span>{initials(user)}</span>}
              </div>
              <span className="profile-avatar-status">{form.avatar ? "Photo selected" : "Initials avatar"}</span>
            </div>
            <h3>{user?.firstName} {user?.lastName}</h3>
            <p>{user?.role || "user"}</p>
            <small>Member since {user?.createdAt ? new Date(user.createdAt).getFullYear() : "not available"}</small>

            <div className="profile-rating-summary">
              <div className="profile-rating-score">
                <span className="profile-stars">{starText(averageRating)}</span>
                <strong>{formatRating(averageRating)}</strong>
              </div>
              <span>{totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}</span>
            </div>

            <div className="rating-distribution" aria-label="Rating distribution">
              {[5, 4, 3, 2, 1].map((score) => {
                const count = reviewsDistribution?.[score] || 0;
                const width = totalReviews ? `${Math.round((count / totalReviews) * 100)}%` : "0%";
                return (
                  <div key={score} className="rating-distribution-row">
                    <span>{score} ★</span>
                    <div className="rating-distribution-track">
                      <div className="rating-distribution-fill" style={{ width }} />
                    </div>
                    <small>{count}</small>
                  </div>
                );
              })}
            </div>

            <div className="avatar-upload-panel">
              <label className="avatar-upload-button">
                <input type="file" accept="image/*" onChange={handleAvatarUpload} />
                Choose photo
              </label>
              <button type="button" className="avatar-remove-button" onClick={removeAvatar} disabled={!form.avatar}>
                Remove
              </button>
              <span>{avatarFileName || "PNG, JPG, or WebP up to 8MB. Images are resized before saving."}</span>
            </div>
          </aside>

          <div className="profile-form-card">
            {saveError && <ErrorBanner error={saveError} />}
            {saveSuccess && <div className="success-message">{saveSuccess}</div>}

            <div className="profile-form-grid">
              <label className="form-label">
                <span>Email</span>
                <input type="email" value={form.email} onChange={updateField("email")} />
                {validationErrors.email && <small className="field-error-text">{validationErrors.email}</small>}
              </label>
              <label className="form-label">
                <span>Phone number</span>
                <input value={form.phoneNumber} onChange={updateField("phoneNumber")} placeholder="+254..." />
                {validationErrors.phoneNumber && <small className="field-error-text">{validationErrors.phoneNumber}</small>}
              </label>
              <label className="form-label">
                <span>National ID / Passport</span>
                <input value={form.idNumber} onChange={updateField("idNumber")} placeholder="e.g. 12345678" />
                {validationErrors.idNumber && <small className="field-error-text">{validationErrors.idNumber}</small>}
              </label>
              <label className="form-label">
                <span>M-Pesa number</span>
                <input value={form.mpesaNumber} onChange={updateField("mpesaNumber")} placeholder="+254712345678" />
                {validationErrors.mpesaNumber && <small className="field-error-text">{validationErrors.mpesaNumber}</small>}
              </label>
              <label className="form-label profile-avatar-url-field">
                <span>Profile picture URL</span>
                <input value={form.avatar} onChange={updateField("avatar")} placeholder="https://..." />
              </label>
              <label className="form-label">
                <span>Location</span>
                <input value={form.location} onChange={updateField("location")} />
                {validationErrors.location && <small className="field-error-text">{validationErrors.location}</small>}
              </label>
              <label className="form-label">
                <span>Company name</span>
                <input value={form.companyName} onChange={updateField("companyName")} />
              </label>
              <label className="form-label">
                <span>Industry</span>
                <input value={form.industry} onChange={updateField("industry")} />
                {validationErrors.industry && <small className="field-error-text">{validationErrors.industry}</small>}
              </label>
              <label className="form-label">
                <span>Experience level</span>
                <select value={form.experienceLevel} onChange={updateField("experienceLevel")}>
                  <option value="">Not set</option>
                  <option value="entry">Entry</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
              <label className="form-label">
                <span>Skills</span>
                <input value={form.skills} onChange={updateField("skills")} placeholder="Welding, design, delivery" />
                {validationErrors.skills && <small className="field-error-text">{validationErrors.skills}</small>}
              </label>
              <label className="form-label profile-bio-field">
                <span>Bio</span>
                <textarea value={form.bio} onChange={updateField("bio")} rows={5} placeholder="Describe your work, experience, or business." />
                {validationErrors.bio && <small className="field-error-text">{validationErrors.bio}</small>}
              </label>
            </div>

            <div className="security-notice">
              <span className="notice-icon">{hasIdentityDetails ? "Verified" : "KYC"}</span>
              <p>
                {hasIdentityDetails
                  ? "Your identity details are saved and ready for actions that need verification."
                  : "Complete your identity details here before applying for jobs or creating contracts."}
              </p>
            </div>

            <div className="profile-actions">
              <button type="submit" className="button-primary" disabled={saving || Object.keys(validationErrors).length > 0}>
                {saving ? "Saving..." : "Save profile"}
              </button>
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
        </form>
      )}
    </section>
  );
}
