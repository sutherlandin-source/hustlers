export default function ProgressTimeline({ progress, contract }) {
  if (!progress) return null;

  const stages = [
    { id: "assigned", label: "Contract Assigned", icon: "Done", completed: true },
    {
      id: "in_progress",
      label: "Work In Progress",
      icon: "⏳",
      completed: progress.inProgress > 0 || progress.completed > 0,
    },
    {
      id: "submitted",
      label: "Work Submitted",
      icon: "📤",
      completed: progress.submitted > 0 || progress.completed > 0,
    },
    { id: "approved", label: "Work Approved", icon: "Done", completed: progress.completed > 0 },
  ];

  const percentComplete = progress.percentComplete || 0;

  return (
    <div className="progress-timeline">
      <div className="progress-header">
        <h3>Progress Timeline</h3>
        <div className="progress-percentage">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${percentComplete}%` }}></div>
          </div>
          <span className="percentage-text">{percentComplete}% Complete</span>
        </div>
      </div>

      <div className="timeline-stages">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="timeline-stage">
            <div className={`stage-dot ${stage.completed ? "completed" : ""}`}>{stage.icon}</div>
            <div className="stage-label">{stage.label}</div>
            {idx < stages.length - 1 && <div className={`stage-line ${stage.completed ? "completed" : ""}`}></div>}
          </div>
        ))}
      </div>

      {contract && (
        <div className="contract-stats">
          <div className="stat">
            <span className="stat-label">Total Milestones:</span>
            <span className="stat-value">{progress.total}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Completed:</span>
            <span className="stat-value">{progress.completed}</span>
          </div>
          <div className="stat">
            <span className="stat-label">In Progress:</span>
            <span className="stat-value">{progress.inProgress}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Submitted:</span>
            <span className="stat-value">{progress.submitted}</span>
          </div>
        </div>
      )}
    </div>
  );
}
