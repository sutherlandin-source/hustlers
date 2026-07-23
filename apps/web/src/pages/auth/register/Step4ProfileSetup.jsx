export default function Step4ProfileSetup({ data, errors, onChange, skillInput, onSkillInputChange, onAddSkill, onRemoveSkill }) {
  return (
    <div className="form-step">
      <h3>Profile setup</h3>
      <p className="step-description">Add a few details so other users can find and trust your profile.</p>

      <fieldset className="form-fieldset">
        <label className="form-label">
          <span className="label-text">Location</span>
          <input name="location" value={data.location} onChange={onChange} placeholder="e.g. Nairobi, Kenya" />
          <span className="field-help">Where you’re based. You can update identity details later after login.</span>
          {errors.location && <p className="field-error">{errors.location}</p>}
        </label>

        <label className="form-label">
          <span className="label-text">Skills</span>
          <div className="tag-input-row">
            <input name="skillInput" value={skillInput} onChange={onSkillInputChange} placeholder="e.g. welding, painting, delivery" />
            <button type="button" className="button-secondary button-add-skill" onClick={onAddSkill}>
              Add
            </button>
          </div>
          <span className="field-help">Add the skills or services you want to showcase.</span>
          {errors.skills && <p className="field-error">{errors.skills}</p>}
        </label>

        {data.skills.length > 0 && (
          <div className="skills-display">
            <p className="skills-count">Skills added: {data.skills.length}</p>
            <div className="tag-list">
              {data.skills.map((skill) => (
                <button key={skill} type="button" className="tag-pill tag-removable" onClick={() => onRemoveSkill(skill)} title="Click to remove">
                  {skill}
                  <span className="tag-remove">x</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="form-label">
          <span className="label-text">Bio</span>
          <textarea name="bio" value={data.bio} onChange={onChange} placeholder="Tell people about your background, strengths, and the work you deliver." rows={5} />
          <span className="field-help">Share a short intro so people know what you do.</span>
        </label>

        <label className="form-label">
          <span className="label-text">Experience level</span>
          <select name="experienceLevel" value={data.experienceLevel} onChange={onChange}>
            <option value="">Select your experience</option>
            <option value="entry">Entry-level (0-2 years)</option>
            <option value="intermediate">Intermediate (2-5 years)</option>
            <option value="expert">Expert (5+ years)</option>
          </select>
          <span className="field-help">Optional, but it helps other users understand your background.</span>
        </label>

        <label className="form-label">
          <span className="label-text">Company name</span>
          <input name="companyName" value={data.companyName} onChange={onChange} placeholder="e.g. Acme Works" />
          <span className="field-help">Useful if you’re signing up on behalf of a business.</span>
        </label>

        <label className="form-label">
          <span className="label-text">Industry</span>
          <input name="industry" value={data.industry} onChange={onChange} placeholder="e.g. Construction, Events, Delivery" />
          <span className="field-help">Optional, but helpful for matching and discovery.</span>
        </label>
      </fieldset>
    </div>
  );
}
