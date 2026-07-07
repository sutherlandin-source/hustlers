export default function Step3Kyc({ data, errors, onChange }) {
  return (
    <div className="form-step">
      <h3>KYC and trust information</h3>
      <p className="step-description">Provide the identity and payout details required for marketplace trust and secure transactions.</p>

      <fieldset className="form-fieldset">
        <label className="form-label">
          <span className="label-text">ID number</span>
          <input name="idNumber" value={data.idNumber} onChange={onChange} placeholder="e.g. 12345678" />
          <span className="field-help">National ID, passport, or valid government-issued ID number</span>
          {errors.idNumber && <p className="field-error">{errors.idNumber}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">M-Pesa number</span>
          <input type="tel" name="mpesaNumber" value={data.mpesaNumber} onChange={onChange} placeholder="+254712345678" />
          <span className="field-help">Kenya M-Pesa number for payments. Format: +254 followed by 9 digits</span>
          {errors.mpesaNumber && <p className="field-error">{errors.mpesaNumber}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Location</span>
          <input name="location" value={data.location} onChange={onChange} placeholder="e.g. Nairobi, Kenya" />
          <span className="field-help">City and country. Helps buyers and managers find local talent</span>
          {errors.location && <p className="field-error">{errors.location}</p>}
        </label>
      </fieldset>

      <div className="security-notice">
        <span className="notice-icon">Secure</span>
        <p>Your KYC data is used only for trust verification and secure payments.</p>
      </div>
    </div>
  );
}
