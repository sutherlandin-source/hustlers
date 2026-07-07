import { Router } from "express";
import { 
  createMilestone, 
  submitMilestone, 
  approveMilestone, 
  rejectMilestone, 
  getMilestone, 
  listMilestones,
  updateWorkStatus,
  requestRevision,
  getContractProgress
} from "../../controllers/milestoneController.js";
import { validate } from "../../middleware/validation.js";
import { authenticateToken } from "../../middleware/auth.js";

const router = Router({ mergeParams: true });

router.post(
  "/",
  authenticateToken,
  validate([
    { field: "title", type: "string", required: true, minLength: 3 },
    { field: "amount", type: "number", required: true },
  ]),
  createMilestone
);

router.post("/:id/submit", authenticateToken, validate([{ field: "submissionData", type: "object", required: true }]), submitMilestone);
router.post("/:id/approve", authenticateToken, approveMilestone);
router.post("/:id/reject", authenticateToken, validate([{ field: "reason", type: "string", required: true }]), rejectMilestone);
router.post("/:id/work-status", authenticateToken, validate([{ field: "workStatus", type: "string", required: true }]), updateWorkStatus);
router.post("/:id/request-revision", authenticateToken, validate([{ field: "reason", type: "string", required: true }]), requestRevision);

router.get("/:id", authenticateToken, getMilestone);
router.get("/", authenticateToken, listMilestones);
router.get("/contract/:contractId/progress", authenticateToken, getContractProgress);

export default router;
