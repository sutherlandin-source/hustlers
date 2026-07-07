/**
 * Authentication Validation Rules
 * All validation schemas for auth endpoints
 */

import { USER_ROLES, VALIDATION_PATTERNS } from "../../shared/config/constants.js";

export const authValidation = {
  register: [
    { field: "email", type: "email", required: true },
    { field: "password", type: "string", required: true, minLength: 8 },
    { field: "firstName", type: "string", required: true, minLength: 2 },
    { field: "lastName", type: "string", required: true, minLength: 2 },
    { field: "phoneNumber", type: "string", required: true, pattern: VALIDATION_PATTERNS.KENYA_PHONE },
    {
      field: "role",
      type: "string",
      required: true,
      custom: (value) => [USER_ROLES.HUSTLER, USER_ROLES.MANAGER].includes(value),
    },
    { field: "idNumber", type: "string", required: true, minLength: 4 },
    { field: "mpesaNumber", type: "string", required: true, pattern: VALIDATION_PATTERNS.KENYA_PHONE },
    { field: "location", type: "string", required: true, minLength: 2 },
    { field: "skills", type: "array", required: false },
    { field: "bio", type: "string", required: false, minLength: 10, maxLength: 500 },
    { field: "experienceLevel", type: "string", required: false },
    { field: "companyName", type: "string", required: false },
    { field: "industry", type: "string", required: false, minLength: 2 },
  ],

  login: [
    { field: "email", type: "email", required: true },
    { field: "password", type: "string", required: true },
  ],

  refreshToken: [
    { field: "refreshToken", type: "string", required: true },
  ],

  passwordForgot: [
    { field: "email", type: "email", required: true },
  ],

  passwordReset: [
    { field: "email", type: "email", required: true },
    { field: "token", type: "string", required: true },
    { field: "password", type: "string", required: true, minLength: 8 },
  ],

  otpRequest: [
    { field: "email", type: "email", required: true },
  ],

  otpVerify: [
    { field: "email", type: "email", required: true },
    { field: "otpCode", type: "string", required: true, minLength: 4 },
  ],
};
