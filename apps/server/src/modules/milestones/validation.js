/**
 * Milestones Validation Rules
 * Validation schemas and rules for milestone endpoints
 */

export const milestoneValidationRules = {
  create: [
    { field: "title", type: "string", required: true, minLength: 3 },
    { field: "description", type: "string", required: false },
    { field: "amount", type: "number", required: true, min: 0 },
    { field: "dueDate", type: "string", required: false },
  ],
  submit: [
    { field: "submissionData", type: "object", required: true },
  ],
  approve: [],
  reject: [
    { field: "reason", type: "string", required: true },
  ],
};
