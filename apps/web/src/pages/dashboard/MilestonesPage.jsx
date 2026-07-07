import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useMilestonesStore } from "../../state/useMilestonesStore.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

export default function MilestonesPage() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const { milestones, milestonesLoading, milestonesError, fetchMilestones } = useMilestonesStore();

  useEffect(() => {
    if (!userId) return;
    fetchMilestones({ sellerId: userId });
  }, [userId]);

  const assignedStages = (milestones || []).filter(
    (stage) => stage?.contract?.seller?._id === userId || stage?.contract?.seller === userId || stage?.submittedBy === userId
  );

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Assigned Work Stages</h2>
          <p>Review your active work stages, mark tasks complete, and track approval status.</p>
        </div>
      </header>

      {milestonesLoading && (
        <div className="card-list">
          <div className="card">
            <Loader label="Loading work stages..." />
          </div>
        </div>
      )}

      {milestonesError && (
        <div className="card-list">
          <div className="card">
            <ErrorBanner error={milestonesError} />
          </div>
        </div>
      )}

      {!milestonesLoading && !milestonesError && (
        <div className="card-list">
          {assignedStages.length ? (
            assignedStages.map((stage) => (
              <Link
                key={stage._id || stage.id}
                to={`/milestones/${stage._id || stage.id}`}
                className="card card-link"
              >
                <h3>{stage.title}</h3>
                <p>Status: {stage.status}</p>
                <p>Payment: {stage.amount}</p>
                <p>Job: {stage.contract?.title || "—"}</p>
                <p>Due: {stage.dueDate ? new Date(stage.dueDate).toLocaleString() : "Not set"}</p>
              </Link>
            ))
          ) : (
            <div className="card">
              <h3>No assigned work stages</h3>
              <p>Your work stages will appear here when jobs are ready for completion.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
