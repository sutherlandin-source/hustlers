export default function Step2RoleSelection({ role, error, onRoleChange }) {
  return (
    <div className="form-step">
      <h3>Select your role</h3>
      <p className="step-description">Choose the role that matches your marketplace purpose.</p>

      <fieldset className="radio-group radio-cards-grid">
        <label className="radio-card role-card role-hustler">
          <input type="radio" name="role" value="hustler" checked={role === "hustler"} onChange={onRoleChange} className="radio-input" />
          <div className="card-content">
            <span className="card-icon">H</span>
            <strong>Hustler</strong>
            <p>Find freelance work and build your reputation through completed contracts.</p>
            <ul className="card-features">
              <li>Browse and apply for jobs</li>
              <li>Showcase your skills</li>
              <li>Earn payments securely</li>
            </ul>
          </div>
        </label>

        <label className="radio-card role-card role-manager">
          <input type="radio" name="role" value="manager" checked={role === "manager"} onChange={onRoleChange} className="radio-input" />
          <div className="card-content">
            <span className="card-icon">M</span>
            <strong>Manager</strong>
            <p>Post jobs, manage contracts, and hire trusted talent for your projects.</p>
            <ul className="card-features">
              <li>Post job listings</li>
              <li>Manage contracts</li>
              <li>Release secure payments</li>
            </ul>
          </div>
        </label>
      </fieldset>

      {error && <p className="field-error field-error-large">{error}</p>}
      {!error && role && <p className="field-success">Selected: {role === "hustler" ? "Hustler" : "Manager"}</p>}
    </div>
  );
}
