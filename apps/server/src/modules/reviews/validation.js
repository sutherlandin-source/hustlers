/**
 * Reviews Validation
 * Request validation rules for review endpoints
 */

const scoreRule = (field, required = true) => ({
  field,
  type: "number",
  required,
  min: 1,
  max: 5,
});

export const createReviewRules = [
  { field: "contractId", type: "string", required: true },
  { field: "revieweeId", type: "string", required: true },
  scoreRule("rating"),
  scoreRule("communication"),
  scoreRule("professionalism"),
  scoreRule("quality"),
  scoreRule("timeliness"),
  { field: "reviewText", type: "string", required: false, maxLength: 2000 },
];

export const updateReviewRules = [
  scoreRule("rating", false),
  scoreRule("communication", false),
  scoreRule("professionalism", false),
  scoreRule("quality", false),
  scoreRule("timeliness", false),
  { field: "reviewText", type: "string", required: false, maxLength: 2000 },
];
