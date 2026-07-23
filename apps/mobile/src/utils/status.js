export function formatStatusLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";

  const normalized = raw.toLowerCase().replace(/_/g, " ");
  const aliases = {
    accepted: "Accepted",
    assigned: "Assigned",
    active: "Active",
    completed: "Completed",
    cancelled: "Cancelled",
    in_progress: "In Progress",
    "in progress": "In Progress",
    pending: "Pending",
    submitted: "Submitted",
    work_submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    "needs revision": "Rejected",
    needs_revision: "Rejected",
    "payment secured": "Payment Secured",
    payment_secured: "Payment Secured",
    "payment released": "Payment Released",
    payment_released: "Payment Released",
    "refunded to manager": "Refunded to Manager",
    refunded_to_manager: "Refunded to Manager",
    "on hold": "On Hold",
    on_hold: "On Hold",
    disputed: "Disputed",
    open: "Open",
    closed: "Closed",
    resolved: "Resolved",
    "awaiting approval": "Awaiting Approval",
    awaiting_approval: "Awaiting Approval",
  };

  return aliases[normalized] || normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function matchesId(left, right) {
  if (!left || !right) return false;
  const leftId = typeof left === "object" ? left._id || left.id : left;
  const rightId = typeof right === "object" ? right._id || right.id : right;
  return String(leftId) === String(rightId);
}
