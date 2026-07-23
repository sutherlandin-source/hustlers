export default function Step1BasicInfo({ data, errors, onChange }) {
  return (
    <div className="form-step">
      <h3>Basic info</h3>
      <p className="step-description">Just the essentials.</p>

      <fieldset className="form-fieldset">
        <label className="form-label">
          <span className="label-text">First name</span>
          <input name="firstName" value={data.firstName} onChange={onChange} placeholder="Jane" />
          <span className="field-help">First name</span>
          {errors.firstName && <p className="field-error">{errors.firstName}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Last name</span>
          <input name="lastName" value={data.lastName} onChange={onChange} placeholder="Doe" />
          <span className="field-help">Last name</span>
          {errors.lastName && <p className="field-error">{errors.lastName}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Email address</span>
          <input type="email" name="email" value={data.email} onChange={onChange} placeholder="jane@example.com" />
          <span className="field-help">Email for login</span>
          {errors.email && <p className="field-error">{errors.email}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Phone number</span>
          <input type="tel" name="phoneNumber" value={data.phoneNumber} onChange={onChange} placeholder="+254712345678" />
          <span className="field-help">Use +254 format</span>
          {errors.phoneNumber && <p className="field-error">{errors.phoneNumber}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Location</span>
          <input name="location" value={data.location} onChange={onChange} placeholder="e.g. Nairobi, Kenya" />
          <span className="field-help">Where you’re based</span>
          {errors.location && <p className="field-error">{errors.location}</p>}
        </label>
      </fieldset>
    </div>
  );
}
