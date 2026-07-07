/**
 * User Validation Rules
 * All validation schemas for user endpoints
 */

import { VALIDATION_PATTERNS } from "../../shared/config/constants.js";

export const userValidation = {
  updateProfile: [
    { field: "email", type: "email", required: false },
    { field: "phoneNumber", type: "string", required: false, pattern: VALIDATION_PATTERNS.KENYA_PHONE },
    { field: "bio", type: "string", required: false, minLength: 10, maxLength: 500 },
    { field: "location", type: "string", required: false, minLength: 2 },
    { field: "companyName", type: "string", required: false },
    { field: "industry", type: "string", required: false, minLength: 2 },
    { field: "skills", type: "array", required: false },
    { field: "experienceLevel", type: "string", required: false },
    { field: "avatar", type: "string", required: false },
  ],
};
