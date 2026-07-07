import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useMilestonesStore } from "../../state/useMilestonesStore.js";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";

export default function MilestoneCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ contractId: "", title: "", description: "", amount: "", dueDate: "" });
  const [success, setSuccess] = useState("");
  const { createMilestone, createLoading, createError } = useMilestonesStore();

  // Only managers can create work stages
  if (user?.role !== "manager") {
    return (
      <section className="page-section">
        <header className="page-header">
          <div>
            <h2>Access denied</h2>
            <p>Only managers can create work stages.</p>
          </div>
        </header>
        <div className="card">
          <p>Work stages are created by managers for jobs. Please contact your manager if you need a new work stage added to your job.</p>
        </div>
      </section>
    );
  }

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccess("");
    try {
      const stage = await createMilestone(form.contractId, {
        title: form.title,
        description: form.description,
        amount: Number(form.amount),
        dueDate: form.dueDate || undefined,
      });
      setSuccess("Work stage created successfully.");
      // Redirect based on role
      if (user?.role === "manager") {
        navigate(`/manager/contracts/${form.contractId}`);
      } else {
        navigate(`/milestones/${stage._id || stage.id}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h2>Create Work Stage</h2>
          <p>Create a work stage and attach it to an existing job.</p>
        </div>
      </header>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Job ID
          <input value={form.contractId} onChange={handleChange("contractId")} required placeholder="job id" />
        </label>

        <label>
          Task Title
          <input value={form.title} onChange={handleChange("title")} required placeholder="Work stage title" />
        </label>

        <label>
          Task Description
          <textarea value={form.description} onChange={handleChange("description")} rows="4" required placeholder="Describe this work stage" />
        </label>

        <label>
          Payment Amount (KES)
          <input type="number" min="0" value={form.amount} onChange={handleChange("amount")} required placeholder="Amount" />
        </label>

        <label>
          Due date
          <input type="date" value={form.dueDate} onChange={handleChange("dueDate")} />
        </label>

        {createError && <ErrorBanner error={createError} />}

        <button className="button-primary" type="submit" disabled={createLoading}>
          {createLoading ? <Loader label="Creating work stage..." /> : "Create Work Stage"}
        </button>

        {success && <div className="success-message">{success}</div>}
      </form>
    </section>
  );
}
