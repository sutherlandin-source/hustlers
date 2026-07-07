export default function Step4ProfileSetup({ role, data, errors, onChange, skillInput, onSkillInputChange, onAddSkill, onRemoveSkill }) {
  return (
    <div className="form-step">
      <h3>Profile setup</h3>
      <p className="step-description">
        {role === "manager" ? "Complete your manager profile so workers understand your work needs." : "Complete your hustler profile to attract more opportunities."}
      </p>

      <fieldset className="form-fieldset">
        {role === "hustler" ? (
          <>
            <label className="form-label">
              <span className="label-text">Skills</span>
              <div className="tag-input-row">
                <input name="skillInput" value={skillInput} onChange={onSkillInputChange} placeholder="e.g. welding, painting, delivery" />
                <button type="button" className="button-secondary button-add-skill" onClick={onAddSkill}>
                  Add
                </button>
              </div>
              <span className="field-help">Add at least one skill that managers can hire you for.</span>
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
              <textarea name="bio" value={data.bio} onChange={onChange} placeholder="Tell managers about your experience, strengths, and the work you deliver." rows={5} />
              <span className="field-help">Minimum 20 characters. Current: {data.bio.length} characters.</span>
              {errors.bio && <p className="field-error">{errors.bio}</p>}
            </label>

            <label className="form-label">
              <span className="label-text">Experience level</span>
              <select name="experienceLevel" value={data.experienceLevel} onChange={onChange}>
                <option value="">Select your experience</option>
                <option value="entry">Entry-level (0-2 years)</option>
                <option value="intermediate">Intermediate (2-5 years)</option>
                <option value="expert">Expert (5+ years)</option>
              </select>
              <span className="field-help">This helps managers choose the right worker.</span>
              {errors.experienceLevel && <p className="field-error">{errors.experienceLevel}</p>}
            </label>
          </>
        ) : (
          <>
            <label className="form-label">
              <span className="label-text">Company name (optional)</span>
              <input name="companyName" value={data.companyName} onChange={onChange} placeholder="e.g. Acme Works" />
              <span className="field-help">Add this if you are hiring on behalf of a business.</span>
            </label>

            <label className="form-label">
              <span className="label-text">Work type / industry</span>
              <input name="industry" value={data.industry} onChange={onChange} placeholder="e.g. Construction, Events, Delivery" />
              <span className="field-help">Tell workers what type of jobs you usually post.</span>
              {errors.industry && <p className="field-error">{errors.industry}</p>}
            </label>
          </>
        )}
      </fieldset>
    </div>
  );
}
