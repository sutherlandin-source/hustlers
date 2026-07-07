import { useEffect, useState } from "react";
import { useDataStore } from "../../state/useDataStore.js";
import { userService } from "../../services/userService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

function initials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";
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

export default function ProfilePage() {
  const { user, userLoading, userError, fetchUser } = useDataStore();
  const { updateUser } = useAuth();
  const [form, setForm] = useState({
    email: "",
    phoneNumber: "",
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

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    setForm({
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      location: user.location || "",
      bio: user.bio || "",
      avatar: user.avatar || "",
      companyName: user.companyName || "",
      industry: user.industry || "",
      experienceLevel: user.experienceLevel || "",
      skills: Array.isArray(user.skills) ? user.skills.join(", ") : "",
    });
  }, [user]);

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
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const payload = {
        email: form.email,
        phoneNumber: form.phoneNumber,
        location: form.location,
        bio: form.bio,
        avatar: form.avatar,
        companyName: form.companyName,
        industry: form.industry,
        experienceLevel: form.experienceLevel,
        skills: form.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      };
      Object.keys(payload).forEach((key) => {
        if (key === "avatar") return;
        if (payload[key] === "" || (Array.isArray(payload[key]) && payload[key].length === 0)) {
          delete payload[key];
        }
      });
      const result = await userService.updateProfile(payload);
      const updatedUser = result?.user || result;
      if (updatedUser) updateUser(updatedUser);
      await fetchUser();
      setSaveSuccess("Profile updated successfully.");
    } catch (err) {
      setSaveError(err?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

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
              </label>
              <label className="form-label">
                <span>Phone number</span>
                <input value={form.phoneNumber} onChange={updateField("phoneNumber")} placeholder="+254..." />
              </label>
              <label className="form-label profile-avatar-url-field">
                <span>Profile picture URL</span>
                <input value={form.avatar} onChange={updateField("avatar")} placeholder="https://..." />
              </label>
              <label className="form-label">
                <span>Location</span>
                <input value={form.location} onChange={updateField("location")} />
              </label>
              <label className="form-label">
                <span>Company name</span>
                <input value={form.companyName} onChange={updateField("companyName")} />
              </label>
              <label className="form-label">
                <span>Industry</span>
                <input value={form.industry} onChange={updateField("industry")} />
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
              </label>
              <label className="form-label profile-bio-field">
                <span>Bio</span>
                <textarea value={form.bio} onChange={updateField("bio")} rows={5} placeholder="Describe your work, experience, or business." />
              </label>
            </div>

            <div className="profile-actions">
              <button type="submit" className="button-primary" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
