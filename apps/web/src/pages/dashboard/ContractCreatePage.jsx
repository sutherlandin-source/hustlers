import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useContractsStore } from "../../state/useContractsStore.js";
import { milestonesService } from "../../services/milestonesService.js";
import { contractsService } from "../../services/contractsService.js";

const JOB_CATEGORIES = [
  "Cleaning",
  "Moving & Lifting",
  "Delivery & Errands",
  "Construction Helper",
  "Farm Work",
  "Shop Assistance",
  "Event Support",
  "Household Work",
  "General Labor",
  "Other",
];

const PAYMENT_TYPES = [
  { value: "fixed", label: "Fixed Price" },
  { value: "daily", label: "Per Day" },
  { value: "hourly", label: "Per Hour" },
];

const HUSTLER_COMMISSION_RATE = 0.025;

const INITIAL_FORM_DATA = {
  // Contract Information
  jobTitle: "",
  jobCategory: "",
  jobDescription: "",
  workLocation: "",
  numWorkersRequired: "1",
  startDate: "",
  completionDate: "",
  // Payment Structure
  paymentStructure: "single", // single or stages
  // Payment Information
  amount: "",
  numStages: "2",
  paymentType: "fixed",
  escrowConfirmation: false,
  // Work Stages (for stages payment structure)
  workStages: [{ title: "", description: "", amount: "" }],
  // Terms
  termsAccepted: false,
};

function formatKes(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
  }).format(Number(amount) || 0);
}

function normalizeAmountInput(value) {
  return value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
}

function parseAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function hasValidAmount(value) {
  return parseAmount(value) > 0;
}

function toDateInputValue(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formDataFromContract(contract) {
  const paymentStructure = (contract?.paymentType || contract?.contractType) === "staged" ? "stages" : "single";
  const milestones = Array.isArray(contract?.milestones) && contract.milestones.length
    ? contract.milestones
    : [{ title: "", description: "", amount: contract?.amount || "" }];

  return {
    jobTitle: contract?.title || "",
    jobCategory: contract?.jobCategory || "",
    jobDescription: contract?.description || "",
    workLocation: contract?.workLocation || "",
    numWorkersRequired: String(contract?.numWorkers || 1),
    startDate: toDateInputValue(contract?.startDate),
    completionDate: toDateInputValue(contract?.completionDate || contract?.dueDate),
    paymentStructure,
    amount: contract?.amount ? String(contract.amount) : "",
    numStages: String(Math.max(2, milestones.length)),
    paymentType: contract?.paymentRateType || "fixed",
    escrowConfirmation: true,
    workStages: milestones.map((stage) => ({
      id: stage?._id || stage?.id,
      title: stage?.title || "",
      description: stage?.description || "",
      amount: stage?.amount ? String(stage.amount) : "",
    })),
    termsAccepted: true,
  };
}

export default function ContractCreatePage() {
  const navigate = useNavigate();
  const { contractId } = useParams();
  const { user } = useAuth();
  const { createContract, updateContract } = useContractsStore();
  const isEditMode = Boolean(contractId);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState(null);
  const amountValue = parseAmount(formData.amount);
  const hustlerFee = Number((amountValue * HUSTLER_COMMISSION_RATE).toFixed(2));
  const hustlerNet = Number((amountValue - hustlerFee).toFixed(2));
  const hasPaymentAmount = amountValue > 0;
  const commissionRateLabel = `${HUSTLER_COMMISSION_RATE * 100}%`;

  useEffect(() => {
    if (!isEditMode || user?.role !== "manager") return;

    let cancelled = false;
    async function loadContractForEdit() {
      setEditLoading(true);
      setError(null);
      try {
        const contract = await contractsService.get(contractId);
        const buyerId = contract?.buyer?._id || contract?.buyer;
        const userId = user?._id || user?.id;
        if (buyerId && userId && String(buyerId) !== String(userId)) {
          setError("Only the manager who created this contract can edit it.");
          return;
        }
        if (contract?.seller || contract?.escrowPrepared) {
          setError("Assigned or funded contracts cannot be edited.");
          return;
        }
        if (!cancelled) setFormData(formDataFromContract(contract));
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load contract for editing");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }

    loadContractForEdit();

    return () => {
      cancelled = true;
    };
  }, [contractId, isEditMode, user?._id, user?.id, user?.role]);

  // Role check
  if (user?.role !== "manager") {
    return (
      <div className="page-shell">
        <section className="page-section">
          <header className="page-header">
            <div>
              <h2>Access denied</h2>
              <p>Only managers can create jobs.</p>
            </div>
          </header>
        </section>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Special handling for numStages - rebuild workStages array
    if (name === "numStages") {
      const newNumStages = parseInt(value);
      const currentStages = formData.workStages;
      let newStages;
      
      if (newNumStages > currentStages.length) {
        // Add new empty stages
        newStages = [
          ...currentStages,
          ...Array(newNumStages - currentStages.length)
            .fill(null)
            .map(() => ({ title: "", description: "", amount: "" }))
        ];
      } else {
        // Remove extra stages
        newStages = currentStages.slice(0, newNumStages);
      }
      
      setFormData((prev) => ({
        ...prev,
        numStages: value,
        workStages: newStages,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleWorkStageChange = (index, field, value) => {
    const newStages = [...formData.workStages];
    newStages[index][field] = value;
    setFormData((prev) => ({
      ...prev,
      workStages: newStages,
    }));
  };

  const handleAmountChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      amount: normalizeAmountInput(e.target.value),
    }));
  };

  const handleStageAmountChange = (index, value) => {
    handleWorkStageChange(index, "amount", normalizeAmountInput(value));
  };

  const addWorkStage = () => {
    setFormData((prev) => ({
      ...prev,
      workStages: [...prev.workStages, { title: "", description: "", amount: "" }],
      numStages: String(prev.workStages.length + 1),
    }));
  };

  const removeWorkStage = (index) => {
    if (formData.workStages.length > 1) {
      setFormData((prev) => ({
        ...prev,
        workStages: prev.workStages.filter((_, i) => i !== index),
        numStages: String(prev.workStages.length - 1),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || editLoading) return;
    setError(null);

    // Basic field validation
    if (
      !formData.jobTitle ||
      !formData.jobCategory ||
      !formData.jobDescription ||
      !formData.workLocation ||
      !formData.startDate ||
      !formData.completionDate ||
      !formData.escrowConfirmation ||
      !formData.termsAccepted
    ) {
      setError("Please fill in all required fields and confirm the payment terms");
      return;
    }

    // Payment structure specific validation
    if (formData.paymentStructure === "single") {
      if (!hasValidAmount(formData.amount)) {
        setError("Please enter a valid payment amount");
        return;
      }
    } else {
      // Stages payment structure validation
      if (formData.workStages.some((s) => !s.title || !s.description || !hasValidAmount(s.amount))) {
        setError("Please complete all task information for each work stage");
        return;
      }
      
      // Validate total equals sum of stages
      const totalAmount = parseAmount(formData.amount);
      const stagesTotal = formData.workStages.reduce((sum, s) => sum + parseAmount(s.amount), 0);
      if (!hasValidAmount(formData.amount) || Math.abs(totalAmount - stagesTotal) > 0.01) {
        setError(`Total contract amount (${formatKes(totalAmount)}) must equal the sum of all work stage values (${formatKes(stagesTotal)})`);
        return;
      }
    }

    setLoading(true);
    try {
      // Generate contract ID
      const timestamp = Date.now().toString().slice(-6);
      const generatedContractId = `CONT-${formData.jobCategory.split(" ")[0].toUpperCase()}-${timestamp}`;

      const payload = {
        title: formData.jobTitle,
        description: formData.jobDescription,
        amount: parseAmount(formData.amount),
        currency: "KSH",
        contractType: formData.paymentStructure === "stages" ? "staged" : "single",
        contractId,
        numWorkers: parseInt(formData.numWorkersRequired),
        jobCategory: formData.jobCategory,
        workLocation: formData.workLocation,
        startDate: formData.startDate,
        completionDate: formData.completionDate,
        paymentType: formData.paymentStructure === "stages" ? "staged" : "single",
        paymentRateType: formData.paymentType,
        paymentStructure: formData.paymentStructure,
      };

      // For stages payment, prefer sending `milestones` so the server auto-creates them
      if (formData.paymentStructure === "stages") {
        payload.milestones = formData.workStages.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          amount: parseAmount(s.amount),
        }));
      }

      if (isEditMode) {
        console.debug("Updating contract payload:", payload);
        const contract = await updateContract(contractId, payload);
        navigate(`/manager/contracts/${contract._id || contract.id}`, { replace: true });
        return;
      }

      console.debug("Creating contract payload:", payload);
      const result = await createContract(payload);

      // normalize contract object
      const contract = result?.contract || result;

      // If backend didn't auto-create milestones, create them now
      if (formData.paymentStructure === "stages") {
        const existing = contract?.milestones || [];
        if (!existing || existing.length === 0) {
          for (const s of formData.workStages) {
            await milestonesService.create(contract._id || contract.id, {
              title: s.title,
              description: s.description,
              amount: parseAmount(s.amount),
            });
          }
        }
      } else {
        // single payment: ensure a Job Completion milestone exists
        const existing = contract?.milestones || [];
        if (!existing || existing.length === 0) {
          await milestonesService.create(contract._id || contract.id, {
            title: "Job Completion",
            description: "Complete the full job and mark as done",
            amount: parseAmount(formData.amount),
          });
        }
      }

      navigate(`/manager/contracts/${contract._id || contract.id}`, { replace: true });
    } catch (err) {
      const errorMsg = err?.message || (typeof err === 'string' ? err : 'Failed to create job');
      let displayError = errorMsg;
      
      // If there are detailed validation errors, show them
      if (err?.errors && typeof err.errors === 'object') {
        const errorDetails = Object.entries(err.errors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join('; ');
        displayError = `${errorMsg} - ${errorDetails}`;
      }
      
      setError(displayError);
      console.error('Contract creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndStart = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      // Basic validation (same as handleSubmit)
      if (
        !formData.jobTitle ||
        !formData.jobCategory ||
        !formData.jobDescription ||
        !formData.workLocation ||
        !formData.startDate ||
        !formData.completionDate ||
        !formData.escrowConfirmation ||
        !formData.termsAccepted
      ) {
        setError("Please fill in all required fields and confirm the payment terms");
        setLoading(false);
        return;
      }

      if (formData.paymentStructure === "single") {
        if (!hasValidAmount(formData.amount)) {
          setError("Please enter a valid payment amount");
          setLoading(false);
          return;
        }
      } else {
        if (formData.workStages.some((s) => !s.title || !s.description || !hasValidAmount(s.amount))) {
          setError("Please complete all task information for each work stage");
          setLoading(false);
          return;
        }
        const totalAmount = parseAmount(formData.amount);
        const stagesTotal = formData.workStages.reduce((sum, s) => sum + parseAmount(s.amount), 0);
        if (!hasValidAmount(formData.amount) || Math.abs(totalAmount - stagesTotal) > 0.01) {
          setError(`Total contract amount (${formatKes(totalAmount)}) must equal the sum of all work stage values (${formatKes(stagesTotal)})`);
          setLoading(false);
          return;
        }
      }

      // Generate contract ID
      const timestamp = Date.now().toString().slice(-6);
      const contractId = `CONT-${formData.jobCategory.split(" ")[0].toUpperCase()}-${timestamp}`;

      const payload = {
        title: formData.jobTitle,
        description: formData.jobDescription,
        amount: parseAmount(formData.amount),
        currency: "KSH",
        contractType: formData.paymentStructure === "stages" ? "staged" : "single",
        ...(!isEditMode ? { contractId: generatedContractId } : {}),
        numWorkers: parseInt(formData.numWorkersRequired),
        jobCategory: formData.jobCategory,
        workLocation: formData.workLocation,
        startDate: formData.startDate,
        completionDate: formData.completionDate,
        paymentType: formData.paymentStructure === "stages" ? "staged" : "single",
        paymentRateType: formData.paymentType,
        paymentStructure: formData.paymentStructure,
      };

      if (formData.paymentStructure === "stages") {
        payload.milestones = formData.workStages.map((s) => ({
          title: s.title,
          description: s.description,
          amount: parseAmount(s.amount),
        }));
      }

      console.debug("Create & Start contract payload:", payload);
      const result = await createContract(payload);
      const contract = result?.contract || result;

      // ensure at least one milestone exists and obtain its id
      let firstMilestoneId = null;
      if (contract?.milestones && contract.milestones.length > 0) {
        firstMilestoneId = contract.milestones[0];
      } else {
        // create first milestone explicitly
        let created;
        if (formData.paymentStructure === "stages") {
          const s = formData.workStages[0];
          created = await milestonesService.create(contract._id || contract.id, {
            title: s.title,
            description: s.description,
            amount: parseAmount(s.amount),
          });
        } else {
          created = await milestonesService.create(contract._id || contract.id, {
            title: "Job Completion",
            description: "Complete the full job and mark as done",
            amount: parseAmount(formData.amount),
          });
        }
        const m = created?.milestone || created;
        if (m) firstMilestoneId = m._id || m.id;
      }

      if (firstMilestoneId) {
        // start it
        await milestonesService.updateWorkStatus(firstMilestoneId, "in_progress");
      }

      navigate(`/manager/contracts/${contract._id || contract.id}`, { replace: true });
    } catch (err) {
      const errorMsg = err?.message || (typeof err === 'string' ? err : 'Failed to create job');
      setError(errorMsg);
      console.error('Create and start error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-section" style={{ maxWidth: "900px" }}>
      <header className="page-header">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "8px", color: "#1a1a1a" }}>{isEditMode ? "Edit Job" : "Create New Job"}</h1>
          <p style={{ fontSize: "15px", color: "#666", fontWeight: "400" }}>{isEditMode ? "Update job details, payment terms, and work stages" : "Post a job, set payment terms, and find workers to complete the work"}</p>
        </div>
      </header>

      {editLoading && (
        <div style={{ marginBottom: "24px", color: "#555", fontSize: "14px" }}>
          Loading contract...
        </div>
      )}

      {error && (
        <div style={{
          padding: "14px 16px",
          backgroundColor: "#fee",
          color: "#c62828",
          borderRadius: "6px",
          marginBottom: "24px",
          fontSize: "14px",
          border: "1px solid #ffcdd2",
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #e0e0e0", overflow: "hidden" }}>
        {/* PAYMENT STRUCTURE - PROMINENT SELECTION */}
        <div style={{
          padding: "28px",
          borderBottom: "2px solid #1976d2",
          backgroundColor: "#f0f7ff",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px", color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.9 }}>Payment Structure</h2>
          
          <div style={{ display: "flex", gap: "20px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", flex: 1, padding: "16px", backgroundColor: "#fff", border: formData.paymentStructure === "single" ? "2px solid #1976d2" : "1px solid #ddd", borderRadius: "6px", transition: "all 0.2s" }}>
              <input
                type="radio"
                name="paymentStructure"
                value="single"
                checked={formData.paymentStructure === "single"}
                onChange={handleChange}
                style={{ cursor: "pointer", width: "20px", height: "20px", marginTop: "2px", flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a1a", marginBottom: "4px" }}>Single Payment</div>
                <div style={{ fontSize: "13px", color: "#666", lineHeight: "1.4" }}>Best for simple jobs like cleaning, delivery, or shop help. Pay full amount when work is complete.</div>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", flex: 1, padding: "16px", backgroundColor: "#fff", border: formData.paymentStructure === "stages" ? "2px solid #1976d2" : "1px solid #ddd", borderRadius: "6px", transition: "all 0.2s" }}>
              <input
                type="radio"
                name="paymentStructure"
                value="stages"
                checked={formData.paymentStructure === "stages"}
                onChange={handleChange}
                style={{ cursor: "pointer", width: "20px", height: "20px", marginTop: "2px", flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a1a", marginBottom: "4px" }}>Payment in Stages</div>
                <div style={{ fontSize: "13px", color: "#666", lineHeight: "1.4" }}>For larger projects with multiple tasks. Track each stage, then release the full payment after final approval.</div>
              </div>
            </label>
          </div>
        </div>

        {/* JOB INFORMATION */}
        <div style={{
          padding: "28px",
          borderBottom: "1px solid #e0e0e0",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px", color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>Job Information</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div className="form-group">
              <label htmlFor="jobTitle" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Job Title *</label>
              <input
                type="text"
                id="jobTitle"
                name="jobTitle"
                value={formData.jobTitle}
                onChange={handleChange}
                placeholder="e.g., House Cleaning"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            </div>

            <div className="form-group">
              <label htmlFor="jobCategory" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Job Category *</label>
              <select
                id="jobCategory"
                name="jobCategory"
                value={formData.jobCategory}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              >
                <option value="">Select a category...</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "20px" }}>
            <label htmlFor="jobDescription" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Job Description *</label>
            <textarea
              id="jobDescription"
              name="jobDescription"
              value={formData.jobDescription}
              onChange={handleChange}
              placeholder="Describe the work to be done..."
              rows="4"
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: "5px",
                fontSize: "14px",
                fontFamily: "inherit",
                boxSizing: "border-box",
                resize: "vertical",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#1976d2"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            ></textarea>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div className="form-group">
              <label htmlFor="workLocation" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Work Location *</label>
              <input
                type="text"
                id="workLocation"
                name="workLocation"
                value={formData.workLocation}
                onChange={handleChange}
                placeholder="e.g., Nairobi, Westlands"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            </div>

            <div className="form-group">
              <label htmlFor="numWorkersRequired" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Workers Needed *</label>
              <select
                id="numWorkersRequired"
                name="numWorkersRequired"
                value={formData.numWorkersRequired}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              >
                <option value="1">1 Worker</option>
                <option value="2">2 Workers</option>
                <option value="3">3 Workers</option>
                <option value="4">4 Workers</option>
                <option value="5">5+ Workers</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="form-group">
              <label htmlFor="startDate" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Start Date *</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            </div>

            <div className="form-group">
              <label htmlFor="completionDate" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Expected Completion Date *</label>
              <input
                type="date"
                id="completionDate"
                name="completionDate"
                value={formData.completionDate}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            </div>
          </div>
        </div>

        {/* PAYMENT INFORMATION */}
        <div style={{ padding: "28px", borderBottom: "1px solid #e0e0e0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>Payment Terms</h2>
              <p style={{ fontSize: "13px", color: "#666", margin: "6px 0 0 0" }}>Managers fund the full job amount into escrow. The platform commission is taken from the hustler payout after approval.</p>
            </div>
            <span style={{ alignSelf: "flex-start", padding: "6px 10px", borderRadius: "999px", backgroundColor: "#eef6ff", color: "#0f5ea8", fontSize: "12px", fontWeight: 700 }}>
              {commissionRateLabel} hustler commission
            </span>
          </div>

          {formData.paymentStructure === "single" && (
            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="amount" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Job Payment Amount (KES) *</label>
              <input
                type="text"
                inputMode="decimal"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleAmountChange}
                placeholder="e.g., 1000"
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid #d8dee8",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                onBlur={(e) => e.target.style.borderColor = "#d8dee8"}
              />
            </div>
          )}

          {formData.paymentStructure === "stages" && (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label htmlFor="numStages" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Number of Work Stages *</label>
                <select
                  id="numStages"
                  name="numStages"
                  value={formData.numStages}
                  onChange={handleChange}
                  required
                  style={{
                    width: "100%",
                    maxWidth: "200px",
                    padding: "12px 14px",
                    border: "1px solid #d8dee8",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                  onBlur={(e) => e.target.style.borderColor = "#d8dee8"}
                >
                  {Array.from({ length: 5 }, (_, i) => i + 2).map((num) => (
                    <option key={num} value={num}>{num} Stages</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label htmlFor="amount" style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Total Contract Amount (KES) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="amount"
                  name="amount"
                  value={formData.amount}
                  onChange={handleAmountChange}
                  placeholder="e.g., 10000"
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: "1px solid #d8dee8",
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                  onBlur={(e) => e.target.style.borderColor = "#d8dee8"}
                />
                <p style={{ fontSize: "12px", color: "#999", marginTop: "6px", margin: "6px 0 0 0" }}>This total must equal the sum of all work stage values below.</p>
              </div>
            </>
          )}

          <div style={{ border: "1px solid #d8dee8", borderRadius: "8px", overflow: "hidden", margin: "18px 0 22px", backgroundColor: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div style={{ padding: "16px", borderRight: "1px solid #eef1f5" }}>
                <div style={{ fontSize: "11px", color: "#687385", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Escrow funded by manager</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#111827", marginTop: "8px" }}>{hasPaymentAmount ? formatKes(amountValue) : "--"}</div>
                <div style={{ fontSize: "12px", color: "#687385", marginTop: "4px" }}>Held until completed work is approved</div>
              </div>
              <div style={{ padding: "16px", borderRight: "1px solid #eef1f5" }}>
                <div style={{ fontSize: "11px", color: "#687385", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Platform commission</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#111827", marginTop: "8px" }}>{hasPaymentAmount ? formatKes(hustlerFee) : "--"}</div>
                <div style={{ fontSize: "12px", color: "#687385", marginTop: "4px" }}>{commissionRateLabel} deducted at payout</div>
              </div>
              <div style={{ padding: "16px" }}>
                <div style={{ fontSize: "11px", color: "#687385", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Net to hustler</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#111827", marginTop: "8px" }}>{hasPaymentAmount ? formatKes(hustlerNet) : "--"}</div>
                <div style={{ fontSize: "12px", color: "#687385", marginTop: "4px" }}>Released after manager approval</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "12px", fontSize: "14px", fontWeight: "600", color: "#333" }}>Payment Type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
              {PAYMENT_TYPES.map((type) => (
                <label
                  key={type.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "12px 14px",
                    border: `1px solid ${formData.paymentType === type.value ? "#1976d2" : "#d8dee8"}`,
                    borderRadius: "8px",
                    backgroundColor: formData.paymentType === type.value ? "#eef6ff" : "#fff",
                    color: formData.paymentType === type.value ? "#0f5ea8" : "#333",
                    fontWeight: formData.paymentType === type.value ? 700 : 500,
                  }}
                >
                  <input
                    type="radio"
                    name="paymentType"
                    value={type.value}
                    checked={formData.paymentType === type.value}
                    onChange={handleChange}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "14px", padding: "14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #d8dee8" }}>
            <input
              type="checkbox"
              name="escrowConfirmation"
              checked={formData.escrowConfirmation}
              onChange={handleChange}
              required
              style={{ cursor: "pointer", width: "18px", height: "18px", marginTop: "2px", flexShrink: 0 }}
            />
            <span style={{ color: "#333", lineHeight: "1.5" }}>I confirm escrow will hold the contract amount, and the platform will collect a {commissionRateLabel} commission from the hustler payout when the job is approved.</span>
          </label>
        </div>

        {/* WORK STAGES - Only show for stages payment structure */}
        {formData.paymentStructure === "stages" && (
          <div style={{ padding: "28px", borderBottom: "1px solid #e0e0e0" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px", color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>Work Stages</h2>

            {formData.workStages.map((stage, index) => (
              <div
                key={index}
                style={{
                  padding: "18px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "6px",
                  marginBottom: "16px",
                  backgroundColor: "#fafbfc",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: "600", color: "#333", margin: 0 }}>Stage {index + 1}</h3>
                  {formData.workStages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWorkStage(index)}
                      style={{
                        color: "#d32f2f",
                        cursor: "pointer",
                        border: "none",
                        background: "none",
                        fontSize: "13px",
                        fontWeight: "500",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        transition: "background-color 0.2s",
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = "#ffebee"}
                      onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600", color: "#333" }}>Task Title *</label>
                  <input
                    type="text"
                    value={stage.title}
                    onChange={(e) => handleWorkStageChange(index, "title", e.target.value)}
                    placeholder="e.g., Walls and Floors"
                    required
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600", color: "#333" }}>Task Description *</label>
                  <textarea
                    value={stage.description}
                    onChange={(e) => handleWorkStageChange(index, "description", e.target.value)}
                    placeholder="Describe what will be done in this stage..."
                    rows="2"
                    required
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      resize: "vertical",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  ></textarea>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600", color: "#333" }}>Stage Value (KES) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={stage.amount}
                    onChange={(e) => handleStageAmountChange(index, e.target.value)}
                    placeholder="e.g., 2000"
                    required
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addWorkStage}
              style={{
                padding: "10px 16px",
                backgroundColor: "#e3f2fd",
                color: "#1976d2",
                border: "1px solid #1976d2",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "#bbdefb"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "#e3f2fd"}
            >
              + Add Work Stage
            </button>
          </div>
        )}

        {/* TERMS & CONDITIONS */}
        <div style={{ padding: "28px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px", color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>Terms & Conditions</h2>

          <div
            style={{
              padding: "16px",
              backgroundColor: "#f5f5f5",
              borderRadius: "5px",
              marginBottom: "20px",
              fontSize: "13px",
              lineHeight: "1.7",
              border: "1px solid #e0e0e0",
            }}
          >
            <p style={{ margin: "0 0 10px 0", fontWeight: "600", color: "#333" }}>Agreement Terms:</p>
            <ul style={{ marginLeft: "20px", marginTop: "0", marginBottom: "0", color: "#555" }}>
              <li style={{ marginBottom: "6px" }}>The worker agrees to complete the assigned tasks professionally and on time.</li>
              <li style={{ marginBottom: "6px" }}>Payment will only be released after you approve the completed work.</li>
              <li>Disputes shall be handled through the HUSTLERS platform dispute resolution process.</li>
            </ul>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "14px", padding: "12px", backgroundColor: "#f9f9f9", borderRadius: "5px", border: "1px solid #e0e0e0" }}>
            <input
              type="checkbox"
              name="termsAccepted"
              checked={formData.termsAccepted}
              onChange={handleChange}
              required
              style={{ cursor: "pointer", width: "18px", height: "18px", marginTop: "2px", flexShrink: 0 }}
            />
            <span style={{ color: "#333", lineHeight: "1.5" }}>I confirm the information provided is accurate and agree to the platform terms *</span>
          </label>
        </div>

        {/* BUTTONS */}
        <div style={{
          padding: "20px 28px",
          backgroundColor: "#fafbfc",
          borderTop: "1px solid #e0e0e0",
          display: "flex",
          gap: "12px",
          justifyContent: "flex-start",
        }}>
          <button
            type="submit"
            disabled={loading || editLoading}
            className="button-primary"
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: "600",
              borderRadius: "5px",
              border: "none",
              cursor: loading || editLoading ? "not-allowed" : "pointer",
              opacity: loading || editLoading ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {loading ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Changes" : "Create Job"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="button-secondary"
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: "600",
              borderRadius: "5px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#f5f5f5"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#fff"}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
