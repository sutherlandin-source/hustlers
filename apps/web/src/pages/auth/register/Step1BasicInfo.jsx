export default function Step1BasicInfo({ data, errors, onChange }) {
  return (
    <div className="form-step">
      <h3>Basic account information</h3>
      <p className="step-description">Provide the account and contact details we need to create your profile.</p>

      <fieldset className="form-fieldset">
        <label className="form-label">
          <span className="label-text">First name</span>
          <input name="firstName" value={data.firstName} onChange={onChange} placeholder="Jane" />
          <span className="field-help">Your first name (min 2 characters)</span>
          {errors.firstName && <p className="field-error">{errors.firstName}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Last name</span>
          <input name="lastName" value={data.lastName} onChange={onChange} placeholder="Doe" />
          <span className="field-help">Your family name (min 2 characters)</span>
          {errors.lastName && <p className="field-error">{errors.lastName}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Email address</span>
          <input type="email" name="email" value={data.email} onChange={onChange} placeholder="jane@example.com" />
          <span className="field-help">We'll use this to send account updates and important notifications</span>
          {errors.email && <p className="field-error">{errors.email}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Phone number</span>
          <input type="tel" name="phoneNumber" value={data.phoneNumber} onChange={onChange} placeholder="+254712345678" />
          <span className="field-help">Kenya format: +254 followed by 9 digits</span>
          {errors.phoneNumber && <p className="field-error">{errors.phoneNumber}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Password</span>
          <input type="password" name="password" value={data.password} onChange={onChange} placeholder="Create a strong password" />
          <span className="field-help">Minimum 8 characters. Use uppercase, lowercase, and numbers for security</span>
          {errors.password && <p className="field-error">{errors.password}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Confirm password</span>
          <input type="password" name="confirmPassword" value={data.confirmPassword} onChange={onChange} placeholder="Re-enter your password" />
          <span className="field-help">Passwords must match exactly</span>
          {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
        </label>
      </fieldset>
    </div>
  );
}
