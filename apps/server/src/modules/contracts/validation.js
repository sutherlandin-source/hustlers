/**
 * Contracts Validation Rules
 * Validation schemas and rules for contract endpoints
 */

export const contractValidationRules = {
  create: [
    { field: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
    { field: "description", type: "string", required: true, minLength: 1, maxLength: 2000 },
    { field: "amount", type: "number", required: true, min: 0 },
    { field: "currency", type: "string", required: true, minLength: 3, maxLength: 3 },
    { field: "buyer", type: "string", required: false },
    { field: "seller", type: "string", required: false },
    { field: "numWorkers", type: "number", required: false, min: 1 },
    { field: "jobCategory", type: "string", required: false },
    { field: "workLocation", type: "string", required: false },
    { field: "paymentType", type: "string", required: false },
    { field: "milestones", type: "array", required: false },
  ],
  assign: [
    { field: "freelancerId", type: "string", required: true },
  ],
  prepareEscrow: [
    { field: "amount", type: "number", required: true, min: 0 },
  ],
  close: [],
};
