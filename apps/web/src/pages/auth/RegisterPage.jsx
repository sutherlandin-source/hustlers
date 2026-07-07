import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Step1BasicInfo from "./register/Step1BasicInfo.jsx";
import Step2RoleSelection from "./register/Step2RoleSelection.jsx";
import Step3Kyc from "./register/Step3Kyc.jsx";
import Step4ProfileSetup from "./register/Step4ProfileSetup.jsx";

const STEPS = ["Basic Info", "Role Selection", "KYC / Trust", "Profile Setup"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+254\d{9}$/;

const DEFAULT_FORM_STATE = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  password: "",
  confirmPassword: "",
  role: "hustler",
  idNumber: "",
  mpesaNumber: "",
  location: "",
  skills: [],
  skillInput: "",
  bio: "",
  experienceLevel: "",
  companyName: "",
  industry: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(DEFAULT_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: null }));
    setGlobalError(null);
  };

  const updateSkillInput = (event) => {
    setFormData((prev) => ({ ...prev, skillInput: event.target.value }));
    setErrors((prev) => ({ ...prev, skills: null }));
  };

  const addSkill = () => {
    const skill = formData.skillInput.trim();
    if (!skill) {
      setErrors((prev) => ({ ...prev, skills: "Enter a skill before adding." }));
      return;
    }
    if (formData.skills.includes(skill)) {
      setFormData((prev) => ({ ...prev, skillInput: "" }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      skills: [...prev.skills, skill],
      skillInput: "",
    }));
  };

  const removeSkill = (skill) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((item) => item !== skill),
    }));
  };

  const validateStep = () => {
    const nextErrors = {};

    if (step === 1) {
      if (!formData.firstName.trim() || formData.firstName.trim().length < 2) {
        nextErrors.firstName = "First name is required and must be at least 2 characters.";
      }
      if (!formData.lastName.trim() || formData.lastName.trim().length < 2) {
        nextErrors.lastName = "Last name is required and must be at least 2 characters.";
      }
      if (!EMAIL_PATTERN.test(formData.email.trim())) {
        nextErrors.email = "Enter a valid email address.";
      }
      if (!PHONE_PATTERN.test(formData.phoneNumber.trim())) {
        nextErrors.phoneNumber = "Phone number must use +254 format, e.g. +254712345678.";
      }
      if (formData.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }
      if (formData.confirmPassword !== formData.password) {
        nextErrors.confirmPassword = "Passwords must match.";
      }
    }

    if (step === 2) {
      if (!["hustler", "manager"].includes(formData.role)) {
        nextErrors.role = "Please select Hustler or Manager / Client.";
      }
    }

    if (step === 3) {
      if (!formData.idNumber.trim()) {
        nextErrors.idNumber = "ID number is required.";
      }
      if (!PHONE_PATTERN.test(formData.mpesaNumber.trim())) {
        nextErrors.mpesaNumber = "M-Pesa number must use +254 format.";
      }
      if (!formData.location.trim() || formData.location.trim().length < 2) {
        nextErrors.location = "Location is required.";
      }
    }

    if (step === 4) {
      if (formData.role === "hustler") {
        if (!formData.skills.length) {
          nextErrors.skills = "Add at least one skill.";
        }
        if (!formData.bio.trim() || formData.bio.trim().length < 20) {
          nextErrors.bio = "Bio must be at least 20 characters.";
        }
        if (!formData.experienceLevel) {
          nextErrors.experienceLevel = "Select your experience level.";
        }
      } else if (formData.role === "manager") {
        if (!formData.industry.trim() || formData.industry.trim().length < 2) {
          nextErrors.industry = "Work type / industry is required.";
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep()) {
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const goBack = () => {
    setGlobalError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateStep()) {
      return;
    }

    const payload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim().toLowerCase(),
      phoneNumber: formData.phoneNumber.trim(),
      password: formData.password,
      role: formData.role,
      idNumber: formData.idNumber.trim(),
      mpesaNumber: formData.mpesaNumber.trim(),
      location: formData.location.trim(),
      skills: formData.skills,
      bio: formData.bio.trim(),
      experienceLevel: formData.experienceLevel,
      companyName: formData.companyName.trim(),
      industry: formData.industry.trim(),
    };

    setSubmitting(true);
    setGlobalError(null);

    try {
      await register(payload);
      navigate("/", { replace: true });
    } catch (err) {
      if (err && err.errors && typeof err.errors === "object") {
        const messages = Object.values(err.errors).flat();
        setGlobalError(messages.join("; ") || err.message || "Registration failed.");
      } else if (err && err.message) {
        setGlobalError(err.message);
      } else {
        setGlobalError("Registration failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1BasicInfo data={formData} errors={errors} onChange={updateField} />;
      case 2:
        return <Step2RoleSelection role={formData.role} error={errors.role} onRoleChange={updateField} />;
      case 3:
        return <Step3Kyc data={formData} errors={errors} onChange={updateField} />;
      case 4:
        return (
          <Step4ProfileSetup
            role={formData.role}
            data={formData}
            errors={errors}
            onChange={updateField}
            skillInput={formData.skillInput}
            onSkillInputChange={updateSkillInput}
            onAddSkill={addSkill}
            onRemoveSkill={removeSkill}
          />
        );
      default:
        return null;
    }
  };

  const renderStepIndicator = (stepNum, stepName) => {
    const isCompleted = stepNum < step;
    const isActive = stepNum === step;
    const isPending = stepNum > step;

    return (
      <div key={stepNum} className={`step-indicator-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isPending ? 'pending' : ''}`}>
        <div className="step-circle">
          {isCompleted ? (
            <span className="step-checkmark">Done</span>
          ) : (
            <span className="step-number">{stepNum}</span>
          )}
        </div>
        <p className="step-name">{stepName}</p>
      </div>
    );
  };

  const progressPercentage = (step / STEPS.length) * 100;

  return (
    <div className="auth-form auth-register">
      <div className="form-header">
        <p className="auth-kicker">Create your account</p>
        <h2>Join HUSTLERS</h2>
        <p>Set up a secure marketplace profile for freelance work, hiring, escrow, and payouts.</p>
      </div>

      {/* Visual Step Indicators */}
      <div className="step-indicators-container">
        <div className="step-indicators-row">
          {STEPS.map((stepName, index) => renderStepIndicator(index + 1, stepName))}
        </div>
      </div>

      {/* Progress Bar with Percentage */}
      <div className="progress-indicator">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
        </div>
        <div className="progress-info">
          <span className="progress-label">Step {step} of {STEPS.length}</span>
          <span className="progress-percentage">{Math.round(progressPercentage)}%</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {renderStep()}

        {globalError && <div className="form-error form-error-global">{globalError}</div>}

        <div className="form-actions">
          <button type="button" className="button-secondary" onClick={goBack} disabled={step === 1 || submitting}>
            Back
          </button>
          {step < STEPS.length ? (
            <button type="button" className="button-primary" onClick={goNext} disabled={submitting}>
              Continue
            </button>
          ) : (
            <button type="submit" className="button-primary" disabled={submitting}>
              {submitting ? "Completing onboarding..." : "Finish and create account"}
            </button>
          )}
        </div>
      </form>

      <div className="auth-footer">
        <span>Already have an account?</span>
        <Link to="/auth/login">Sign in</Link>
      </div>
      <div className="auth-navigation">
        <Link to="/" className="auth-nav-link">Home</Link>
        <span className="auth-nav-divider">/</span>
        <Link to="/" className="auth-nav-link">Browse Platform</Link>
      </div>
    </div>
  );
}
