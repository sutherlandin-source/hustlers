/**
 * Wallets Validation Rules
 * Validation schemas and rules for wallet endpoints
 */

export const walletValidationRules = {
  create: [
    { field: "currency", type: "string", required: true, minLength: 3, maxLength: 3 },
    { field: "type", type: "string", required: false },
  ],
  deposit: [
    { field: "amount", type: "number", required: true, min: 0.01 },
    { field: "referenceId", type: "string", required: false },
  ],
  withdraw: [
    { field: "amount", type: "number", required: true, min: 0.01 },
    { field: "referenceId", type: "string", required: false },
  ],
  fund: [
    { field: "amount", type: "number", required: true, min: 0.01 },
    { field: "description", type: "string", required: false },
  ],
};
