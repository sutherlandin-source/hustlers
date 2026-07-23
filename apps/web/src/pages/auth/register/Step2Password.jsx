export default function Step2Password({ data, errors, onChange }) {
  return (
    <div className="form-step">
      <h3>Password</h3>
      <p className="step-description">Set your password.</p>

      <fieldset className="form-fieldset">
        <label className="form-label">
          <span className="label-text">Password</span>
          <input type="password" name="password" value={data.password} onChange={onChange} placeholder="Create a strong password" />
          <span className="field-help">8+ characters</span>
          {errors.password && <p className="field-error">{errors.password}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Confirm password</span>
          <input type="password" name="confirmPassword" value={data.confirmPassword} onChange={onChange} placeholder="Re-enter your password" />
          <span className="field-help">Repeat it</span>
          {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
        </label>
      </fieldset>
    </div>
  );
}
